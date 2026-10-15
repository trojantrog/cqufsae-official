const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};

export function projectWorkLabel(label,camera){
 const p=label.point.clone().project(camera);
 if(![p.x,p.y,p.z].every(Number.isFinite)||p.z< -1||p.z>1)return null;
 const edge=smooth((.94-Math.abs(p.x))/.12)*smooth((.88-Math.abs(p.y))/.16);
 return {left:(p.x+1)*50,top:(1-p.y)*50,opacity:clamp(label.opacity??1)*edge};
}

// Stable keys preserve each annotation while its own system fades. A label
// entering the viewport fades at the edge instead of toggling at one pixel.
export function createWorkLabels(layer){
 const nodes=new Map();layer.style.transitionProperty='opacity';layer.style.transitionTimingFunction='ease';
 function update(labels,camera,{suppressed=false,reduced=false}={}){
  layer.style.transitionDuration=reduced?'0ms':'180ms';
  layer.style.opacity=suppressed?'0':'1';
  const retained=new Set();let visible=0;
  for(const item of labels){
   const key=item.id||item.text;retained.add(key);
   let element=nodes.get(key);
   if(!element){element=layer.ownerDocument.createElement('span');element.dataset.labelId=key;layer.append(element);nodes.set(key,element);}
   if(element.textContent!==item.text)element.textContent=item.text;
   const projected=projectWorkLabel(item,camera);
   const alpha=projected?.opacity??0;element.style.opacity=String(alpha);element.hidden=alpha<=.00001;
   if(projected){element.style.left=`${projected.left}%`;element.style.top=`${projected.top}%`;}
   if(!element.hidden&&!suppressed)visible++;
  }
  for(const [key,element] of nodes)if(!retained.has(key)){element.remove();nodes.delete(key);}
  return {count:nodes.size,visible};
 }
 return {update,clear(){for(const element of nodes.values())element.remove();nodes.clear();}};
}
