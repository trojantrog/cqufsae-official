import * as T from './vendor/three.module.min.js';
import {sampleGeometry} from './camera-framing.js?v=751.2';
import {captureClock,captureAngularFrequency} from './cyclic-presentation-753.js?v=753';
import {readColumnMotion,solveColumnMotion,columnMembers} from './a08-column-754.js?v=754';

const V=(...a)=>new T.Vector3(...a),Q=()=>new T.Quaternion();
const clamp=x=>T.MathUtils.clamp(x,0,1);
const vector=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite)?V(...a):null;
const normalized=a=>{const v=vector(a);return v&&v.lengthSq()>1e-16?v.normalize():null;};
const smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const fixtureIds=new Set(['a08-steering-039','a08-steering-040']);

function readSliderCrank(data){
 if(!data)return null;
 const planeAxis=normalized(data.planeAxis),sliderAxis=normalized(data.sliderAxis),names=['pedalPivot','sliderPin','pedalPin'];
 const points=Object.fromEntries(names.map(name=>[name,vector(data[name])]));
 if(!planeAxis||!sliderAxis||Math.abs(planeAxis.dot(sliderAxis))>1e-5||Object.values(points).some(p=>!p)||!Number.isFinite(data.strokeMeters)||data.strokeMeters<0)return null;
 const workingStrokeMeters=data.workingStrokeMeters??data.strokeMeters;
 if(!Number.isFinite(workingStrokeMeters)||workingStrokeMeters<0||workingStrokeMeters>data.strokeMeters)return null;
 const a={...points,planeAxis,sliderAxis,bearingCenter:vector(data.bearingCenter),strokeMeters:data.strokeMeters,workingStrokeMeters,direction:data.direction??1};
 if(a.pedalPivot.distanceTo(a.pedalPin)<1e-8||a.sliderPin.distanceTo(a.pedalPin)<1e-8)return null;
 a.key=data.id||JSON.stringify(data);return a;
}

function rigidOperation(q,from,to=from){return new T.Matrix4().compose(to.clone().sub(from.clone().applyQuaternion(q)),q,V(1,1,1));}
function signedAngle(from,to,axis){const a=from.clone().addScaledVector(axis,-from.dot(axis)).normalize(),b=to.clone().addScaledVector(axis,-to.dot(axis)).normalize();return Math.atan2(axis.dot(a.clone().cross(b)),a.dot(b));}

// Each moving joint lies on a measured revolute axis. The axial offsets of
// paired pin centres are retained when their circles are solved in the plane.
function circleJoint(pivot,restJoint,otherPivot,otherLength,axis,branchReference){
 const planePivot=pivot.clone().addScaledVector(axis,restJoint.clone().sub(pivot).dot(axis));
 const axial=planePivot.clone().sub(otherPivot).dot(axis),otherPlane=otherPivot.clone().addScaledVector(axis,axial);
 const direction=otherPlane.clone().sub(planePivot),distance=direction.length(),radius=restJoint.distanceTo(planePivot);
 const secondRadiusSquared=otherLength*otherLength-axial*axial;
 if(distance<1e-10||secondRadiusSquared<0)return null;
 direction.divideScalar(distance);const x=(radius*radius-secondRadiusSquared+distance*distance)/(2*distance),heightSquared=radius*radius-x*x;
 if(heightSquared< -1e-12)return null;
 const across=axis.clone().cross(direction),centre=planePivot.clone().addScaledVector(direction,x),height=Math.sqrt(Math.max(0,heightSquared));
 const branch=Math.sign(branchReference.clone().sub(centre).dot(across))||1;
 return centre.addScaledVector(across,branch*height);
}

function solveSliderCrank(linkage,brake){
 const a=linkage,n=a.planeAxis,strokeMeters=clamp(brake)*a.workingStrokeMeters*a.direction;
 const slide=a.sliderAxis.clone().multiplyScalar(strokeMeters),sliderPin=a.sliderPin.clone().add(slide);
 const pedalPin=circleJoint(a.pedalPivot,a.pedalPin,sliderPin,a.sliderPin.distanceTo(a.pedalPin),n,a.pedalPin);
 if(!pedalPin)return {feasible:false,reason:'slider-crank-outside-reach',strokeMeters};
 const pedalAngle=signedAngle(a.pedalPin.clone().sub(a.pedalPivot),pedalPin.clone().sub(a.pedalPivot),n),pedalQ=Q().setFromAxisAngle(n,pedalAngle);
 const couplerQ=Q().setFromAxisAngle(n,signedAngle(a.pedalPin.clone().sub(a.sliderPin),pedalPin.clone().sub(sliderPin),n));
 const poses={slider:new T.Matrix4().makeTranslation(...slide.toArray()),pedal:rigidOperation(pedalQ,a.pedalPivot),coupler:rigidOperation(couplerQ,a.sliderPin,sliderPin)};
 const pinErrors=[a.sliderPin.clone().applyMatrix4(poses.coupler).distanceTo(sliderPin),a.pedalPin.clone().applyMatrix4(poses.coupler).distanceTo(pedalPin),a.pedalPin.clone().applyMatrix4(poses.pedal).distanceTo(pedalPin)];
 return {feasible:true,poses,pedalAngle,strokeMeters,capacityMeters:a.strokeMeters,workingStrokeMeters:a.workingStrokeMeters,linkLengthM:a.sliderPin.distanceTo(a.pedalPin),pedalRadiusM:a.pedalPivot.distanceTo(a.pedalPin),maximumPinErrorM:Math.max(...pinErrors)};
}

function systemOf(d){
 const explicit=String(d.a08System||d.system||d.subsystem||d.group||'').toLowerCase();
 const role=String(d.role||'').toLowerCase();
 if(d.contextRole==='electronics'||/electronics|controller|router|computer|receiver/.test(explicit+' '+role))return 'electronics';
 if(d.contextRole)return 'context';
 if(/status[-_ ]?light|assi/.test(role))return 'context';
 if(/sensor|sensing|lidar|radar|camera|perception/.test(explicit+' '+role))return 'sensing';
 if(/pneumat|bottle|tank|valve|regulator|gas|qiping|jianyafa/.test(explicit+' '+role))return 'pneumatics';
 if(/steer|servo|gearbox|coupling|column/.test(explicit+' '+role))return 'steering';
 if(/brake|ebs|cylinder|pushrod|pedal/.test(explicit+' '+role))return 'brakes';
 return 'context';
}

export function isA08PartRelevant(data,mode='driverless'){
 if(fixtureIds.has(data?.id))return false;
 if(data?.contextRole==='cable-unrouted')return false;
 const system=systemOf(data||{});
 if(mode==='algorithm')return system==='electronics'||/lidar|radar|camera|perception/.test(String(data?.role||'').toLowerCase());
 if(mode==='control')return ['steering','brakes','pneumatics','electronics'].includes(system);
 return true;
}
const relevant=(binding,request)=>isA08PartRelevant(binding.mesh.userData,request.mode);

// The imported position/normal/index buffers remain the original tessellation.
// Operating poses are rigid transforms in the installed assembly coordinates.
export function createA08Motion(root){
 const meshes=[],bindings=new Map(),ids=new Set(),framingByMode=new Map();
 let revision=0,contextParts={frame:0,sidepodShell:0,electronics:0},state={ready:false,parts:0,steeringAngle:0,brake:0,conditionTime:0};

 function makeBinding(mesh){
  const d=mesh.userData,spec=d.motion||{};
  mesh.updateMatrix();
  const installed=d.a08InstalledMatrix||mesh.matrix.toArray();
  d.a08InstalledMatrix??=installed.slice();
  const base=new T.Matrix4().fromArray(installed),position=V(),quaternion=Q(),scale=V();
  base.decompose(position,quaternion,scale);
  const axis=normalized(spec.axis||d.axis),pivot=vector(spec.pivot||d.pivot);
  const requestedType=spec.type||d.motionType||'fixed';
  const channel=spec.channel||d.motionChannel;
  const input=spec.input||d.motionInput||(channel==='brake'?'brake':'steeringColumnAngle');
  const gain=spec.gain??d.motionGain;
  const stroke=spec.strokeMeters??d.strokeMeters;
  const limits=spec.limits||d.motionLimits,validLimits=Array.isArray(limits)&&limits.length===2&&limits.every(Number.isFinite),linkage=readSliderCrank(spec.linkage||d.linkage),column=readColumnMotion(spec.column),member=spec.member||d.linkageMember;
  let type='fixed',reason='fixed-installation';
  if(requestedType==='steering-column'&&column&&channel==='steering'&&input==='rack'&&columnMembers.has(member)){
   type='steering-column';reason='native-cardan-axes-and-trunnion-phase';
  }else if(requestedType==='slider-crank'&&linkage&&channel==='brake'&&(['slider','coupler','pedal'].includes(member)||member==='bearing-slider'&&linkage.bearingCenter)){
   type='slider-crank';reason='native-slider-axis-and-revolute-joints';
  }else if(requestedType==='rotate'&&axis&&pivot&&channel&&Number.isFinite(gain)){
   type='rotate';reason='native-axis-and-input';
  }else if(requestedType==='translate'&&axis&&channel&&(Number.isFinite(stroke)&&stroke>=0||Number.isFinite(gain)&&validLimits)){
   type='translate';reason=Number.isFinite(gain)?'native-axis-and-length-input':'native-axis-and-stroke';
  }else if(requestedType!=='fixed')reason='motion-evidence-incomplete';
  const binding={mesh,base,position,quaternion,scale,axis,pivot,type,requestedType,channel,input,gain,stroke,linkage,column,member,
   reducerRatio:spec.reducerRatio,ratioBasis:spec.ratioBasis,outputRole:spec.outputRole||'steering-output-shaft',
   limits:validLimits?limits:null,
   direction:spec.direction??d.motionDirection??1,system:systemOf(d),reason,amount:0,
   anchor:vector(d.labelPoint||spec.labelPoint||d.center)||V(),operation:new T.Matrix4(),
   baseEmissive:mesh.material.emissive?.clone(),baseIntensity:mesh.material.emissiveIntensity||0};
  mesh.position.copy(position);mesh.quaternion.copy(quaternion);mesh.scale.copy(scale);
  mesh.userData.framingPoints??=sampleGeometry(mesh.geometry);
  return binding;
 }

 function append(list=[]){
  let added=0;
  for(const mesh of list){
   if(!mesh?.isMesh||mesh.userData.variant!=='a08'||ids.has(mesh.userData.id||mesh.uuid))continue;
   // These two original CAD parts belong to Steering_ASM/支具. They are
   // assembly positioning fixtures; retain every vehicle bracket and fastener.
   if(fixtureIds.has(mesh.userData.id)){mesh.visible=false;mesh.removeFromParent();continue;}
   ids.add(mesh.userData.id||mesh.uuid);meshes.push(mesh);bindings.set(mesh,makeBinding(mesh));
   root.add(mesh);added++;
  }
  if(added){revision++;framingByMode.clear();contextParts={frame:meshes.filter(m=>m.userData.contextRole==='frame').length,sidepodShell:meshes.filter(m=>m.userData.contextRole==='sidepod-shell').length,electronics:meshes.filter(m=>m.userData.contextRole==='electronics').length};state={...state,ready:true,parts:meshes.length};}
  return added;
 }

 function motorSource(binding){
  if(!Number.isFinite(binding.reducerRatio)||binding.reducerRatio<=0||!['illustrative','native'].includes(binding.ratioBasis)||!binding.axis||!binding.pivot)return null;
  for(const source of bindings.values()){
   if(source.mesh.userData.role!==binding.outputRole||source.type!=='rotate'||source.input==='motorAngle'||!source.axis||!source.pivot)continue;
   const alignment=source.axis.dot(binding.axis),offset=source.pivot.clone().sub(binding.pivot);
   if(Math.abs(alignment)>1-1e-7&&offset.addScaledVector(binding.axis,-offset.dot(binding.axis)).length()<1e-5)return {source,direction:Math.sign(alignment)};
  }
  return null;
 }

 function inputValue(binding,motion){
  if(binding.channel==='brake')return clamp(motion.brake||0);
  if(binding.input==='steer')return motion.steer||0;
  if(binding.input==='rack')return motion.rack??motion.chassis?.steering?.rack??motion.chassis?.rack??0;
  if(binding.input==='motorAngle'){
   if(Number.isFinite(motion.motorAngle))return motion.motorAngle;
   const drive=motorSource(binding);return drive?amountFor(drive.source,motion)*binding.reducerRatio*drive.direction:0;
  }
  if(binding.input==='steeringColumnAngle')return motion.chassis?.steering?.angle||0;
  return 0;
 }
 function inputAvailable(binding,motion){
  if(binding.channel==='brake')return Number.isFinite(motion.brake);
  if(binding.input==='steer')return Number.isFinite(motion.steer);
  if(binding.input==='rack')return Number.isFinite(motion.rack??motion.chassis?.steering?.rack??motion.chassis?.rack);
  if(binding.input==='motorAngle'){const drive=motorSource(binding);return Number.isFinite(motion.motorAngle)||!!drive&&inputAvailable(drive.source,motion);}
  if(binding.input==='steeringColumnAngle')return Number.isFinite(motion.chassis?.steering?.angle);
  return false;
 }

 function operation(binding,amount,solvedPose=null){
  if(binding.type==='rotate'){
   const q=Q().setFromAxisAngle(binding.axis,amount),p=binding.pivot.clone().sub(binding.pivot.clone().applyQuaternion(q));
   return new T.Matrix4().compose(p,q,V(1,1,1));
  }
  if(binding.type==='translate')return new T.Matrix4().makeTranslation(...binding.axis.clone().multiplyScalar(amount).toArray());
  if(binding.type==='steering-column')return (solvedPose||solveColumnMotion(binding.column,amount)).poses[binding.member].clone();
  if(binding.type==='slider-crank'){
   const result=solvedPose||solveSliderCrank(binding.linkage,amount);if(!result.feasible)return new T.Matrix4();
   if(binding.member==='bearing-slider'){
    // The inner balance bar retains its installed phase in the spherical
    // bearing. Only its measured centre follows the rotating outer socket.
    const centre=binding.linkage.bearingCenter,shift=centre.clone().applyMatrix4(result.poses.pedal).sub(centre);
    return new T.Matrix4().makeTranslation(...shift.toArray());
   }
   return result.poses[binding.member].clone();
  }
  return new T.Matrix4();
 }

 function amountFor(binding,motion){
  let amount=binding.type==='rotate'?inputValue(binding,motion)*binding.gain:
   binding.type==='translate'?inputValue(binding,motion)*(Number.isFinite(binding.gain)?binding.gain:binding.stroke)*binding.direction:
   binding.type==='steering-column'?inputValue(binding,motion):
   binding.type==='slider-crank'?inputValue(binding,motion):0;
  if(binding.limits)amount=T.MathUtils.clamp(amount,Math.min(...binding.limits),Math.max(...binding.limits));
  return amount;
 }

 function update(focus,motion,autonomousWeight,{animate=true}={}){
  const alpha=smooth(autonomousWeight),total=focus.reduce((sum,r)=>sum+(r.department==='driverless'?r.weight:0),0),linkagePoses=new Map(),columnPoses=new Map();
  for(const binding of bindings.values()){
   if(animate){
   binding.active=binding.type!=='fixed'&&inputAvailable(binding,motion);binding.amount=binding.active?amountFor(binding,motion):0;let linkagePose;
   if(binding.type==='slider-crank'){if(!linkagePoses.has(binding.linkage.key))linkagePoses.set(binding.linkage.key,solveSliderCrank(binding.linkage,binding.amount));linkagePose=linkagePoses.get(binding.linkage.key);}
   if(binding.type==='steering-column'){if(!columnPoses.has(binding.column.key))columnPoses.set(binding.column.key,solveColumnMotion(binding.column,binding.amount));linkagePose=columnPoses.get(binding.column.key);}
   binding.operation.copy(operation(binding,binding.amount,linkagePose));
   binding.mesh.position.copy(binding.position).applyMatrix4(binding.operation);
   binding.mesh.quaternion.copy(binding.quaternion);
   if(binding.type==='rotate')binding.mesh.quaternion.premultiply(Q().setFromAxisAngle(binding.axis,binding.amount));
   else if(binding.type==='slider-crank'||binding.type==='steering-column')binding.mesh.quaternion.premultiply(Q().setFromRotationMatrix(binding.operation));
   binding.mesh.scale.copy(binding.scale);
   }
   const sharp=total>1e-10?focus.reduce((sum,r)=>sum+(r.department==='driverless'&&relevant(binding,r)?r.weight:0),0)/total:0;
   const mesh=binding.mesh,context=mesh.userData.contextRole;
   const contextOpacity=context==='cable-unrouted'?0:context==='frame'?.22:context==='sidepod-shell'?.24:context==='sidepod-mount'?.40:context==='seat'?.12:null;
   const opacity=alpha*(contextOpacity??(.028+.972*sharp));
   mesh.userData.effectOpacity=opacity;mesh.userData.defocusWeight=contextOpacity!==null?.32:1-sharp;mesh.userData.defocus=mesh.userData.defocusWeight>.5;
   mesh.material.opacity=opacity;mesh.material.transparent=true;mesh.material.depthWrite=opacity>.9999;mesh.visible=opacity>.002;
   // The sensor bodies stay fixed. A small material response shows the shared
   // operating state without adding an undocumented scan head or air hose.
   if(binding.baseEmissive){
    mesh.material.emissive.copy(binding.baseEmissive);
    const activity=binding.system==='brakes'||binding.system==='pneumatics'?clamp(motion.brake||0):
     binding.system==='steering'?Math.min(1,Math.abs(motion.chassis?.steering?.angle||0)):
     binding.system==='sensing'?.35+.15*Math.sin(captureClock(motion,motion.conditionTime||0)*captureAngularFrequency(2,motion)):0;
    if(activity>0)mesh.material.emissive.lerp(new T.Color(0xb68148),activity*.16*sharp);
    mesh.material.emissiveIntensity=binding.baseIntensity+activity*.08*sharp;
   }
   if(animate)mesh.updateMatrix();
  }
  root.visible=meshes.length>0&&alpha>.002;
  state={ready:meshes.length>0,parts:meshes.length,contextParts:{...contextParts},steeringAngle:motion.chassis?.steering?.angle||0,
   brake:clamp(motion.brake||0),conditionTime:motion.conditionTime||0,
   movingParts:[...bindings.values()].filter(b=>b.active).map(b=>({id:b.mesh.userData.id,type:b.type,amount:b.amount})),
   pendingInputs:[...bindings.values()].filter(b=>b.requestedType!=='fixed'&&!b.active).map(b=>({id:b.mesh.userData.id,input:b.input,reason:b.reason==='motion-evidence-incomplete'?b.reason:'operating-input-unavailable'})),
   unsupportedMotion:[...bindings.values()].filter(b=>b.reason==='motion-evidence-incomplete').map(b=>b.mesh.userData.id),
   linkages:animate?[...linkagePoses].map(([id,result])=>({id,feasible:result.feasible,reason:result.reason,pedalAngle:result.pedalAngle,strokeMeters:result.strokeMeters,capacityMeters:result.capacityMeters,workingStrokeMeters:result.workingStrokeMeters,linkLengthM:result.linkLengthM,pedalRadiusM:result.pedalRadiusM,maximumPinErrorM:result.maximumPinErrorM})):state.linkages||[],
   steeringColumns:animate?[...columnPoses].map(([id,result])=>({id,lowerAngle:result.lowerAngle,middleAngle:result.middleAngle,upperAngle:result.upperAngle,maximumTrunnionDot:result.maximumTrunnionDot})):state.steeringColumns||[],frozenPose:!animate};
  return state;
 }

 function framingPoints(request={mode:'driverless'}){
  const key=request.mode||'driverless';if(framingByMode.has(key))return framingByMode.get(key);
  const points=[];
  for(const binding of bindings.values()){
   if(!relevant(binding,request))continue;
   const geometry=binding.mesh.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();
   const box=geometry.boundingBox,samples=[...sampleGeometry(geometry,64)];
   // Bounding corners are included so small mounting tabs and extreme native
   // vertices cannot be clipped by a uniform subsample of the CAD surface.
   for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])samples.push(V(x,y,z));
   const amounts=[0];
   if(binding.active!==false){
    if(binding.type==='translate')amounts.push(...(binding.limits||[binding.stroke*binding.direction]));
    if(binding.type==='rotate'&&binding.limits){for(let i=0;i<=8;i++)amounts.push(T.MathUtils.lerp(binding.limits[0],binding.limits[1],i/8));}
    if(binding.type==='slider-crank')for(let i=1;i<=32;i++)amounts.push(i/32);
    if(binding.type==='steering-column'&&binding.limits)for(let i=0;i<=32;i++)amounts.push(T.MathUtils.lerp(binding.limits[0],binding.limits[1],i/32));
   }
   for(const amount of amounts){const pose=operation(binding,amount).multiply(binding.base);for(const point of samples)points.push(point.clone().applyMatrix4(pose));}
  }
  framingByMode.set(key,points);return points;
 }

 function labelFor(system,text,request,prefer){
  const group=[...bindings.values()].filter(b=>b.system===system&&relevant(b,request));if(!group.length)return null;
  const binding=group.find(b=>prefer.test(String(b.mesh.userData.role||''))&&!/mount|bracket|support|fastener/.test(String(b.mesh.userData.role||'')))||group[0];
  return {text,point:binding.anchor.clone().applyMatrix4(binding.operation)};
 }

 function labels(request){
  const output=[labelFor('steering','自动转向机构',request,/servo|motor|gearbox/),
   labelFor('brakes','自动制动机构',request,/brake-cylinder-(body|rod)|brake-link|brake-rod-clevis/),
   labelFor('pneumatics','储气与阀组',request,/bottle|tank|qiping/)];
  const sensors=[...bindings.values()].filter(b=>b.system==='sensing'&&relevant(b,request));
  for(const [pattern,text] of [[/lidar|radar|helios/,'激光雷达'],[/camera|realsense|d435/i,'深度相机']]){
   const binding=sensors.find(b=>pattern.test(String(b.mesh.userData.role||'').toLowerCase())&&!/mount|bracket|support|fastener/.test(String(b.mesh.userData.role||'').toLowerCase()));
   if(binding)output.push({text,point:binding.anchor.clone().applyMatrix4(binding.operation)});
  }
  for(const [pattern,text]of [[/electronics-mcu/,'VCU'],[/computer|controller|ipc/,'侧箱计算盒'],[/router|receiver|res/,'通信与安全控制']]){
   const binding=[...bindings.values()].find(b=>b.system==='electronics'&&relevant(b,request)&&pattern.test(b.mesh.userData.role||''));
   if(binding)output.push({text,point:binding.anchor.clone().applyMatrix4(binding.operation)});
  }
  return output.filter(Boolean);
 }

 return {meshes,append,update,framingPoints,labels,focusMeshes:request=>meshes.filter(m=>relevant(bindings.get(m),request)),
  get revision(){return revision;},get hasNativeFrame(){return contextParts.frame>0;},diagnostics:()=>({...state,bindings:[...bindings.values()].map(b=>({id:b.mesh.userData.id,role:b.mesh.userData.role,system:b.system,type:b.active===false?'fixed':b.type,configuredType:b.requestedType,input:b.input,inputAvailable:b.active!==false,reason:b.type!=='fixed'&&b.active===false?'operating-input-unavailable':b.reason,axis:b.axis?.toArray(),pivot:b.pivot?.toArray(),strokeMeters:b.stroke,limits:b.limits,linkageMember:b.member,linkageId:b.linkage?.key,reducerRatio:b.reducerRatio,ratioBasis:b.ratioBasis,driveOutputId:b.input==='motorAngle'?motorSource(b)?.source.mesh.userData.id:undefined}))}),
  dispose(){for(const b of bindings.values()){b.mesh.position.copy(b.position);b.mesh.quaternion.copy(b.quaternion);b.mesh.scale.copy(b.scale);if(b.baseEmissive)b.mesh.material.emissive.copy(b.baseEmissive);b.mesh.material.emissiveIntensity=b.baseIntensity;b.mesh.updateMatrix();}root.clear();bindings.clear();ids.clear();meshes.length=0;framingByMode.clear();}
 };
}
