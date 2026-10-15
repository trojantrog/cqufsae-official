import * as T from './vendor/three.module.min.js';
import {createVehicleStudy} from './vehicle-study.js?v=748';
import {fitPoints,visiblePoints} from './camera-framing.js?v=742';
import {explosionEnvelopePoints} from './explosion-layout.js?v=747';
import {createExplosionCameraTrack} from './explosion-framing.js?v=747';
import {createSystemFraming} from './system-framing.js?v=746';
const V=(...a)=>new T.Vector3(...a),clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
export const DISPLAY_TIME_SCALE=1;
export const DRIVERLESS_FRAME_SCALE=1.13;
const FOCUS_CONTINUATION_SECONDS=.22;
const whole={department:'all',mode:'all',variant:'c41',weight:1};
const directions={all:[3.1,5.6,3.5],chassis:[2.6,5.7,4.3],suspension:[.8,6,2.6],steering:[-4.5,5,3.5],brakes:[3,6,3],structure:[3.6,5.5,4.8],body:[4.5,4.5,5.5],frame:[2.5,6,3.5],power:[-2,7,3.2],engine:[.4,7,2],transmission:[-4,6,2],driverless:[1.6,7,2.8],algorithm:[1,7,2.1],control:[1.6,7,2.3],operations:[.08,7,.24],battery:[-1,6,3.8],ecu:[-2,6,2.8],wiring:[-1,6,3]};
// DC26's original sprockets and chain sit on the negative-Y side of its motor.
const electricDirections={power:[-2,-7,3.4],transmission:[-4,-6,2.4],battery:[-1,6,4.6],ecu:[-2,-6,3.5],wiring:[-1,-6,4]};
const captions={all:'按装配顺序展开，观察零件之间的连接关系。',chassis:'同一变道工况中，观察转向、悬架行程和车身姿态。',suspension:'前后悬架随同一工况运动，观察左右轮端和横臂的变化。',steering:'方向盘、转向机和横拉杆共同带动前轮转向。',brakes:'驶出变道区后，制动踏板与轮端随车辆减速过程联动。',structure:'观察同一工况中的车身外形和承载结构。',body:'保留整车外形，气流线用于说明翼面附近的流向。',frame:'转向、制动与轮跳时，观察车架的应力变化。',power:'发动机、主传动、半轴和驱动轮共享同一运动进度。',engine:'一侧外壳逐渐透明，观察活塞、连杆、曲轴和气门的联动。',transmission:'主传动和半轴随驱动轮转动，左右轮速随弯道变化。',driverless:'观察同一工况中的自动转向、自动制动与环境感知部件。',algorithm:'观察激光雷达、深度相机及支架的安装位置。',control:'转向传动与制动推杆随同一行驶工况联动。',operations:'车队组织、活动策划、对外传播与资源协调。',battery:'从电池箱位置观察电驱系统的布置。',ecu:'观察控制器、电机与驱动轮之间的联系。',wiring:'沿设备布置观察电驱系统的连接。'};
export function createDepartmentDirector({scene,camera,controls,getMeshes,getCar,getElectricMeshes=()=>[],getAutonomousMeshes=()=>[],reduced,onState,onPresentationFrame,displayTimeScale=DISPLAY_TIME_SCALE,overviewDirection=null}){
 let rig=null,view={...whole},phase='overview',time=0,paused=!!reduced(),focus=[{...whole}],transition=null,explosion=0,cameraOwned=true,poseMotionWeight=0,poseTime=0,transitionStage='overview';const settled=[];
 let timeScale=Number.isFinite(displayTimeScale)&&displayTimeScale>0?displayTimeScale:DISPLAY_TIME_SCALE,lastGoal=null,seekPending=false,systemFraming=null,viewOverride=null,viewFlight=null;
 const cameraVelocity=V(),targetVelocity=V(),lastPosition=camera.position.clone(),lastTarget=controls.target.clone();let zoomVelocity=0,lastZoom=camera.zoom;
 const upVelocity=V(),lastUp=camera.up.clone(),localCameraVelocity=V(),localTargetVelocity=V(),localUpVelocity=V();let lastLocal=null;
 function syncControlsUp(){if(controls._quat?.setFromUnitVectors&&controls._quatInverse?.copy){controls._quat.setFromUnitVectors(camera.up,V(0,1,0));controls._quatInverse.copy(controls._quat).invert();}}
 const snapshot=()=>({position:camera.position.clone(),target:controls.target.clone(),up:camera.up.clone(),zoom:camera.zoom});
 function ensure(){if(!rig&&getMeshes().length){rig=createVehicleStudy(getMeshes(),{camera});rig.autonomousContext.setCamera(camera);systemFraming=createSystemFraming(rig);scene.add(rig.root);}rig?.appendSources(getElectricMeshes());if(rig?.appendAutonomousSources(getAutonomousMeshes())){systemFraming?.clear();lastGoal=null;if(transition)transition.frames=null;}return rig;}
 function points(request){const stable=rig.framingPoints?.(request);if(stable?.length)return stable;rig.root.updateMatrixWorld(true);return rig.focusMeshes(request).flatMap(m=>(m.userData.framingPoints||[]).map(p=>p.clone().applyMatrix4(m.matrixWorld)));}
 function goal(request){
  const active=request.mode===view.mode&&request.department===view.department&&request.variant===view.variant;
  const direction=active&&viewOverride?viewOverride.direction:request.mode==='all'&&overviewDirection?V(...overviewDirection):V(...(request.department==='power'&&request.variant==='e74'&&electricDirections[request.mode]||directions[request.mode]||directions[request.department]||directions.all));
  if(request.mode!=='all'&&request.department!=='operations'){const frame=systemFraming.frame(request,camera,direction,active&&viewOverride?viewOverride.subject:'system');if(frame)return frame;}
  const cloud=points(request);if(!cloud.length)return snapshot();
  const frame=fitPoints(cloud,{fov:camera.fov,aspect:camera.aspect,near:camera.near,up:V(0,0,1)},direction,{x:.89,y:.80});frame.up=V(0,0,1);return frame;
 }
 function operationsWeight(){return focus.filter(r=>r.department==='operations').reduce((n,r)=>n+r.weight,0);}
 function state(){const blend=1-focus.filter(r=>r.mode==='all').reduce((n,r)=>n+r.weight,0);return {phase,department:view.department,mode:view.mode,variant:view.variant,blend,time,paused,displayTimeScale:timeScale,poseTime,poseMotionWeight,transitionStage,operationsWeight:operationsWeight(),caption:view.mode==='frame'&&viewOverride?.subject==='cockpit'?'观察座椅、六点式安全带、锁扣与车架的安装位置。':view.department==='power'&&view.variant==='e74'&&['power','transmission'].includes(view.mode)?'电机、传动与驱动轮沿用同一变道工况。':captions[view.mode]||captions[view.department],motion:rig?.getMotion(),explosion,focus:focus.map(r=>({...r})),focusStrength:blend};}
 const notify=()=>onState?.(state());
 function select(department,mode=department,variant='c41'){
  if(!ensure())return;
  const next=department==='all'?{...whole}:{department,mode,variant,weight:1};
  if(view.department===next.department&&view.mode===next.mode&&view.variant===next.variant)return;
  if(next.mode!=='all')settled.splice(0).forEach(resolve=>resolve(false));
  const carry=transition?{transition,elapsed:transition.elapsed}:null;
  const leavingOperations=focus.some(r=>r.department==='operations'&&r.weight>.001);
  const duration=reduced()?[.001,.001,.001]:next.department==='operations'?[.7,1.9,3.6]:leavingOperations?[1.6,1.8,1.0]:[.65,1.4,.85];
  transition={from:snapshot(),fromVelocity:{position:cameraVelocity.clone(),target:targetVelocity.clone(),up:upVelocity.clone(),zoom:zoomVelocity},fromFocus:focus.map(r=>({...r})),destination:next,carry,fromExplosion:explosion,fromMotionWeight:poseMotionWeight,poseTime,elapsed:0,duration,frames:null};
  lastGoal=null;viewOverride=null;viewFlight=null;
  view=next;phase='transitioning';transitionStage='assemble';cameraOwned=true;controls.enabled=false;notify();
 }
 function combine(items){const map=new Map();for(const r of items){const key=[r.department,r.mode,r.variant].join('/'),prior=map.get(key);if(prior)prior.weight+=r.weight;else map.set(key,{...r});}return [...map.values()].filter(r=>r.weight>1e-10);}
 function mix(a,b,t){return combine([...a.map(r=>({...r,weight:r.weight*(1-t)})),...b.map(r=>({...r,weight:r.weight*t}))]);}
 function revealAt(tr,elapsed){const [a,b,c]=tr.duration,start=a+b*.45;return ease((elapsed-start)/(a+b+c-start));}
 function focusAt(tr,elapsed){
  const [a,b,c]=tr.duration;let base;
  if(elapsed<a)base=mix(tr.fromFocus,[whole],ease(elapsed/a));
  else base=mix([whole],[tr.destination],revealAt(tr,elapsed));
  // Continue the previous weight velocity briefly after interrupted input.
  // Both endpoints of the blend have zero blend derivative, keeping weights
  // positive while avoiding a restart of an active fade.
  if(tr.carry&&elapsed<FOCUS_CONTINUATION_SECONDS)return mix(focusAt(tr.carry.transition,tr.carry.elapsed+elapsed),base,ease(elapsed/FOCUS_CONTINUATION_SECONDS));
  return base;
 }
 function hermite(a,b,va,vb,t,duration){const t2=t*t,t3=t2*t;return a.clone().multiplyScalar(2*t3-3*t2+1).addScaledVector(va,(t3-2*t2+t)*duration).addScaledVector(b,-2*t3+3*t2).addScaledVector(vb,(t3-t2)*duration);}
 function scalarHermite(a,b,va,vb,t,duration){const t2=t*t,t3=t2*t;return (2*t3-3*t2+1)*a+(t3-2*t2+t)*duration*va+(-2*t3+3*t2)*b+(t3-t2)*duration*vb;}
 function polar(frame,velocity){
  const offset=frame.position.clone().sub(frame.target),radius=Math.max(.05,offset.length()),horizontal=Math.max(1e-8,Math.hypot(offset.x,offset.y));
  const p={target:frame.target.clone(),radius,azimuth:Math.atan2(offset.y,offset.x),elevation:Math.atan2(offset.z,horizontal),zoom:frame.zoom??1};
  if(velocity){const delta=velocity.position.clone().sub(velocity.target),hVelocity=(offset.x*delta.x+offset.y*delta.y)/horizontal;p.velocity={target:velocity.target.clone(),radius:offset.dot(delta)/radius,azimuth:(offset.x*delta.y-offset.y*delta.x)/(horizontal*horizontal),elevation:(horizontal*delta.z-offset.z*hVelocity)/(radius*radius),zoom:velocity.zoom};}
  return p;
 }
 const unwrap=(angle,near)=>near+Math.atan2(Math.sin(angle-near),Math.cos(angle-near));
 function angularFrame(frame,up,velocity){
  const axis=up.clone().normalize(),basis=new T.Quaternion().setFromUnitVectors(V(0,0,1),axis),inverse=basis.clone().invert(),offset=frame.position.clone().sub(frame.target),local=offset.clone().applyQuaternion(inverse);
  let motion;
  if(velocity){
   const delta=velocity.position.clone().sub(velocity.target).applyQuaternion(inverse),rate=velocity.up.clone().addScaledVector(axis,-axis.dot(velocity.up)),h=1e-5;
   // Include the moving up-axis in the initial tangent. Otherwise changing
   // from a vehicle-aligned view to studio up invents a new angular velocity.
   const at=s=>offset.clone().applyQuaternion(new T.Quaternion().setFromUnitVectors(V(0,0,1),axis.clone().addScaledVector(rate,s).normalize()).invert());
   delta.add(at(h).sub(at(-h)).multiplyScalar(1/(2*h)));motion={position:delta,target:V(),zoom:velocity.zoom};
  }
  return polar({position:local,target:V(),zoom:frame.zoom},motion);
 }
 function elevationBrake(value,velocity,end,duration){
  const low=Math.PI/2-(Number.isFinite(controls.maxPolarAngle)?controls.maxPolarAngle:Math.PI-1e-6),high=Math.PI/2-(Number.isFinite(controls.minPolarAngle)?controls.minPolarAngle:1e-6);
  if(Math.abs(velocity)<1e-8)return null;
  const margin=Math.max(0,velocity>0?high-value:value-low),a=2*(value-end)+duration*velocity,b=3*(end-value)-2*duration*velocity,c=duration*velocity,extrema=[value,end];
  if(Math.abs(a)<1e-14){if(Math.abs(b)>1e-14){const t=-c/(2*b);if(t>0&&t<1)extrema.push(scalarHermite(value,end,velocity,0,t,duration));}}
  else{const disc=4*b*b-12*a*c;if(disc>=0)for(const t of [(-2*b-Math.sqrt(disc))/(6*a),(-2*b+Math.sqrt(disc))/(6*a)])if(t>0&&t<1)extrema.push(scalarHermite(value,end,velocity,0,t,duration));}
  if(Math.min(...extrema)>=low&&Math.max(...extrema)<=high&&margin>=Math.abs(velocity)*duration*.20)return null;
  // A monotone speed reduction spends at most 80% of the available angle.
  // Its acceleration is zero at both joins; the following turn is quintic.
  const braking=Math.min(.30,duration*.18,1.6*margin/Math.abs(velocity));return {duration:braking,stop:value+.5*velocity*braking};
 }
 function boundedElevation(from,to,plan,elapsed,duration){
  if(!plan)return scalarHermite(from.elevation,to,from.velocity.elevation,0,clamp(elapsed/duration),duration);
  if(elapsed<plan.duration){const u=elapsed/plan.duration;return from.elevation+from.velocity.elevation*plan.duration*(u-u*u*u+.5*u*u*u*u);}
  return plan.stop+(to-plan.stop)*ease((elapsed-plan.duration)/(duration-plan.duration));
 }
 function buildFrames(tr){
  const from=polar(tr.from,tr.fromVelocity),wide=polar(goal(whole)),to=polar(goal(tr.destination)),all=points(whole),box=new T.Box3().setFromPoints(all),center=all.length?box.getCenter(V()):wide.target.clone();
  let radius=0;for(const p of all)radius=Math.max(radius,p.distanceTo(center));
  const aperture=Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov/2))*Math.min(.82,camera.aspect*.90));
  const safeRadius=Math.max(from.radius,wide.radius,radius/Math.max(.05,Math.sin(aperture))*1.03);
  const [a]=tr.duration,endAzimuth=from.azimuth+from.velocity.azimuth*a*.5,endElevation=from.elevation+from.velocity.elevation*a*.5;
  wide.azimuth=unwrap(wide.azimuth,endAzimuth);to.azimuth=unwrap(to.azimuth,wide.azimuth);
  const angularFrom=angularFrame(tr.from,tr.from.up,tr.fromVelocity),angularTo=angularFrame(goal(tr.destination),V(0,0,1)),angularDuration=tr.duration[0]+tr.duration[1],brake=elevationBrake(angularFrom.elevation,angularFrom.velocity.elevation,angularTo.elevation,angularDuration);
  return {from,wide,to,center,safeRadius,endAzimuth,endElevation,angularFrom,angularTo,brake};
 }
 function commitCamera(target,radius,azimuth,elevation,zoom=1,basis){
  const direction=V(Math.cos(elevation)*Math.cos(azimuth),Math.cos(elevation)*Math.sin(azimuth),Math.sin(elevation));
  if(basis)direction.applyQuaternion(basis);
  controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,Math.max(.05,radius));camera.zoom=Math.max(.05,zoom);camera.updateProjectionMatrix();
 }
 function moveCamera(tr){
  const {from,center,safeRadius,angularFrom,angularTo,brake}=tr.frames,[a,b,c]=tr.duration,e=tr.elapsed;
  const liveFrame=goal(tr.destination),live=polar(liveFrame),angularDuration=a+b,angularU=clamp(e/angularDuration);
  const reveal=revealAt(tr,e),up=e<a?hermite(tr.from.up,V(0,0,1),tr.fromVelocity.up,V(),clamp(e/a),a).normalize():V(0,0,1).lerp(liveFrame.up,reveal).normalize(),basis=new T.Quaternion().setFromUnitVectors(V(0,0,1),up),angularLive=angularFrame(liveFrame,up);
  // Camera orbit continues through the complete-vehicle handoff. Reassembly
  // and focus share that trajectory; they no longer stop and restart its orbit.
  const azimuth=scalarHermite(angularFrom.azimuth,unwrap(angularLive.azimuth,unwrap(angularTo.azimuth,angularFrom.azimuth)),angularFrom.velocity.azimuth,0,angularU,angularDuration),elevation=boundedElevation(angularFrom,angularLive.elevation,brake,e,angularDuration);
  if(e<a){const u=clamp(e/a),v=from.velocity;commitCamera(hermite(from.target,center,v.target,V(),u,a),scalarHermite(from.radius,safeRadius,v.radius,0,u,a),azimuth,elevation,scalarHermite(from.zoom,1,v.zoom,0,u,a),basis);}
  else{
   commitCamera(center.clone().lerp(live.target,reveal),safeRadius+(live.radius-safeRadius)*reveal,azimuth,elevation,1,basis);
  }
  camera.up.copy(up);
 }
 function localSnapshot(){const inverse=rig.assembly.matrixWorld.clone().invert();return {position:camera.position.clone().applyMatrix4(inverse),target:controls.target.clone().applyMatrix4(inverse),up:camera.up.clone().transformDirection(inverse),zoom:camera.zoom};}
 function viewDirection(direction,{duration=.8,subject='system'}={}){
  if(!rig||phase!=='working'||view.department==='operations'||subject!=='system'&&!(subject==='cockpit'&&view.mode==='frame'))return false;
  const d=direction?.isVector3?direction.clone():Array.isArray(direction)&&direction.length===3?V(...direction):null;
  if(!d||!d.toArray().every(Number.isFinite)||d.lengthSq()<1e-12)return false;d.normalize();
  // Use the same pole limits as manual orbiting, so the real controls do not
  // change a top-view goal again immediately after the director commits it.
  const polarAngle=Math.acos(T.MathUtils.clamp(d.z,-1,1)),limited=T.MathUtils.clamp(polarAngle,Number.isFinite(controls.minPolarAngle)?controls.minPolarAngle:1e-6,Number.isFinite(controls.maxPolarAngle)?controls.maxPolarAngle:Math.PI-1e-6);
  if(Math.abs(limited-polarAngle)>1e-12){const azimuth=Math.atan2(d.y,d.x);d.set(Math.sin(limited)*Math.cos(azimuth),Math.sin(limited)*Math.sin(azimuth),Math.cos(limited));}
  if(cameraOwned&&viewOverride?.subject===subject&&viewOverride.direction.distanceToSquared(d)<1e-20)return true;
  rig.assembly.updateWorldMatrix(true,false);const from=localSnapshot();
  viewOverride={direction:d,subject};const worldGoal=goal(view),inverse=rig.assembly.matrixWorld.clone().invert(),to={position:worldGoal.position.clone().applyMatrix4(inverse),target:worldGoal.target.clone().applyMatrix4(inverse),up:V(0,0,1),zoom:1};
  const start=polar(from,{position:localCameraVelocity.clone(),target:localTargetVelocity.clone(),zoom:zoomVelocity}),end=polar(to);end.azimuth=unwrap(end.azimuth,start.azimuth);
  viewFlight={from,to,start,end,upVelocity:localUpVelocity.clone(),duration:reduced()?.001:Math.max(.001,Number.isFinite(duration)?duration:.8),elapsed:0};cameraOwned=true;controls.enabled=false;lastGoal=null;return true;
 }
 function moveViewFlight(dt){
  const f=viewFlight;f.elapsed+=dt;const u=clamp(f.elapsed/f.duration),a=f.start,b=f.end,v=a.velocity;
  commitCamera(hermite(a.target,b.target,v.target,V(),u,f.duration),scalarHermite(a.radius,b.radius,v.radius,0,u,f.duration),scalarHermite(a.azimuth,b.azimuth,v.azimuth,0,u,f.duration),scalarHermite(a.elevation,b.elevation,v.elevation,0,u,f.duration),scalarHermite(a.zoom,1,v.zoom,0,u,f.duration));
  camera.position.applyMatrix4(rig.assembly.matrixWorld);controls.target.applyMatrix4(rig.assembly.matrixWorld);camera.up.copy(hermite(f.from.up,f.to.up,f.upVelocity,V(),u,f.duration)).normalize().transformDirection(rig.assembly.matrixWorld);
  if(u===1){viewFlight=null;controls.enabled=true;}const to=goal(view);lastGoal={position:to.position.clone(),target:to.target.clone()};
 }
 function applyRig(){
  const presentation={poseMotionWeight,poseTime,operationsWeight:operationsWeight(),transitionStage,variant:view.variant,seek:seekPending};
  rig.apply(time,focus,explosion,presentation);seekPending=false;onPresentationFrame?.({time,focus:focus.map(r=>({...r})),explosion,...presentation,rig});
 }
 function recordVelocity(dt){if(dt>1e-9){cameraVelocity.copy(camera.position).sub(lastPosition).divideScalar(dt);targetVelocity.copy(controls.target).sub(lastTarget).divideScalar(dt);upVelocity.copy(camera.up).sub(lastUp).divideScalar(dt);zoomVelocity=(camera.zoom-lastZoom)/dt;}lastPosition.copy(camera.position);lastTarget.copy(controls.target);lastUp.copy(camera.up);lastZoom=camera.zoom;if(rig){const current=localSnapshot();if(dt>1e-9&&lastLocal){localCameraVelocity.copy(current.position).sub(lastLocal.position).divideScalar(dt);localTargetVelocity.copy(current.target).sub(lastLocal.target).divideScalar(dt);localUpVelocity.copy(current.up).sub(lastLocal.up).divideScalar(dt);}lastLocal=current;}}
 function update(dt,options={}){
  if(!ensure())return state();
  if(!paused&&phase!=='overview')time+=Math.min(.15,dt)*timeScale;
  if(transition){transition.elapsed+=dt;const [a,b,c]=transition.duration,e=transition.elapsed;
   transitionStage=e<a?'assemble':e<a+b?'move':'reveal';explosion=transition.fromExplosion*(1-ease(e/a));
   poseMotionWeight=e<a?transition.fromMotionWeight*(1-ease(e/a)):(view.mode==='all'||view.department==='operations'?0:revealAt(transition,e));poseTime=e>=a&&poseMotionWeight>0?time:transition.poseTime;
   focus=focusAt(transition,transition.elapsed);
   applyRig();if(!transition.frames)transition.frames=buildFrames(transition);moveCamera(transition);
   if(e>=a+b+c){transition=null;phase=view.mode==='all'?'overview':'working';transitionStage=phase;focus=[{...view}];const to=goal(view);lastGoal={position:to.position.clone(),target:to.target.clone()};controls.enabled=true;notify();if(phase==='overview')settled.splice(0).forEach(f=>f());}
  }else{
   if(phase==='overview')explosion=options.explosion??explosion;
   poseTime=time;poseMotionWeight=phase==='working'&&view.department!=='operations'?1:0;transitionStage=phase;applyRig();
   if(phase==='working'&&cameraOwned){if(viewFlight)moveViewFlight(dt);else{const to=goal(view);camera.position.copy(to.position);controls.target.copy(to.target);camera.up.copy(to.up);camera.zoom=to.zoom;camera.updateProjectionMatrix();lastGoal={position:to.position.clone(),target:to.target.clone()};}}
  }
  syncControlsUp();recordVelocity(dt);
  return state();
 }
 controls.addEventListener('start',()=>{cameraOwned=false;viewFlight=null;controls.enabled=true;});
 return {select,viewDirection,back(){select('all');},update,state,async prepareAutonomous(){const study=ensure();if(study)await study.prepareAutonomous(camera);},focusMeshes(){return rig?.focusMeshes(view)||[];},bounds(){const b=new T.Box3();rig?.focusMeshes(view).forEach(m=>b.expandByObject(m));return b;},labels(){return rig?focus.filter(r=>r.mode!=='all'&&r.weight>1e-8).flatMap(r=>rig.labels(r).map(label=>({...label,id:[r.department,r.mode,r.variant,label.text].join('/'),opacity:clamp(r.weight)}))):[];},
  overviewExplosionFrame(direction=camera.position.clone().sub(controls.target)){if(!ensure())return null;rig.root.updateMatrixWorld(true);const envelope=[...(rig.aeroExplosion?.envelopePoints(rig.assembly.matrixWorld)||[]),...explosionEnvelopePoints(rig.focusMeshes(whole),rig.assembly.matrixWorld),...(rig.cockpit?.explosionFramingPoints(rig.assembly.matrixWorld)||[]),...(rig.firewall?.explosionFramingPoints(rig.assembly.matrixWorld)||[]),...(rig.instruments?.explosionFramingPoints(rig.assembly.matrixWorld)||[])],frame=fitPoints(envelope,camera,direction,{x:.89,y:.80});frame.position.sub(frame.target).multiplyScalar(1.02).add(frame.target);return frame;},
  explosionCameraTrack(direction=camera.position.clone().sub(controls.target)){
   if(!ensure()||phase!=='overview')return null;
   return createExplosionCameraTrack({rig,camera,direction,time,restore:applyRig});
  },
  overviewPoints(){return ensure()?.overviewPoints()||[];},
  cockpitPoints(){return rig?visiblePoints([...rig.cockpit.items,...(rig.firewall?.items||[]),...(rig.instruments?.items||[]).filter(m=>m.userData.variant==='c41'),...rig.meshes.filter(m=>m.userData.mechanism==='fr-headrest')]):[];},
  reduce(){if(reduced())paused=true;notify();},releaseCamera(){cameraOwned=false;viewFlight=null;lastGoal=null;controls.enabled=true;},leave(){if(phase==='overview')return Promise.resolve();select('all');return new Promise(r=>settled.push(r));},pause(){paused=!paused;notify();},replay(){time=0;seekPending=true;paused=false;notify();},scrub(t){time=Math.max(0,Number(t)||0);seekPending=true;paused=true;notify();},
  setDisplayTimeScale(value){if(Number.isFinite(value)&&value>0){timeScale=value;notify();}return timeScale;},
  clear(){if(rig){scene.remove(rig.root);rig.dispose();rig=null;}systemFraming?.clear();systemFraming=null;viewOverride=null;viewFlight=null;lastLocal=null;view={...whole};phase='overview';transitionStage='overview';transition=null;focus=[{...whole}];explosion=0;time=0;poseTime=0;poseMotionWeight=0;lastGoal=null;seekPending=false;cameraVelocity.set(0,0,0);targetVelocity.set(0,0,0);upVelocity.set(0,0,0);localCameraVelocity.set(0,0,0);localTargetVelocity.set(0,0,0);localUpVelocity.set(0,0,0);camera.up.set(0,0,1);syncControlsUp();zoomVelocity=0;recordVelocity(0);settled.splice(0).forEach(f=>f());},dispose(){this.clear();}
 };
}
