import * as T from './vendor/three.module.min.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const sourcePoint=m=>V(...m.userData.center);
const sourceId=n=>`suspension-${String(n).padStart(3,'0')}`;

// A hexagonal bolt head shifts the world-axis bounding-box centre away from its
// bore. Bounds in the two transverse directions retain the native pin axis.
// Choosing another point along that same axis leaves the revolute pose intact.
export function sourcePinCentre(mesh,axis,reference=sourcePoint(mesh)){
 const transverse=V(0,1,0).addScaledVector(axis,-axis.y).normalize(),normal=axis.clone().cross(transverse),position=mesh.geometry.attributes.position,p=V(),low=[Infinity,Infinity],high=[-Infinity,-Infinity];
 for(let i=0;i<position.count;i++){p.fromBufferAttribute(position,i);for(let j=0;j<2;j++){const value=p.dot(j?normal:transverse);low[j]=Math.min(low[j],value);high[j]=Math.max(high[j],value);}}
 return axis.clone().multiplyScalar(reference.dot(axis)).addScaledVector(transverse,(low[0]+high[0])*.5).addScaledVector(normal,(low[1]+high[1])*.5);
}

// Native C41 decoupler: Changebar x4, LM8SUU x8, two inner and two outer
// transfer frames. The two outer-frame spherical joints are on pins 135/141.
// Their source centres and all eight bearing bores share the slider direction.
// Each pair of rod shoulders seats in one outer frame; the opposite bearings
// permit axial sliding. Averaging the input rocker angles cannot close this
// prismatic chain. Both frames instead take the direction between the actual
// moving spherical joints, retaining each frame's measured assembled seat offset.
export function createRearDecoupler752({get,left,right}){
 const ids=[149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168];
 if(!left||!right||ids.some(n=>!get(sourceId(n)))||!get(sourceId(135))||!get(sourceId(141)))return null;
 const axis=left.axis.clone().add(right.axis).normalize(),rotation=new T.Quaternion(),sourceLeft=sourcePinCentre(get(sourceId(135)),axis),sourceRight=sourcePinCentre(get(sourceId(141)),axis),sourceDelta=sourceLeft.clone().sub(sourceRight),sourceDirection=sourceDelta.clone().normalize(),currentDirection=sourceDirection.clone();
 const carriers=new Map([
  [1,{rocker:left,source:sourceLeft,current:sourceLeft.clone(),ids:[155,156,157,158,159,160,161,162,163,164]}],
  [-1,{rocker:right,source:sourceRight,current:sourceRight.clone(),ids:[149,150,151,152,153,154,165,166,167,168]}]
 ]),bindings=new Map();
 for(const carrier of carriers.values())for(const n of carrier.ids)bindings.set(get(sourceId(n)),carrier);
 const point=(p,side)=>{const c=carriers.get(side);return p.clone().sub(c.source).applyQuaternion(rotation).add(c.current);};
 const sliderPairs=[[156,151,160,1],[157,152,163,1],[166,150,161,-1],[167,153,162,-1]];
 function sourceRange(mesh,origin){const a=mesh.geometry.attributes.position,p=V();let min=Infinity,max=-Infinity;for(let i=0;i<a.count;i++){const t=p.fromBufferAttribute(a,i).sub(origin).dot(sourceDirection);min=Math.min(min,t);max=Math.max(max,t);}return {min,max};}
 const sliders=sliderPairs.map(([id,a,b,side])=>{const origin=sourcePoint(get(sourceId(a))),range=sourceRange(get(sourceId(id)),origin);return {id,side,origin,range,bearings:[a,b].map(n=>{const mesh=get(sourceId(n)),p=sourcePoint(mesh),extent=sourceRange(mesh,p);return {id:n,side:bindings.get(mesh)===carriers.get(1)?1:-1,point:p,extent};})};});
 function update(){
  for(const c of carriers.values())c.current.copy(c.source).sub(c.rocker.pivot).applyQuaternion(c.rocker.q).add(c.rocker.pivot);
  currentDirection.copy(carriers.get(1).current).sub(carriers.get(-1).current).normalize();rotation.setFromUnitVectors(sourceDirection,currentDirection);
 }
 function applyPart(mesh){const c=bindings.get(mesh);if(!c)return false;mesh.quaternion.copy(rotation);mesh.position.copy(c.current).sub(c.source.clone().applyQuaternion(rotation));return true;}
 function diagnostics(){let radialError=0,minimumEngagement=Infinity;const rows=[];
  for(const slider of sliders){const origin=point(slider.origin,slider.side),bearings=slider.bearings.map(b=>{const p=point(b.point,b.side).sub(origin),axial=p.dot(currentDirection),radial=p.clone().cross(currentDirection).length(),engagement=Math.max(0,Math.min(slider.range.max,axial+b.extent.max)-Math.max(slider.range.min,axial+b.extent.min));radialError=Math.max(radialError,radial);minimumEngagement=Math.min(minimumEngagement,engagement);return {id:sourceId(b.id),radialError:radial,engagement};});rows.push({id:sourceId(slider.id),shoulderSide:slider.side,bearings});}
  return {type:'native-four-slider-prismatic',sourcePins:[sourceId(135),sourceId(141)],sourceDirection:sourceDirection.toArray(),currentDirection:currentDirection.toArray(),rotation:rotation.toArray(),sourceSpan:sourceDelta.length(),currentSpan:carriers.get(1).current.distanceTo(carriers.get(-1).current),radialError,minimumEngagement,sliders:rows};
 }
 update();return {meshes:[...bindings.keys()],point,update,applyPart,diagnostics};
}
