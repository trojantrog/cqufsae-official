import * as T from './vendor/three.module.min.js';

const clamp=x=>T.MathUtils.clamp(x,0,1),finite=Number.isFinite;
const vector=value=>Array.isArray(value)&&value.length===3&&value.every(finite);
const matrix=value=>Array.isArray(value)&&value.length===16&&value.every(finite);
const forbiddenRole=/shift|emergency|e-?stop|fixed|bracket|housing|cable|boot|support/i;

// This squeeze is an illustrative control demonstration on the existing
// vehicle clock. It has no engine shutdown or measured release/timing meaning.
export const CLUTCH_DEMONSTRATION=Object.freeze({periodSeconds:36,pulses:[[4,7],[30,33]],basis:'illustrative'});
export function clutchDemonstrationInput(motion={}){
 if(finite(motion.clutch))return {value:clamp(motion.clutch),basis:'supplied-input'};
 if(!finite(motion.conditionTime))return {value:0,basis:'unavailable'};
 const time=((motion.conditionTime%36)+36)%36;
 for(const [start,end] of CLUTCH_DEMONSTRATION.pulses)if(time>=start&&time<=end){
  return {value:Math.sin(Math.PI*(time-start)/(end-start))**2,basis:'illustrative-time-profile'};
 }
 return {value:0,basis:'illustrative-time-profile'};
}

function motionBinding(data,rest){
 const drive=data.motion;
 if(data.motionType==='fixed'||!data.motionType&&!drive)return {kind:'fixed'};
 if(!drive)return {kind:'pending',reason:'missing-clutch-drive'};
 if(!/^clutch-/.test(data.role||'')||forbiddenRole.test(data.role)||drive.channel!=='clutch'||drive.input!=='clutch')return {kind:'pending',reason:'unverified-clutch-member'};
 if(!['rotate','translate'].includes(data.motionType)||!vector(data.axis)||!vector(data.pivot))return {kind:'pending',reason:'missing-native-axis-or-pivot'};
 if(!finite(drive.gain)||!Array.isArray(drive.limits)||drive.limits.length!==2||!drive.limits.every(finite)||drive.limits[0]>drive.limits[1])return {kind:'pending',reason:'missing-bounded-display-amplitude'};
 const angleBasis=drive.angleBasis||drive.strokeBasis||drive.basis;
 if(!['illustrative','native','measured'].includes(angleBasis))return {kind:'pending',reason:'missing-amplitude-basis'};
 const axis=new T.Vector3(...data.axis),pivot=new T.Vector3(...data.pivot);
 if(axis.lengthSq()<1e-12)return {kind:'pending',reason:'invalid-native-axis'};
 const space=drive.space||data.motionSpace||'display-m';
 if(space==='part-local-m'){axis.transformDirection(rest);pivot.applyMatrix4(rest);}
 else if(space!=='display-m')return {kind:'pending',reason:'unknown-motion-coordinate-space'};
 axis.normalize();
 return {kind:data.motionType,axis,pivot,gain:drive.gain,limits:drive.limits.slice(),angleBasis,space};
}

// Sources stay in the caller's assembly. Call update once, then applyPart after
// restoring each source installation and before its ordinary explosion path.
// Only source-identified external clutch members can acquire operating motion.
export function createEngineNativeMotion(sources=[]){
 const bindings=new Map(),ids=new Set(),parts=[];
 const current=new T.Matrix4(),delta=new T.Matrix4(),back=new T.Matrix4(),rotation=new T.Matrix4(),q=new T.Quaternion();
 let state={sourceParts:0,movingDefinitions:0,pendingMembers:[],conditionTime:null,clutchInput:0,appliedClutchInput:0,inputBasis:'unavailable',poseMotionWeight:0,exploded:0,emergencyStopActuated:false,coveredEngineCoreParts:[]};
 function append(list=[]){
  let added=0;
  for(const mesh of list){
   const data=mesh?.userData;if(!mesh?.isMesh||!data?.nativeEngine||ids.has(data.id))continue;
   const installation=data.nativeRestMatrix||data.installationMatrix;if(!matrix(installation))continue;
   const rest=new T.Matrix4().fromArray(installation),binding=motionBinding(data,rest);
   bindings.set(mesh,{...binding,mesh,rest,inverseRest:rest.clone().invert(),appliedValue:0});ids.add(data.id);parts.push(mesh);added++;
  }
  return added;
 }
 function update(motion={},focus=[],exploded=0){
  const input=clutchDemonstrationInput(motion),weight=clamp(finite(motion.poseMotionWeight)?motion.poseMotionWeight:exploded>0?0:1);
  const applied=exploded>1e-8?0:input.value*weight;
  state={...state,conditionTime:finite(motion.conditionTime)?motion.conditionTime:null,clutchInput:input.value,appliedClutchInput:applied,inputBasis:input.basis,poseMotionWeight:weight,exploded,emergencyStopActuated:false};
  for(const binding of bindings.values())binding.appliedValue=['rotate','translate'].includes(binding.kind)?T.MathUtils.clamp(applied*binding.gain,...binding.limits):0;
  return diagnostics();
 }
 function applyPart(mesh){
  const binding=bindings.get(mesh);if(!binding||!['rotate','translate'].includes(binding.kind)||Math.abs(binding.appliedValue)<1e-14)return false;
  mesh.updateMatrix();current.copy(mesh.matrix);
  if(binding.kind==='rotate'){
   q.setFromAxisAngle(binding.axis,binding.appliedValue);rotation.makeRotationFromQuaternion(q);
   delta.makeTranslation(...binding.pivot.toArray()).multiply(rotation);
   back.makeTranslation(-binding.pivot.x,-binding.pivot.y,-binding.pivot.z);delta.multiply(back);
  }else delta.makeTranslation(binding.axis.x*binding.appliedValue,binding.axis.y*binding.appliedValue,binding.axis.z*binding.appliedValue);
  current.multiply(binding.inverseRest).multiply(delta).multiply(binding.rest).decompose(mesh.position,mesh.quaternion,mesh.scale);mesh.updateMatrix();
  return true;
 }
 function diagnostics(){
  const moving=[...bindings.values()].filter(b=>['rotate','translate'].includes(b.kind)),pending=[...bindings.values()].filter(b=>b.kind==='pending');
  return {...state,sourceParts:parts.length,movingDefinitions:moving.length,fixedParts:parts.length-moving.length-pending.length,
   motionScope:'identified-external-clutch-members',staticClutchChainMembers:parts.filter(m=>/^clutch-.*cable/.test(m.userData.role||'')).map(m=>m.userData.id),
   motionReady:moving.length>0&&pending.length===0,pendingMembers:pending.map(b=>({id:b.mesh.userData.id,reason:b.reason})),
   moving:moving.map(b=>({id:b.mesh.userData.id,role:b.mesh.userData.role,type:b.kind,value:b.appliedValue,limits:b.limits.slice(),amplitudeBasis:b.angleBasis,axis:b.axis.toArray(),pivot:b.pivot.toArray()})),
   coveredEngineCoreParts:[],fullClutchReleaseChainReady:false,geometryModified:false};
 }
 append(sources);
 return {items:parts,append,update,applyPart,owns:mesh=>bindings.has(mesh),diagnostics,
  // Installed source geometry is already part of the caller's framing cloud.
  framingPoints(){return [];},coveredEngineCoreParts(){return [];},
  labels(request={}){
   if(request.variant==='e74'||request.department!=='power'||!['power','engine','transmission'].includes(request.mode))return [];
   const binding=[...bindings.values()].find(b=>b.kind==='rotate'&&b.mesh.userData.role==='clutch-lever');if(!binding)return [];
   const data=binding.mesh.userData,center=vector(data.center)?new T.Vector3(...data.center):binding.pivot.clone();
   const local=center.applyMatrix4(binding.inverseRest);binding.mesh.updateMatrix();return [{text:'离合手柄',point:local.applyMatrix4(binding.mesh.matrix)}];
  },
  dispose(){bindings.clear();ids.clear();parts.length=0;}
 };
}
