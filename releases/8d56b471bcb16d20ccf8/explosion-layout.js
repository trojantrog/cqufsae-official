import {Vector3,Quaternion} from './vendor/three.module.min.js';
const v=(x=0,y=0,z=0)=>new Vector3(x,y,z);
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
export const EXPLOSION_CORNER_TRIM=.018;
const tracks=new WeakMap();
// Covariance fit of the unchanged C41 near-front tyre; extraction retains
// the installed wheel phase and never scales the tyre, rim or hardware.
const frontAxis=v(.001107523771424118,.9993978523815862,.03468005256872109);
const frontWheelIds=new Set([...Array.from({length:20},(_,i)=>`suspension-${String(94+i).padStart(3,'0')}`),...Array.from({length:22},(_,i)=>`brakes-${String(21+i).padStart(3,'0')}`),'purchased-002','purchased-005']);
const frontWing=d=>d.id==='body-004'&&d.variant!=='e74';
function frontWingPosition(progress){const p=clamp(progress);return v(1.02*p,0,.045*p);}
function frontNeighbour(d){return d.variant!=='e74'&&['suspension','steering','brakes'].includes(d.group)&&d.center?.[0]>.25&&d.center?.[1]>.1&&!frontWheelIds.has(d.id);}
// Release the brake unions before the master cylinder or rear caliper moves.
// Match both position and orientation to the same C1 take-up after release.
function detachedBrakeProgress(d,p){
 if(d.variant==='e74'||!['brakes-002','purchased-007'].includes(d.id))return p;
 const t=clamp((p-.02)/.98),r=.04;return t<r?t*t*(2*r-t)/(r*r):t;
}
function frontWheelPosition(id,p){
 const at=frontAxis.clone().multiplyScalar(.84*smooth((p-.02)/.33)).addScaledVector(v(.70,-.30,.16),smooth((p-.30)/.70));
 // Keep the bead seated on its rim. Only the mechanically separable hub,
 // inner bearing races, disc, wheel flange and caliper move apart.
 if(id==='suspension-112'||id==='purchased-002')at.addScaledVector(frontAxis,.60*smooth((p-.46)/.44));
 else if(id==='suspension-113')at.addScaledVector(frontAxis,.80*smooth((p-.43)/.50));
 else if(['suspension-111','suspension-106','suspension-108'].includes(id)||/^brakes-(03[4-9]|04[0-2])$/.test(id))at.addScaledVector(frontAxis,.12*smooth((p-.78)/.22));
 else if(id==='purchased-005'||/^brakes-(02[1-9]|03[0-2])$/.test(id))at.addScaledVector(v(-.18,0,.025),smooth((p-.72)/.28));
 return at;
}
function bezier(points,t){const p=points.map(x=>x.clone());for(let n=p.length-1;n>0;n--)for(let i=0;i<n;i++)p[i].lerp(p[i+1],t);return p[0];}
function rotationBezier(points,t){const p=points.map(x=>x.clone());for(let n=p.length-1;n>0;n--)for(let i=0;i<n;i++)p[i].slerp(p[i+1],t);return p[0];}
function trackFor(d){
 if(tracks.has(d))return tracks.get(d);
 if(d.presentationBezier?.length>=3){
  const controls=d.presentationBezier.map(p=>v(...p)),arc=[0];let prior=controls[0];
  for(let j=1;j<=256;j++){const at=bezier(controls,j/256);arc.push(arc.at(-1)+at.distanceTo(prior));prior=at;}
  const length=arc.at(-1),points=[controls[0],controls.at(-1)],rotations=points.map((_,i)=>d.presentationRotations?new Quaternion().fromArray(d.presentationRotations[i?d.presentationRotations.length-1:0]):null);
  const track={points,rotations,distances:[0,length],segments:[{start:0,length,controls,arc,fromCoordinate:0,toCoordinate:length}],corners:[],length};tracks.set(d,track);return track;
 }
 const layout=d.presentationPath?null:explosionLayout(d),raw=(d.presentationPath||[[0,0,0],layout.coarse.toArray(),layout.coarse.clone().add(layout.detail).toArray()]);
 const points=[],rotations=[];
 raw.forEach((p,i)=>{const at=v(...p);if(!points.length||at.distanceTo(points.at(-1))>1e-7){points.push(at);rotations.push(d.presentationRotations?new Quaternion().fromArray(d.presentationRotations[Math.min(i,d.presentationRotations.length-1)]):null);}});
 const distances=[0];for(let i=1;i<points.length;i++)distances.push(distances.at(-1)+points[i].distanceTo(points[i-1]));
 const segments=[],corners=[];let length=0,cursor=points[0]||v(),coordinate=0;
 function addLine(to,endCoordinate){const n=cursor.distanceTo(to);if(n>1e-10){segments.push({start:length,length:n,a:cursor.clone(),b:to.clone(),fromCoordinate:coordinate,toCoordinate:endCoordinate});length+=n;}cursor=to;coordinate=endCoordinate;}
 for(let i=1;i<points.length-1;i++){
  const before=points[i].clone().sub(points[i-1]),after=points[i+1].clone().sub(points[i]),la=before.length(),lb=after.length(),incoming=before.clone().normalize(),outgoing=after.clone().normalize(),dot=incoming.dot(outgoing);
  if(dot>.999999){addLine(points[i],distances[i]);continue;}
  const trim=Math.min(EXPLOSION_CORNER_TRIM,la*.22,lb*.22),entry=points[i].clone().addScaledVector(incoming,-trim),exit=points[i].clone().addScaledVector(outgoing,trim);
  addLine(entry,distances[i]-trim);
  // Local Bezier controls stay in the short corner corridor. Straight legs
  // retain their audited route, with no free spline overshoot between them.
  let controls=[entry,points[i],exit],reversal=false;
  if(dot<-.985){const axes=[v(1,0,0),v(0,1,0),v(0,0,1)].sort((a,b)=>Math.abs(a.dot(incoming))-Math.abs(b.dot(incoming))),normal=incoming.clone().cross(axes[0]).normalize();controls=[entry,entry.clone().addScaledVector(incoming,trim),points[i].clone().addScaledVector(normal,trim),points[i].clone().addScaledVector(normal,-trim),exit.clone().addScaledVector(outgoing,-trim),exit];reversal=true;}
  const arc=[0];let prior=entry;for(let j=1;j<=256;j++){const at=bezier(controls,j/256);arc.push(arc.at(-1)+at.distanceTo(prior));prior=at;}
  const corner={start:length,length:arc.at(-1),controls,arc,fromCoordinate:distances[i]-trim,toCoordinate:distances[i]+trim,reversal};segments.push(corner);corners.push({index:i,trim});length+=corner.length;cursor=exit;coordinate=distances[i]+trim;
 }
 if(points.length>1)addLine(points.at(-1),distances.at(-1));
 const track={points,rotations,distances,segments,corners,length};tracks.set(d,track);return track;
}
function sample(track,distance){
 if(!track.segments.length)return {position:track.points[0]?.clone()||v(),coordinate:0};
 const at=Math.max(0,Math.min(track.length,distance));let s=track.segments.at(-1);for(const candidate of track.segments)if(at<=candidate.start+candidate.length){s=candidate;break;}
 const local=Math.max(0,Math.min(s.length,at-s.start));
 if(!s.controls){const u=local/s.length;return {position:s.a.clone().lerp(s.b,u),coordinate:s.fromCoordinate+(s.toCoordinate-s.fromCoordinate)*u};}
 let lo=0,hi=s.arc.length-1;while(hi-lo>1){const middle=(lo+hi)>>1;if(s.arc[middle]<local)lo=middle;else hi=middle;}
 const t=(lo+(local-s.arc[lo])/Math.max(1e-20,s.arc[hi]-s.arc[lo]))/(s.arc.length-1),u=s.reversal?3*t*t*t-4.5*t*t+2.5*t:t;
 return {position:bezier(s.controls,t),coordinate:s.fromCoordinate+(s.toCoordinate-s.fromCoordinate)*u};
}
function progressSample(d,progress){const track=trackFor(d);return {track,...sample(track,track.length*clamp(progress))};}
export function explosionLayout(d){
 d=d.explosionAssembly||d;
 if(frontWing(d)){const coarse=frontWingPosition(.5);return {coarse,detail:frontWingPosition(1).sub(coarse),stage:0};}
 if(frontWheelIds.has(d.id)){const coarse=frontWheelPosition(d.id,.5);return {coarse,detail:frontWheelPosition(d.id,1).sub(coarse),stage:0};}
 if(d.presentationPath){const points=d.presentationPath;const middle=points[Math.min(1,points.length-1)],end=points.at(-1);return {coarse:v(...middle),detail:v(...end).sub(v(...middle)),stage:d.presentationStage||0};}
 const {group:g,label:l,center:c,mechanism:r=''}=d;
 // The far side and the welded frame remain an assembly reference.
 if(g==='frame'||(c[1]<-.025&&g!=='body'))return {coarse:v(),detail:v(),stage:0};
 let a=v(),b=v(),stage=.12;
 if(g==='body'){
  stage=0;
  a=l==='前翼'?v(.55,0,.12):l==='后翼'?v(-.32,0,.60):l==='底板'?v(0,0,-.30):v(0,.12,.82);
 }else if(l==='轮胎'){a=v(0,.26,0);b=v(0,.47,0);}
 else if(l==='轮辋'){a=v(0,.26,0);b=v(0,.26,0);}
 else if(r.startsWith('wt-')){a=v(0,.20,0);b=v(0,.10,0);}
 else if(l.includes('制动盘')){a=v(0,.19,0);b=v(0,.22,0);}
 else if(r==='br-wheel_brakes'){a=v(-.04,.18,0);b=v(-.06,.05,0);}
 else if(r.includes('upright')){a=v(0,.18,0);b=v(0,.03,0);}
 else if(r.includes('uca')){a=v(0,.10,.09);b=v(0,.05,.05);}
 else if(r.includes('lca')){a=v(0,.10,-.04);b=v(0,.05,-.025);}
 else if(r.includes('damper')){a=v(0,.08,.14);b=v(0,.06,.04);}
 else if(g==='suspension'){a=v(0,.09,.04);b=v(0,.04,.025);}
 else if(r==='st-steering_wheel'){a=v(.04,0,.14);b=v(.06,0,.06);}
 else if(r==='st-tie_rods'){a=v(.07,.09,.05);b=v(.03,.08,.03);}
 else if(g==='steering'){a=v(0,0,.10);b=v(0,.04,.04);}
 else if(g==='brakes'){a=v(.07,0,.12);b=v(.04,.04,.04);}
 else if(r==='mo-exhaust'){a=v(-.04,.13,.16);b=v(-.03,.09,.05);}
 else if(r==='mo-intake'){a=v(0,0,.21);b=v(0,0,.08);}
 else if(r==='mo-cooling'){a=v(0,.13,.06);b=v(0,.10,.03);}
 else if(g==='engine'){a=v(0,0,.08);b=v(0,0,.04);}
 else if(r==='mo-halfshafts'){a=v(0,.13,.03);b=v(0,.09,.02);}
 else if(g==='transmission'){a=v(-.08,.06,.10);b=v(-.025,.035,.025);}
 if(l==='紧固件'||l==='轴承')b.add(v(0,c[1]>.02?.028:0,.018));
 return {coarse:a,detail:b,stage};
}
function routePosition(d,progress){
 return progressSample(d,progress).position;
}
function routeOrientation(d,progress){
 if(!d.presentationRotations)return null;
 const {track,coordinate}=progressSample(d,progress),{distances,rotations}=track;
 function at(s){let i=0;while(i<distances.length-2&&s>distances[i+1])i++;return rotations[i].clone().slerp(rotations[Math.min(i+1,rotations.length-1)],clamp((s-distances[i])/Math.max(1e-20,distances[Math.min(i+1,distances.length-1)]-distances[i])));}
 for(const {index,trim}of track.corners){const center=distances[index];if(coordinate>=center-trim&&coordinate<=center+trim){const a=at(center-trim),b=at(center+trim),middle=rotations[index];return rotationBezier([a,a.clone().slerp(middle,2/3),b.clone().slerp(middle,2/3),b],(coordinate-center+trim)/(2*trim));}}
 return at(coordinate);
}
export function explosionPosition(d,progress){
 d=d.explosionAssembly||d;
 if(frontWing(d))return frontWingPosition(progress);
 if(frontWheelIds.has(d.id))return frontWheelPosition(d.id,clamp(progress));
 return routePosition(d,frontNeighbour(d)?smooth((progress-.32)/.68):detachedBrakeProgress(d,progress));
}
export function explosionOrientation(d,progress){
 d=d.explosionAssembly||d;
 if(frontWing(d))return null;
 if(frontWheelIds.has(d.id))return null;
 return routeOrientation(d,frontNeighbour(d)?smooth((progress-.32)/.68):detachedBrakeProgress(d,progress));
}
export function explosionEnvelopePoints(meshes,assemblyMatrix){
 const out=[];
 for(const mesh of meshes){
  const data=mesh.userData,d=data.explosionAssembly||data,track=trackFor(d),pivot=v(...(d.presentationPivot||d.center||[0,0,0]));
  let source=data.framingPoints;
  if(!source?.length){const box=mesh.geometry.boundingBox;if(!box)continue;source=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])source.push(v(x,y,z));}
  const coordinated=frontWheelIds.has(d.id)||frontWing(d),poses=coordinated?Array.from({length:129},(_,i)=>({position:explosionPosition(d,i/128),rotation:null})):track.points.map((position,i)=>({position,rotation:track.rotations[i]}));
  // The control hull covers the local translation rounding. Include the
  // extraction corridor even when its final distribution is narrower.
  if(!coordinated){if(!d.presentationRotations)for(const segment of track.segments)for(const position of segment.controls||[])poses.push({position,rotation:null});
  else for(let i=0;i<=96;i++)poses.push({position:explosionPosition(d,i/96),rotation:explosionOrientation(d,i/96)});}
  for(const {position,rotation}of poses)for(const p of source){let at=p.clone();if(rotation)at.sub(pivot).applyQuaternion(rotation).add(pivot);at.add(position);if(assemblyMatrix)at.applyMatrix4(assemblyMatrix);out.push(at);}
 }
 return out;
}
