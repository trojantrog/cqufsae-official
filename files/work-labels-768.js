const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const NS='http://www.w3.org/2000/svg';
export function projectWorkLabel(label,camera){
 if(label.unlinked)return {left:label.screenAnchor[0]*100,top:label.screenAnchor[1]*100,opacity:clamp(label.opacity??1)};
 const p=label.point.clone().project(camera);
 if(![p.x,p.y,p.z].every(Number.isFinite)||p.z< -1||p.z>1)return null;
 const edge=smooth((1.06-Math.abs(p.x))/.10)*smooth((1.04-Math.abs(p.y))/.12);
 return {left:(p.x+1)*50,top:(1-p.y)*50,opacity:clamp(label.opacity??1)*edge};
}

// Stable screen-space cards; only their attachment points follow the mechanisms.
export function createWorkLabels(layer,{getObstacles=()=>[]}={}){
 const doc=layer.ownerDocument,nodes=new Map(),svg=doc.createElementNS(NS,'svg');
 const story=layer.closest('.explorer'),sticky=story?.querySelector('.showcase-sticky');
 const tray=doc.createElement('div');tray.className='annotation-tray';layer.append(svg,tray);
 const technicalTray=doc.createElement('section');technicalTray.className='engineering-notes';technicalTray.hidden=true;technicalTray.setAttribute('aria-label','仿真、标定与工程任务');layer.append(technicalTray);
 const dock=doc.createElement('section');dock.className='recruitment-dock';dock.hidden=true;dock.setAttribute('aria-label','当前部门的组别与工作');sticky?.append(dock);
 const dockHeader=doc.createElement('div');dockHeader.className='recruitment-dock-header';
 const dockTitle=doc.createElement('p');dockTitle.textContent='各组主要工作';
 const dockControls=doc.createElement('div');dockControls.className='recruitment-dock-controls';
 const prev=doc.createElement('button'),next=doc.createElement('button'),count=doc.createElement('output');
 prev.type=next.type='button';prev.textContent='←';next.textContent='→';prev.setAttribute('aria-label','上一项介绍');next.setAttribute('aria-label','下一项介绍');
 dockControls.append(prev,count,next);dockHeader.append(dockTitle,dockControls);dock.append(dockHeader);
 const scrollStatus=()=>{const cards=[...tray.children].filter(n=>!n.inert);if(!cards.length)return;const r=tray.getBoundingClientRect(),visible=cards.map((card,index)=>({index,rect:card.getBoundingClientRect()})).filter(({rect})=>rect.left+rect.width*.5>=r.left&&rect.left+rect.width*.5<=r.right).map(c=>c.index+1);const first=visible[0]||1,last=visible.at(-1)||first;count.textContent=`${first===last?first:first+'–'+last} / ${cards.length}`;prev.disabled=tray.scrollLeft<2;next.disabled=tray.scrollLeft>=tray.scrollWidth-tray.clientWidth-3;};
 const step=direction=>tray.scrollBy({left:direction*((tray.firstElementChild?.getBoundingClientRect().width||cardWidth)+14),behavior:layer.dataset.reduced==='true'?'instant':'smooth'});
 prev.addEventListener('click',()=>step(-1));next.addEventListener('click',()=>step(1));tray.addEventListener('scroll',scrollStatus,{passive:true});
 tray.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();step(event.key==='ArrowLeft'?-1:1);}});
 svg.classList.add('annotation-leaders');svg.setAttribute('aria-hidden','true');
 layer.classList.add('recruitment-annotations');layer.removeAttribute('aria-hidden');layer.setAttribute('role','region');layer.setAttribute('aria-label','当前系统与各组工作');
 let width=0,height=0,dirty=true,lastKey='',frames=0,hidden=false,placementPending=true,readyFrames=0,lastPlacement=[];
 let safeTop=12,cardWidth=286,gutter=36,compact=false,forceRail=false,viewportKey='',frameKey='';
 let framingRect=null,detailView=false;
 const modelHost=doc.getElementById('vehicle-canvas');
 let viewport={x:0,y:0,w:1,h:1};
 const observer=new ResizeObserver(()=>{dirty=true;});observer.observe(layer);
 const info=doc.getElementById('showcase-info');if(info)observer.observe(info);
 function element(tag,className,text){const el=doc.createElement(tag);el.className=className;if(text)el.textContent=text;return el;}
 function create(item){
  const card=element('article','component-note');card.dataset.annotation=item.id;card.dataset.recruitGroup=item.group||'';card.dataset.kind=item.kind||'group';
  if(item.kind==='technical')card.classList.add('component-note-technical');
  const heading=element('h3','component-note-title',item.title),system=element('p','component-note-system',item.system),copy=element('p','component-note-purpose',item.purpose);
  heading.id=item.id+'-title';card.setAttribute('aria-labelledby',heading.id);
  const work=element('div','component-note-work'),caption=element('p','component-note-caption','主要工作'),list=element('ul','component-note-tasks');
  if(item.showSystems){card.dataset.systems='true';for(const row of item.systems){const li=element('li','component-note-system-task');li.append(element('b','',row.name),element('div','',row.work));list.append(li);}}
  else for(const text of item.work||[])list.append(element('li','',text));
  work.append(caption,list);card.append(system,heading,copy);if(item.kind!=='technical')card.append(work);
  const line=doc.createElementNS(NS,'path'),dot=doc.createElementNS(NS,'circle'),halo=doc.createElementNS(NS,'circle');
  line.setAttribute('class','annotation-leader');dot.setAttribute('class','annotation-point');dot.setAttribute('r','2.5');halo.setAttribute('class','annotation-point-ring');halo.setAttribute('r','5.5');
  svg.append(line,halo,dot);tray.append(card);
  const node={card,line,dot,halo,item,alpha:0,screen:null,x:0,y:0,placed:false,side:'left',retired:0,height:150};nodes.set(item.id,node);dirty=true;return node;
 }
 function disposeNode(node){node.card.remove();node.line.remove();node.dot.remove();node.halo.remove();nodes.delete(node.item.id);}
 function measure(){
  const r=layer.getBoundingClientRect();width=r.width;height=r.height;
  compact=!!sticky&&(innerWidth<=1050||innerHeight<=820||forceRail);
  gutter=Math.min(70,Math.max(24,width*.035));cardWidth=Math.min(310,Math.max(278,(width-gutter*2)*.191));if(compact)cardWidth=innerWidth>650?Math.min(350,width*.334):innerWidth-48;
  const infoRect=info?.getBoundingClientRect();
  if(sticky&&infoRect){technicalTray.style.left=(infoRect.right-r.left+28)+'px';technicalTray.style.right=gutter+'px';technicalTray.style.top=(infoRect.top-r.top)+'px';}
  const taskBottom=technicalTray.hidden?0:technicalTray.getBoundingClientRect().bottom;
  safeTop=infoRect?Math.max(18,Math.max(infoRect.bottom,taskBottom)-r.top+18):20;
  layer.style.setProperty('--annotation-width',cardWidth+'px');dock.style.setProperty('--annotation-width',cardWidth+'px');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const model=modelHost?.getBoundingClientRect();viewport=model?{x:model.left-r.left,y:model.top-r.top,w:model.width,h:model.height}:{x:0,y:0,w:width,h:height};
 }
 function mode(active){
  const sizeKey=innerWidth+'x'+innerHeight;if(sizeKey!==viewportKey){viewportKey=sizeKey;forceRail=false;}
  const rail=!!sticky&&(innerWidth<=1050||innerHeight<=820||forceRail)&&active;
  const nextLayout=!sticky?'none':rail?'rail':active?(detailView?'detail':'orbit'):'none';
  if(story)story.dataset.annotationDetail=String(detailView);
  if(story&&story.dataset.annotationLayout!==nextLayout){story.dataset.annotationLayout=nextLayout;dirty=true;placementPending=true;readyFrames=0;for(const node of nodes.values()){node.placed=false;node.alpha=0;paint(node,0);}}
  const parent=rail?dock:layer;if(tray.parentNode!==parent){parent.append(tray);tray.scrollLeft=0;dirty=true;}
  dock.hidden=!rail||hidden;dock.inert=dock.hidden;
  technicalTray.hidden=hidden||rail||detailView||![...nodes.values()].some(n=>n.item.kind==='technical');
  if(sticky)story.dataset.annotationSide=String(rail&&(innerWidth>=900||innerWidth>650&&innerHeight<=550));
  if(sticky&&story.dataset.mode==='system'){
   const nav=doc.getElementById('showcase-bottom')?.getBoundingClientRect(),s=sticky.getBoundingClientRect(),i=info?.getBoundingClientRect();
   sticky.style.setProperty('--recruitment-nav-space',Math.max(70,nav?s.bottom-nav.top+12:150)+'px');
   sticky.style.setProperty('--recruitment-stage-top',Math.max(130,i?i.bottom-s.top+10:160)+'px');
  }
 }
 function prepare(camera){
  if(!sticky)return;
  measure();
  const origin=sticky.getBoundingClientRect(),nav=doc.getElementById('showcase-bottom').getBoundingClientRect(),intro=info.getBoundingClientRect();
  const taskBottom=technicalTray.hidden?0:technicalTray.getBoundingClientRect().bottom;
  const top=Math.max(100,Math.max(intro.bottom,taskBottom)-origin.top+20),bottom=nav.top-origin.top-18,layout=story.dataset.annotationLayout;
  let rect;
  if(story.dataset.mode!=='system'){
   framingRect=null;camera.userData.recruitmentFraming=false;
   if(frameKey!=='overview'){camera.clearViewOffset();frameKey='overview';}
   return;
  }
  if(layout==='orbit'){
   const edge=gutter+cardWidth+18;
   rect={x:edge,y:top,w:width-edge*2,h:Math.max(80,bottom-top)};
  }else if(layout==='rail'){
   const side=story.dataset.annotationSide==='true';
   const natural=Math.max(0,...[...nodes.values()].map(n=>n.card.offsetHeight))+58;
   const available=bottom-top;
   const readingBudget=Math.max(156,available*.382,natural);
   dock.style.maxHeight=(side?Math.max(156,bottom-70):readingBudget)+'px';
   const railHeight=Math.min(natural,readingBudget);
   sticky.style.setProperty('--recruitment-dock-height',railHeight+'px');
   const r=dock.getBoundingClientRect();
   rect=side?{x:gutter,y:top,w:r.left-origin.left-gutter-24,h:Math.max(78,bottom-top)}:{x:gutter,y:top,w:width-gutter*2,h:Math.max(80,r.top-origin.top-top-16)};
  }else if(width>650){
   const left=intro.right-origin.left+28;
   rect={x:left,y:110,w:Math.max(180,width-left-gutter),h:Math.max(90,bottom-110)};
  }else rect={x:gutter,y:top,w:width-gutter*2,h:Math.max(100,bottom-top)};
  rect=Object.fromEntries(Object.entries(rect).map(([key,value])=>[key,Math.round(value)]));
  framingRect=rect;const key=JSON.stringify([width,height,rect]);
  if(key!==frameKey){
   frameKey=key;camera.userData.recruitmentFraming=true;
   camera.userData.annotationPaddingX=Math.max(.08,rect.w/width*.92);
   camera.userData.annotationPaddingY=Math.max(.08,rect.h/height*.90);
   camera.setViewOffset(width,height,width*.5-rect.x-rect.w*.5,height*.5-rect.y-rect.h*.5,width,height);
  }
 }
 function solve(active,camera){
  measure();if(!width||!height)return;
  active=active.filter(n=>!n.card.hidden);
  if(compact){
   for(const node of active){node.card.style.width=cardWidth+'px';node.card.style.transform='none';node.card.tabIndex=0;node.height=node.card.offsetHeight;node.placed=true;}
   const maxHeight=Math.max(0,...active.map(n=>n.height));sticky?.style.setProperty('--recruitment-dock-height',(maxHeight+58)+'px');
   scrollStatus();lastPlacement=[];return;
  }
  if(sticky){
   if(detailView){
    const origin=layer.getBoundingClientRect(),intro=info.getBoundingClientRect(),nav=doc.getElementById('showcase-bottom').getBoundingClientRect();
    let y=intro.bottom-origin.top+12;const bottom=nav.top-origin.top-18;
    const records=active.map(node=>{node.card.style.width=intro.width+'px';node.height=node.card.offsetHeight;return {node,h:node.height};});
    if(records.reduce((sum,item)=>sum+item.h+12,0)>bottom-y){forceRail=true;mode(true);solve(active,camera);return;}
    lastPlacement=[];
    for(const {node,h} of records){node.x=intro.left-origin.left;node.y=y;node.placed=true;node.card.tabIndex=0;node.card.style.transform=`translate3d(${node.x}px,${y}px,0)`;lastPlacement.push({id:node.item.id,x:node.x,y,w:intro.width,h});y+=h+12;}
    return;
   }
   for(const node of active.filter(n=>n.item.kind==='technical')){node.card.style.width='auto';node.card.style.transform='none';node.card.tabIndex=0;node.height=node.card.offsetHeight;node.placed=true;}
   active=active.filter(n=>n.item.kind!=='technical');
   measure();
   // Keep cards outside the subject's framing envelope while the background
   // continues across the complete canvas, including behind the glass.
   const items=active.map(node=>{node.card.tabIndex=-1;node.card.style.width=cardWidth+'px';node.height=node.card.offsetHeight;return {node,h:node.height};});
   const nav=doc.getElementById('showcase-bottom').getBoundingClientRect(),origin=sticky.getBoundingClientRect();
   const top=Math.max(18,safeTop),bottom=nav.top-origin.top-18,gap=12;
   let best=null;
   for(let mask=0;mask<(1<<items.length);mask++){
    const columns=[[],[]];items.forEach((item,i)=>columns[(mask>>i)&1].push(item));
    if(items.length>1&&columns.some(c=>!c.length))continue;
    let cost=0;const rects=[];
    for(let side=0;side<2;side++){
     const column=columns[side],total=column.reduce((sum,i)=>sum+i.h,0)+Math.max(0,column.length-1)*gap;
     if(total>bottom-top){cost=Infinity;break;}
     column.sort((a,b)=>(a.node.screen?.top||50)-(b.node.screen?.top||50));
     let y=top+(bottom-top-total)*.5;
     for(const item of column){const x=side?width-gutter-cardWidth:gutter,a=item.node.screen;cost+=Math.abs((a?.left||50)*width/100-(x+cardWidth*.5));rects.push({id:item.node.item.id,x,y,w:cardWidth,h:item.h,distance:0});y+=item.h+gap;}
    }
    if(Number.isFinite(cost)&&(!best||cost<best.cost))best={cost,rects};
   }
   // Viewports that cannot fit full columns use the accessible reading rail.
   if(!best){forceRail=true;mode(true);solve(active,camera);return;}
   lastPlacement=best.rects;
   for(const rect of lastPlacement){const node=nodes.get(rect.id);node.x=rect.x;node.y=rect.y;node.placed=true;node.card.style.transform=`translate3d(${rect.x}px,${rect.y}px,0)`;}
   return;
  }
  const origin=layer.getBoundingClientRect(),reserved=[];
  for(const id of ['showcase-info','condition-readout','flow-legend']){const el=doc.getElementById(id);if(!el||el.hidden||getComputedStyle(el).display==='none')continue;const r=el.getBoundingClientRect();if(r.width&&r.height)reserved.push({x:r.left-origin.left,y:r.top-origin.top,w:r.width,h:r.height});}
  const obstacles=[];
  for(const mesh of getObstacles()){
   if(!mesh.geometry||!mesh.visible)continue;let visible=true;for(let p=mesh.parent;p;p=p.parent)if(!p.visible){visible=false;break;}if(!visible)continue;
   const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(!mats.some(m=>m?.visible!==false&&m?.opacity>.35))continue;
   if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;if(!b)continue;
   mesh.updateWorldMatrix(true,false);const p=mesh.position.clone(),lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];
   for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){p.set(x,y,z).applyMatrix4(mesh.matrixWorld).project(camera);if(p.z< -1||p.z>1)continue;const px=(p.x+1)*width*.5,py=(1-p.y)*height*.5;lo[0]=Math.min(lo[0],px);lo[1]=Math.min(lo[1],py);hi[0]=Math.max(hi[0],px);hi[1]=Math.max(hi[1],py);}
   if(!Number.isFinite(lo[0])||hi[0]<=0||hi[1]<=0||lo[0]>=width||lo[1]>=height)continue;
   const bw=hi[0]-lo[0],bh=hi[1]-lo[1];
   if(Math.max(bw,bh)<75){obstacles.push({x:lo[0]-4,y:lo[1]-4,w:bw+8,h:bh+8});continue;}
   // Large curved harnesses have mostly empty bounding rectangles. Sample
   // actual triangles so that nearby empty space remains available to notes.
   const positions=mesh.geometry.attributes.position,indices=mesh.geometry.index,triangles=Math.floor((indices?.count||positions.count)/3),samples=Math.min(triangles,Math.max(18,Math.min(88,Math.ceil(bw*bh/600))));
   for(let i=0;i<samples;i++){
    const triangle=Math.floor((i+.37)*triangles/samples)*3,tlo=[Infinity,Infinity],thi=[-Infinity,-Infinity];let clipped=false;
    for(let corner=0;corner<3;corner++){
     const vertex=indices?indices.getX(triangle+corner):triangle+corner;p.fromBufferAttribute(positions,vertex).applyMatrix4(mesh.matrixWorld).project(camera);if(p.z< -1||p.z>1){clipped=true;break;}
     const px=(p.x+1)*width*.5,py=(1-p.y)*height*.5;tlo[0]=Math.min(tlo[0],px);tlo[1]=Math.min(tlo[1],py);thi[0]=Math.max(thi[0],px);thi[1]=Math.max(thi[1],py);
    }
    if(!clipped)obstacles.push({x:tlo[0]-6,y:tlo[1]-6,w:thi[0]-tlo[0]+12,h:thi[1]-tlo[1]+12});
   }
  }
  const items=active.filter(n=>n.screen).map(node=>{node.card.tabIndex=-1;node.card.style.width=cardWidth+'px';node.height=node.card.offsetHeight||200;return {id:node.item.id,w:cardWidth,h:node.height,anchor:{x:node.screen.left*width/100,y:node.screen.top*height/100}};});
  lastPlacement=layoutAnnotationCards(items,{width,height,gutter,reserved,obstacles});
  for(const rect of lastPlacement){
   const node=nodes.get(rect.id);node.x=rect.x;node.y=rect.y;node.placed=true;node.distance=rect.distance;node.card.style.transform=`translate3d(${rect.x}px,${rect.y}px,0)`;
  }
 }
 function paint(node,alpha){
  const opacity=alpha.toFixed(3);node.card.style.opacity=opacity;node.line.style.opacity=opacity;node.dot.style.opacity=opacity;node.halo.style.opacity=opacity;
  const visible=alpha>.025&&!hidden;node.card.inert=!visible;node.card.style.visibility=visible?'visible':'hidden';node.line.style.visibility=node.dot.style.visibility=node.halo.style.visibility=visible&&!compact&&!node.item.unlinked?'visible':'hidden';
 }
 function update(labels,camera,{suppressed=false,reduced=false,layoutReady=true,detail=false,dt=1/60}={}){
  if(detailView!==detail){detailView=detail;dirty=true;}
  hidden=suppressed;if(suppressed)labels=[];layer.classList.toggle('is-suppressed',suppressed);layer.dataset.reduced=String(reduced);dock.dataset.reduced=String(reduced);
  camera.updateMatrixWorld();
  const key=labels.map(l=>l.id).join('|');if(key!==lastKey){for(const node of [...nodes.values()])disposeNode(node);dirty=true;forceRail=false;lastKey=key;placementPending=true;readyFrames=0;tray.scrollLeft=0;}
  mode(labels.length>0&&!suppressed);
  readyFrames=layoutReady?readyFrames+1:0;
  const retained=new Set(),active=[];
  for(const item of labels){retained.add(item.id);const node=nodes.get(item.id)||create(item);node.item=item;node.retired=0;node.screen=projectWorkLabel(item,camera);if(node.screen&&!item.unlinked&&width&&height){node.screen.left=(viewport.x+node.screen.left*viewport.w/100)/width*100;node.screen.top=(viewport.y+node.screen.top*viewport.h/100)/height*100;}active.push(node);}
  technicalTray.hidden=hidden||compact||detailView||!active.some(n=>n.item.kind==='technical');
  technicalTray.style.setProperty('--task-columns',Math.max(1,active.filter(n=>n.item.kind==='technical').length));
  for(const node of active){
   const hide=detailView&&!compact&&node.item.kind!=='technical';if(node.card.hidden!==hide){node.card.hidden=hide;dirty=true;}
   const parent=sticky&&!compact&&!detailView&&node.item.kind==='technical'?technicalTray:tray;
   if(node.card.parentNode!==parent){parent.append(node.card);dirty=true;}
  }
  const arrived=readyFrames>=3&&labels.some(l=>(l.opacity??1)>.98);
  if(dirty&&(!placementPending||arrived)){solve(active,camera);dirty=false;placementPending=false;}let visible=0;
  for(const [id,node]of nodes){
   if(!retained.has(id)){node.retired+=Math.min(.1,dt);node.alpha=reduced?0:node.alpha*Math.exp(-dt*22);paint(node,node.alpha);if(node.retired>.24)disposeNode(node);continue;}
   const target=suppressed||node.card.hidden||!node.placed?0:compact?clamp(node.item.opacity??1):(node.screen?.opacity??0),rate=target<node.alpha?24:10;node.alpha=reduced?target:node.alpha+(target-node.alpha)*(1-Math.exp(-Math.min(.1,dt)*rate));paint(node,node.alpha);if(node.alpha>.025&&!suppressed)visible++;
   if(compact||node.item.unlinked)continue;
   const p=node.screen;if(!p)continue;
   const x=p.left*width/100,y=p.top*height/100,edge=annotationAttachment({x:node.x,y:node.y,w:cardWidth,h:node.height},{x,y});node.side=edge.side;node.card.dataset.side=edge.side;
   const path=`M ${edge.x.toFixed(1)} ${edge.y.toFixed(1)} L ${(edge.x+edge.dx*14).toFixed(1)} ${(edge.y+edge.dy*14).toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
   if(node.line.getAttribute('d')!==path)node.line.setAttribute('d',path);
   for(const mark of [node.dot,node.halo]){mark.setAttribute('cx',x.toFixed(1));mark.setAttribute('cy',y.toFixed(1));}
   node.card.dataset.anchorSource=node.item.anchorSource||'';
  }
  layer.dataset.annotationCount=String(visible);if(compact&&frames%12===0)scrollStatus();frames++;return {count:nodes.size,visible};
 }
 return {update,prepare,resize(){dirty=true;placementPending=true;readyFrames=0;frameKey='';},diagnostics:()=>({width,height,compact,detailView,frames,framingRect,placement:lastPlacement,labels:[...nodes.values()].map(n=>({id:n.item.id,kind:n.item.kind||'group',alpha:n.alpha,x:n.x,y:n.y,width:cardWidth,height:n.height,screen:n.screen,source:n.item.anchorSource}))}),clear(){for(const node of [...nodes.values()])disposeNode(node);lastKey='';dirty=true;},dispose(){observer.disconnect();this.clear();svg.remove();dock.remove();tray.remove();technicalTray.remove();}};
}
import {annotationAttachment,layoutAnnotationCards} from './annotation-layout-768.js?v=770';
