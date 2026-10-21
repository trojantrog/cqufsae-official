import * as T from './vendor/three.module.min.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion(),Y=V(0,1,0),clamp=x=>Math.max(-1,Math.min(1,x));

// The native export gives three discs and every floating rivet the generic
// wheel-brake label. These occurrences belong to WheelRotorF/R_ASM in the
// source assembly. Calipers, pistons, pads, bleed screws and upright mounts
// belong to the stationary side of the wheel end and retain their own poses.
const nativeBrakeDiscs=new Set([19,42,61,72]);
const nativeBrakeRivets=new Set([13,14,15,16,17,18,34,35,36,37,38,39,40,41,55,56,57,58,59,60,64,65,66,67,68,69,70,71]);
export function nativeWheelBrakeRole(data={}){
 if(data.mechanism!=='br-wheel_brakes'||data.variant==='e74'||data.variant==='a08'||!/^brakes-\d{3}$/.test(data.id||''))return null;
 const number=Number(data.id.slice(7));return nativeBrakeDiscs.has(number)?'disc':nativeBrakeRivets.has(number)?'floating-fastener':null;
}

// Fit source geometry once. Unique vertices prevent tessellation seams from
// weighting one side of a cylindrical member more heavily than the other.
function sourceAxis(mesh,major){
 const values=mesh.geometry.attributes.position,unique=new Map();
 for(let i=0;i<values.count;i++){const p=[values.getX(i),values.getY(i),values.getZ(i)].map(x=>Math.round(x*1e7)/1e7),key=p.join(',');if(!unique.has(key))unique.set(key,p);}
 const points=[...unique.values()],centre=points.reduce((p,v)=>p.add(V(...v)),V()).divideScalar(Math.max(1,points.length)),a=Array(9).fill(0),vectors=[1,0,0,0,1,0,0,0,1];
 for(const p of points){const d=[p[0]-centre.x,p[1]-centre.y,p[2]-centre.z];for(let i=0;i<3;i++)for(let j=0;j<3;j++)a[i*3+j]+=d[i]*d[j]/Math.max(1,points.length-1);}
 for(let step=0;step<36;step++){
  let p=0,q=1;for(const [i,j]of [[0,2],[1,2]])if(Math.abs(a[i*3+j])>Math.abs(a[p*3+q])){p=i;q=j;}
  const off=a[p*3+q];if(Math.abs(off)<1e-16)break;
  const tau=(a[q*3+q]-a[p*3+p])/(2*off),t=(tau>=0?1:-1)/(Math.abs(tau)+Math.sqrt(1+tau*tau)),c=1/Math.sqrt(1+t*t),s=t*c;
  a[p*3+p]-=t*off;a[q*3+q]+=t*off;a[p*3+q]=a[q*3+p]=0;
  for(let r=0;r<3;r++)if(r!==p&&r!==q){const ap=a[r*3+p],aq=a[r*3+q];a[r*3+p]=a[p*3+r]=c*ap-s*aq;a[r*3+q]=a[q*3+r]=s*ap+c*aq;}
  for(let r=0;r<3;r++){const vp=vectors[r*3+p],vq=vectors[r*3+q];vectors[r*3+p]=c*vp-s*vq;vectors[r*3+q]=s*vp+c*vq;}
 }
 const order=[0,1,2].sort((i,j)=>a[i*3+i]-a[j*3+j]),index=order[major?2:0],axis=V(vectors[index],vectors[3+index],vectors[6+index]).normalize();if(axis.y<0)axis.negate();
 let min=Infinity,max=-Infinity;for(const p of points){const at=V(...p).sub(centre).dot(axis);min=Math.min(min,at);max=Math.max(max,at);}
 return {centre,axis,min,max,uniqueVertices:points.length,eigenvalues:order.map(i=>a[i*3+i])};
}

function rigid(mesh,rotation,sourcePivot,currentPivot){mesh.quaternion.copy(rotation);mesh.position.copy(currentPivot).sub(sourcePivot.clone().applyQuaternion(rotation));mesh.scale.setScalar(1);}

export function createDrivelineKinematics(meshes,{corners=[],rotors=new Set()}={}){
 const root=new T.Group();root.name='native-driveline-kinematics';const byId=new Map(meshes.map(m=>[m.userData.id,m])),bindings=new Map(),joints=[],wheels=[];
 const carrier=byId.get('transmission-046'),carrierCentre=carrier?V(...carrier.userData.center):V(-.962,0,.270);
 for(const corner of corners){const wheel=meshes.find(m=>m.userData.label==='轮胎'&&(m.userData.center[0]>0)===corner.front&&Math.sign(m.userData.center[1])===corner.side);if(!wheel)continue;const fit=sourceAxis(wheel,false);wheels.push({corner,wheel,fit,frame:Q(),q:Q(),current:fit.centre.clone(),offset:V()});}
 for(const mesh of meshes){const brakeRole=nativeWheelBrakeRole(mesh.userData);if(!rotors.has(mesh)&&!brakeRole)continue;const point=V(...mesh.userData.center),wheel=wheels.reduce((best,w)=>!best||point.distanceToSquared(w.corner.c)<point.distanceToSquared(best.corner.c)?w:best,null);if(wheel)bindings.set(mesh,{wheel,type:'wheel',brakeRole});}
 for(const [side,innerNumber,shaftNumber,outerNumber,cupNumber]of [[1,79,80,81,56],[-1,84,82,83,55]]){
  const id=n=>'transmission-'+String(n).padStart(3,'0'),inner=byId.get(id(innerNumber)),shaft=byId.get(id(shaftNumber)),outer=byId.get(id(outerNumber)),cup=byId.get(id(cupNumber)),corner=corners.find(c=>!c.front&&c.side===side),wheel=meshes.find(m=>m.userData.label==='轮胎'&&m.userData.center[0]<0&&Math.sign(m.userData.center[1])===side);
  if(!inner||!shaft||!outer||!cup||!corner||!wheel)continue;
  const wheelRow=wheels.find(w=>w.corner===corner),shaftFit=sourceAxis(shaft,true),innerFit=sourceAxis(inner,false),outerFit=sourceAxis(outer,false),wheelFit=wheelRow.fit;
  const shaftAtY=y=>shaftFit.centre.clone().addScaledVector(shaftFit.axis,(y-shaftFit.centre.y)/Math.max(1e-8,shaftFit.axis.y)),innerJoint=shaftAtY(innerFit.centre.y),outerJoint=shaftAtY(outerFit.centre.y),wheelJoint=wheelFit.centre.clone().addScaledVector(wheelFit.axis,outerJoint.clone().sub(wheelFit.centre).dot(wheelFit.axis));
  const cupJoint=V(carrierCentre.x,innerJoint.y,carrierCentre.z),span=innerJoint.distanceTo(outerJoint),joint={side,inner,shaft,outer,cup,corner,wheel,wheelRow,shaftFit,innerFit,outerFit,wheelFit,innerJoint,outerJoint,wheelJoint,cupJoint,span,innerCurrent:innerJoint.clone(),outerCurrent:wheelJoint.clone(),axis:shaftFit.axis.clone(),plunge:0,valid:true,shaftQ:Q(),innerQ:Q(),outerQ:Q(),cupQ:Q(),inboardAngle:0,outboardAngle:0};
  joints.push(joint);for(const [mesh,type]of [[inner,'inner'],[shaft,'shaft'],[outer,'outer'],[cup,'cup']])bindings.set(mesh,{joint,type});
 }
 function update(){
  for(const w of wheels){const c=w.corner,s=c.solved;if(!s)continue;const kingpin=c.upper.outer.clone().sub(c.lower.outer).normalize(),turn=Q().setFromAxisAngle(kingpin,c.steer||0);w.frame.copy(s.uprightQ).multiply(turn);w.q.copy(w.frame).multiply(Q().setFromAxisAngle(w.fit.axis,c.spin||0));w.current.copy(w.fit.centre).sub(c.lower.outer).applyQuaternion(w.frame).add(s.lower);w.offset??=V();w.offset.copy(w.current).sub(w.fit.centre.clone().applyQuaternion(w.q));}
  for(const j of joints){
   const c=j.corner,s=c.solved;if(!s)continue;
   const spin=Number.isFinite(c.spin)?c.spin:0,frame=j.wheelRow.frame;
   // Joint centres follow the upright; spin around the measured wheel axle
   // leaves the outboard centre fixed on that axle.
   const follow=p=>p.clone().sub(c.lower.outer).applyQuaternion(frame).add(s.lower);
   j.outerCurrent.copy(follow(j.wheelJoint));
   // A rigid shaft joins the outboard sphere to an inboard centre constrained
   // to the cup's output axis. Solve the axial slide from the measured span.
   const delta=j.outerCurrent.clone().sub(j.cupJoint),transverse2=delta.x*delta.x+delta.z*delta.z,remaining=j.span*j.span-transverse2;
   j.valid=remaining>=0;j.plunge=delta.y-j.side*Math.sqrt(Math.max(0,remaining));j.innerCurrent.copy(j.cupJoint).addScaledVector(Y,j.plunge);
   j.axis.copy(j.outerCurrent).sub(j.innerCurrent).normalize().multiplyScalar(j.side);
   j.shaftQ.setFromUnitVectors(j.shaftFit.axis,j.axis).multiply(Q().setFromAxisAngle(j.shaftFit.axis,spin));
   j.innerQ.setFromUnitVectors(j.innerFit.axis,j.axis).multiply(Q().setFromAxisAngle(j.innerFit.axis,spin));
   j.outerQ.setFromUnitVectors(j.outerFit.axis,j.axis).multiply(Q().setFromAxisAngle(j.outerFit.axis,spin));
   j.cupQ.setFromAxisAngle(Y,spin);
   j.inboardAngle=Math.acos(clamp(j.axis.dot(Y)));j.outboardAngle=Math.acos(clamp(j.axis.dot(j.wheelFit.axis.clone().applyQuaternion(frame))));
  }
 }
 function applyPart(mesh){const binding=bindings.get(mesh);if(!binding)return false;if(binding.type==='wheel'){const w=binding.wheel;mesh.quaternion.copy(w.q);mesh.position.copy(w.offset);mesh.scale.setScalar(1);return true;}const j=binding.joint;
  if(binding.type==='shaft')rigid(mesh,j.shaftQ,j.outerJoint,j.outerCurrent);
  else if(binding.type==='inner')rigid(mesh,j.innerQ,j.innerJoint,j.innerCurrent);
  else if(binding.type==='outer')rigid(mesh,j.outerQ,j.outerJoint,j.outerCurrent);
  else if(binding.type==='cup')rigid(mesh,j.cupQ,j.cupJoint,j.cupJoint);
  return true;
 }
 function hideLegacyHelpers(chassisRoot){for(const child of chassisRoot.children)if(child.name==='rear-left-plunging-spline'||child.name==='rear-right-plunging-spline')child.visible=false;}
 const diagnostics=()=>({
  basis:'Rigid native source meshes; covariance-fit shaft and wheel axes; spherical CV centres and axial cup sliding form an illustrative geometric model.',
  assumptions:['The cup output axis follows vehicle Y at the native carrier centre.','Inner and outer members share the corresponding wheel phase as an ideal constant-velocity joint.','CV travel and articulation are calculated from this displayed suspension condition; real travel limits and torque capacity remain unmeasured.'],
  sourceIds:[...bindings.keys()].map(m=>m.userData.id),
  wheelBrakes:[...bindings].filter(([,b])=>b.brakeRole).map(([m,b])=>({sourceId:m.userData.id,role:b.brakeRole,wheelId:b.wheel.wheel.userData.id,front:b.wheel.corner.front,side:b.wheel.corner.side,spin:b.wheel.corner.spin})),
  wheels:wheels.map(w=>({sourceId:w.wheel.userData.id,front:w.corner.front,side:w.corner.side,sourceAxis:w.fit.axis.toArray(),currentAxis:w.fit.axis.clone().applyQuaternion(w.frame).toArray(),sourceAxlePoint:w.fit.centre.toArray(),currentAxlePoint:w.current.toArray(),spin:w.corner.spin,steer:w.corner.steer})),
  halfshafts:joints.map(j=>({side:j.side,sourceIds:{shaft:j.shaft.userData.id,inner:j.inner.userData.id,outer:j.outer.userData.id,cup:j.cup.userData.id,wheel:j.wheel.userData.id},native:{shaftAxis:j.shaftFit.axis.toArray(),wheelAxis:j.wheelFit.axis.toArray(),shaftAxisPoint:j.shaftFit.centre.toArray(),innerJoint:j.innerJoint.toArray(),outerJoint:j.outerJoint.toArray(),jointSpan:j.span,shaftAxialExtent:j.shaftFit.max-j.shaftFit.min,uniqueShaftVertices:j.shaftFit.uniqueVertices},registration:{outerOffset:j.wheelJoint.clone().sub(j.outerJoint).toArray(),outerDistance:j.wheelJoint.distanceTo(j.outerJoint),innerOffset:j.cupJoint.clone().sub(j.innerJoint).toArray(),innerDistance:j.cupJoint.distanceTo(j.innerJoint)},inner:j.innerCurrent.toArray(),outer:j.outerCurrent.toArray(),shaftAxis:j.axis.toArray(),baseLength:j.span,length:j.innerCurrent.distanceTo(j.outerCurrent),plunge:j.plunge,outwardPlunge:j.plunge*j.side,inboardArticulation:j.inboardAngle,outboardArticulation:j.outboardAngle,wheelPhase:j.corner.spin,rigidScale:1,valid:j.valid}))
 });
 return {root,update,owns:mesh=>bindings.has(mesh),applyPart,hideLegacyHelpers,diagnostics,dispose(){root.clear();}};
}
