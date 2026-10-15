import {Vector3,Quaternion} from './vendor/three.module.min.js';
import {explosionPosition,explosionOrientation} from './explosion-layout.js?v=742';

// Extraction corridors are tied to installed spatial slots, not to the identity
// of a link which can circulate around the chain. Keep all original rigid links.
export function createChainExtraction(links,bindings,curve,length){
 const count=links.length,alignmentEnd=.04,Y=new Vector3(0,1,0);
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
 function nativeShape(mesh){
  const a=mesh.geometry.attributes.position.array,n=a.length/3;
  let x=0,z=0,loY=Infinity,hiY=-Infinity;
  for(let i=0;i<a.length;i+=3){x+=a[i];z+=a[i+2];loY=Math.min(loY,a[i+1]);hiY=Math.max(hiY,a[i+1]);}
  x/=n;z/=n;let xx=0,xz=0,zz=0;
  for(let i=0;i<a.length;i+=3){const dx=a[i]-x,dz=a[i+2]-z;xx+=dx*dx;xz+=dx*dz;zz+=dz*dz;}
  return {angle:.5*Math.atan2(2*xz,xx-zz),kind:Math.round((hiY-loY)*10000)};
 }
 const ordered=links.map(mesh=>({mesh,data:mesh.userData,binding:bindings.get(mesh),...nativeShape(mesh)}));
 const index=new Map(links.map((mesh,i)=>[mesh,i]));
 const wrap=s=>((s%length)+length)%length;
 let lastDistance=NaN,shift=0,residuals=[];
 function selectSlots(distance){
  if(distance===lastDistance)return;
  lastDistance=distance;let best=Infinity;
  // A cyclic assignment preserves one link per slot even when the native pitch
  // varies slightly. Independent nearest-neighbour assignments can duplicate slots.
  for(let offset=0;offset<count;offset++){
   let score=0;
   for(let i=0;i<count;i++){
    if(ordered[i].kind!==ordered[(i+offset)%count].kind){score=Infinity;break;}
    const current=wrap(ordered[i].binding.s+distance),target=ordered[(i+offset)%count].binding.s;
    const delta=wrap(current-target+length*.5)-length*.5;score+=delta*delta;
   }
   if(score<best){best=score;shift=offset;}
  }
  residuals=ordered.map((entry,i)=>{
   const s=wrap(entry.binding.s+distance),target=ordered[(i+shift)%count];
   return curve.getPointAt(s/length).distanceTo(target.binding.centre);
  });
 }
 function apply(mesh,distance,progress){
  const i=index.get(mesh);if(i===undefined)return false;
  const entry=ordered[i],binding=entry.binding,start=wrap(binding.s+distance);
  if(progress<=0){
   const at=curve.getPointAt(start/length),tangent=curve.getTangentAt(start/length);
   mesh.quaternion.setFromUnitVectors(binding.tangent,tangent);
   mesh.position.copy(at).sub(binding.centre.clone().applyQuaternion(mesh.quaternion));return true;
  }
  selectSlots(distance);
  const slot=ordered[(i+shift)%count],delta=wrap(slot.binding.s-start+length*.5)-length*.5;
  const alignment=smooth(progress/alignmentEnd),s=wrap(start+delta*alignment),at=curve.getPointAt(s/length);
  const curveRotation=new Quaternion().setFromUnitVectors(binding.tangent,curve.getTangentAt(s/length));
  const targetCurveRotation=new Quaternion().setFromUnitVectors(binding.tangent,slot.binding.tangent);
  const curveAngle=2*Math.atan2(targetCurveRotation.y,targetCurveRotation.w),axisDifference=entry.angle-slot.angle;
  const nativeAngle=axisDifference+Math.round((curveAngle-axisDifference)/Math.PI)*Math.PI;
  const nativeRotation=new Quaternion().setFromAxisAngle(Y,nativeAngle);
  const correction=nativeRotation.clone().multiply(targetCurveRotation.clone().invert());
  mesh.quaternion.copy(new Quaternion().slerp(correction,alignment).multiply(curveRotation));
  mesh.position.copy(at).sub(binding.centre.clone().applyQuaternion(mesh.quaternion));
  // Align around the chain loop while extraction is already advancing. The
  // quintic correction reaches zero velocity and acceleration at alignmentEnd;
  // the slot corridor keeps its nonzero arc speed through that same point.
  const routeProgress=Math.max(0,Math.min(1,progress));
  const rotation=explosionOrientation(slot.data,routeProgress);
  if(rotation){
   const pivot=new Vector3(...(slot.data.presentationPivot||slot.data.center));
   mesh.position.applyQuaternion(rotation).add(pivot).sub(pivot.clone().applyQuaternion(rotation));
   mesh.quaternion.premultiply(rotation);
  }
  mesh.position.add(explosionPosition(slot.data,routeProgress));
  return true;
 }
 return {apply,has:mesh=>index.has(mesh),diagnostics(distance){selectSlots(distance);return {links:count,shift,alignmentEnd,maxSlotResidual:Math.max(0,...residuals),assignments:ordered.map((entry,i)=>({id:entry.data.id,slot:ordered[(i+shift)%count].data.id,kind:entry.kind,residual:residuals[i]}))};}};
}
