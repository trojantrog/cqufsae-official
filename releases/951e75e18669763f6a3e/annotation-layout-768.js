const bounded=(x,a,b)=>Math.min(Math.max(x,a),Math.max(a,b));
const area=(a,b,pad=0)=>Math.max(0,Math.min(a.x+a.w+pad,b.x+b.w)-Math.max(a.x-pad,b.x))*Math.max(0,Math.min(a.y+a.h+pad,b.y+b.h)-Math.max(a.y-pad,b.y));
const turn=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const crosses=(a,b,c,d)=>turn(a,b,c)*turn(a,b,d)<0&&turn(c,d,a)*turn(c,d,b)<0;
const crossesCard=(a,b,r)=>{
 const p=[{x:r.x-8,y:r.y-8},{x:r.x+r.w+8,y:r.y-8},{x:r.x+r.w+8,y:r.y+r.h+8},{x:r.x-8,y:r.y+r.h+8}];
 return p.some((c,i)=>crosses(a,b,c,p[(i+1)%4]));
};

export function annotationAttachment(rect,point){
 const choices=[
  {x:rect.x,y:bounded(point.y,rect.y+16,rect.y+rect.h-16),dx:-1,dy:0,side:'left'},
  {x:rect.x+rect.w,y:bounded(point.y,rect.y+16,rect.y+rect.h-16),dx:1,dy:0,side:'right'},
  {x:bounded(point.x,rect.x+16,rect.x+rect.w-16),y:rect.y,dx:0,dy:-1,side:'top'},
  {x:bounded(point.x,rect.x+16,rect.x+rect.w-16),y:rect.y+rect.h,dx:0,dy:1,side:'bottom'}
 ];
 return choices.sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0];
}

// Solve only when a system arrives or the viewport changes. A coarse coverage
// map keeps cards clear of opaque mechanisms without per-frame ray casting.
export function layoutAnnotationCards(items,{width,height,gutter=24,reserved=[],obstacles=[]}){
 if(!items.length)return [];
 const cols=56,rows=32,cw=width/cols,ch=height/rows,coverage=new Uint8Array(cols*rows);
 const cellRange=r=>[bounded(Math.floor(r.x/cw),0,cols-1),bounded(Math.floor(r.y/ch),0,rows-1),bounded(Math.ceil((r.x+r.w)/cw),0,cols),bounded(Math.ceil((r.y+r.h)/ch),0,rows)];
 for(const rect of obstacles){const [x0,y0,x1,y1]=cellRange(rect);for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)coverage[y*cols+x]=1;}
 function occupied(rect){const [x0,y0,x1,y1]=cellRange(rect);let n=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)n+=coverage[y*cols+x];return n/Math.max(1,(x1-x0)*(y1-y0));}
 const landmarks=items.map(i=>({x:i.anchor.x-25,y:i.anchor.y-25,w:50,h:50}));
 const candidates=items.map(item=>{
  const list=[],seen=new Set(),a=item.anchor,w=item.w,h=item.h;
  function add(x,y){
   x=Math.round(bounded(x,gutter,width-gutter-w)/4)*4;y=Math.round(bounded(y,18,height-42-h)/4)*4;
   const key=x+','+y;if(seen.has(key))return;seen.add(key);
   const rect={x,y,w,h};if(reserved.some(r=>area(rect,r,12)>0)||landmarks.some(r=>area(rect,r,8)>0))return;
   const edge=annotationAttachment(rect,a),distance=Math.hypot(edge.x-a.x,edge.y-a.y);
   const coverage=occupied(rect),crossesCenter=a.x<width*.40&&x+w*.5>width*.60||a.x>width*.60&&x+w*.5<width*.40;
   list.push({...rect,id:item.id,anchor:a,edge,distance,coverage,cost:distance+coverage*16000+(coverage>0?1800:0)+(crossesCenter?160:0)+Math.abs(y+h*.5-a.y)*.08});
  }
  for(let gap=32;gap<Math.max(width,height)*.60;gap+=48){
   for(const shift of [-.75,-.5,-.2]){add(a.x-w-gap,a.y+h*shift);add(a.x+gap,a.y+h*shift);}
   for(const shift of [-.8,-.5,-.2]){add(a.x+w*shift,a.y-h-gap);add(a.x+w*shift,a.y+gap);}
  }
  for(let y=20;y<height-h-40;y+=40){add(gutter,y);add(width-gutter-w,y);}
  // Include open space between the anchor's radial candidates. Restricting
  // candidates to rows through the anchor can miss a clear space above a wheel.
  for(let y=20;y<height-h-40;y+=40)for(let x=gutter;x<width-gutter-w;x+=56)add(x,y);
  list.sort((a,b)=>a.cost-b.cost);
  // Keep distinct surrounding positions so a nearby card cannot consume all
  // alternatives of the next card. The beam evaluates the complete composition.
  const diverse=[];for(const candidate of list){if(diverse.every(r=>Math.hypot(r.x-candidate.x,r.y-candidate.y)>36))diverse.push(candidate);if(diverse.length===56)break;}
  if(!diverse.length)diverse.push({id:item.id,x:gutter,y:Math.max(18,height-h-42),w,h,cost:1e6,distance:0});return diverse;
 });
 const order=items.map((_,i)=>i).sort((a,b)=>candidates[a].length-candidates[b].length||items[b].h-items[a].h);
 let beam=[{cost:0,rects:[]}];
 for(const index of order){const next=[];for(const state of beam)for(const rect of candidates[index]){
  const overlap=state.rects.reduce((sum,r)=>sum+area(rect,r,18),0),crossings=rect.edge?state.rects.filter(r=>r.edge&&crosses(rect.anchor,rect.edge,r.anchor,r.edge)).length:0;
  const blockedLeaders=rect.edge?state.rects.filter(r=>r.edge&&(crossesCard(rect.anchor,rect.edge,r)||crossesCard(r.anchor,r.edge,rect))).length:0;
  next.push({cost:state.cost+rect.cost+overlap*20+crossings*1200+blockedLeaders*5000,rects:[...state.rects,rect]});
 }next.sort((a,b)=>a.cost-b.cost);beam=next.slice(0,36);}
 return beam[0].rects;
}
