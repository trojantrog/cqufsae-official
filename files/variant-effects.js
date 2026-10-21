import * as T from './vendor/three.module.min.js';
import {vehicleMaterial} from './presentation-materials.js?v=742';
import {createA08Motion} from './a08-motion.js?v=761';
import {createOperationsMark} from './operations-mark-763.js?v=765.1';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Z=V(0,0,1),clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const weight=(focus,test)=>focus.reduce((s,r)=>s+(test(r)?r.weight:0),0);

// Variants exchange local, rigid assemblies. The body and frame vertices are
// never interpolated between unrelated CAD topologies.
export function createVariantEffects(sources){
 const root=new T.Group(),autoRoot=new T.Group(),electricRoot=new T.Group(),operations=createOperationsMark(sources),symbolRoot=operations.root;
 root.name='local-variant-transformation';autoRoot.name='autonomous-actuators';electricRoot.name='electric-energy-path';symbolRoot.name='operations-vis-mark';root.add(autoRoot,electricRoot);
 const resources=new Set(),own=x=>(resources.add(x),x),autonomous=createA08Motion(autoRoot),autoMeshes=autonomous.meshes,electricMeshes=[],symbolMeshes=operations.meshes;let state={electric:0,autonomous:0,operations:0},previousElectricAlpha=NaN,previousElectricSharp=NaN;
 function mesh(g,tag,p,parent,list){const mat=own(vehicleMaterial(tag)),m=new T.Mesh(own(g),mat);m.position.copy(p);m.userData.defocusWeight=0;parent.add(m);list.push(m);return m;}
 function cylinder(r,l,tag,p,axis,parent,list){const g=new T.CylinderGeometry(r,r,l,40);g.rotateX(Math.PI/2);const m=mesh(g,tag,p,parent,list);m.quaternion.setFromUnitVectors(Z,axis);return m;}
 function tube(points,r,tag,parent,list){const curve=new T.CatmullRomCurve3(points.map(p=>Array.isArray(p)?V(...p):p));return mesh(new T.TubeGeometry(curve,64,r,8,false),tag,V(),parent,list);}

 // A08 appears after its original local assemblies have loaded. The imported
 // mounts, actuator bodies, shafts, cylinder, gas equipment and sensors supply
 // both the installation coordinates and the rigid operating constraints.
 autoRoot.visible=false;

 // Physical high-voltage paths join the imported E74 equipment. Bright pulses
 // travel on these paths at the same condition time as the motor and wheels.
 const energyPaths=[
 [[-.43,.214,.218],[-.45,.285,.25],[-.61,.27,.37],[-.635,.154,.388]],
 [[-.65,.154,.388],[-.76,.24,.375],[-.86,.19,.318],[-.909,.02,.303]],
 [[-.51,-.214,.218],[-.54,-.26,.25],[-.635,-.232,.383]],
 [[-.635,-.174,.383],[-.54,-.11,.16],[-.33,-.09,.12],[-.215,-.05,.123]]
 ];
 const energyDots=[];let motorEnergyBinding=null;
 for(let j=0;j<energyPaths.length;j++){
  const points=energyPaths[j].map(a=>V(...a)),curve=new T.CatmullRomCurve3(points),pathMesh=tube(points,j<3?.0055:.0032,j<3?'copper-satin':'soft-black',electricRoot,electricMeshes);
  const connectors=[];for(const p of [points[0],points.at(-1)])connectors.push(cylinder(.009,.017,'soft-black',p,Z,electricRoot,electricMeshes));
  if(j===1){motorEnergyBinding={points,curve,pathMesh,endConnector:connectors[1]};pathMesh.name='motor-energy-path';connectors[1].name='motor-energy-terminal';}
  for(let i=0;i<4;i++){const dot=mesh(new T.SphereGeometry(.006,12,8),'bright-alloy',points[0],electricRoot,electricMeshes);dot.material.color.setHex(0xe87834);dot.material.emissive.setHex(0xff7831);dot.material.emissiveIntensity=.7;energyDots.push({dot,curve,phase:i/4});}
 }

 // Native-surface point correspondence bridges different local topologies.
 function sampled(list,count){const out=[];for(const m of list){const a=m.geometry.attributes.position,n=Math.min(60,a?.count||0),rest=m.userData.sourceNative?new T.Matrix4().fromArray(m.userData.nativeRestMatrix||m.userData.installationMatrix):null;for(let i=0;i<n;i++){const k=Math.floor((i+.37)/n*a.count),point=V(a.getX(k),a.getY(k),a.getZ(k));out.push(rest?point.applyMatrix4(rest):point);}}if(!out.length)out.push(V());return Array.from({length:count},(_,i)=>out[(i*137)%out.length].clone());}
 const particleCount=2400,particleG=own(new T.BufferGeometry()),particlePos=new Float32Array(particleCount*3),morphFrom=sampled(sources.filter(m=>m.userData.group==='engine'),particleCount);let morphTo=morphFrom;
 particleG.setAttribute('position',new T.BufferAttribute(particlePos,3));const particleMat=own(new T.PointsMaterial({color:0xad9c88,size:.005,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true})),bridge=new T.Points(particleG,particleMat);bridge.frustumCulled=false;root.add(bridge);
 let evReady=false,nativeElectric=false;
 function append(list){nativeElectric||=list.some(m=>m.userData.sourceNative);if(!evReady&&list.length){
  morphTo=sampled(list,particleCount);evReady=true;
  const motor=list.find(m=>m.userData.motorConnectionPoint);
  if(motor&&motorEnergyBinding){const b=motorEnergyBinding,point=V(...motor.userData.motorConnectionPoint);b.points.at(-1).copy(point);b.curve.updateArcLengths();const old=b.pathMesh.geometry;b.pathMesh.geometry=own(new T.TubeGeometry(b.curve,64,.0055,8,false));resources.delete(old);old.dispose();b.endConnector.position.copy(point);}
 }}
 function sourceFactor(m){const d=m.userData;if(d.variant==='e74')return smooth((state.electric-.14)/.73);return (d.group==='engine'||d.group==='transmission'&&d.mechanism!=='mo-halfshafts')?1-smooth(state.electric/.80):1;}
 function transformPart(m){const d=m.userData,e=state.electric;if(d.sourceNative&&!d.nativeEngine)return;if(d.variant==='e74'){
   const a=1-smooth(e),center=V(...(d.presentationCenter||d.center)),origin=V(-.65,0,.32),scale=1-.77*a;m.position.add(origin.clone().sub(center).multiplyScalar(a)).addScaledVector(center,1-scale);m.scale.setScalar(scale);
  }else if((d.group==='engine'||d.group==='transmission'&&d.mechanism!=='mo-halfshafts')&&e>0){
   const a=smooth(e/.80),pivot=V(-.68,0,.30),scale=1-.88*a;m.position.multiplyScalar(scale).addScaledVector(pivot,1-scale);m.scale.setScalar(scale);
  }
 }
 function update(focus,motion,{exploded=0,operationsWeight,poseMotionWeight=1,animateAutonomous=true}={}){
  const previous=state;state={electric:weight(focus,r=>r.variant==='e74'&&r.department==='power'),autonomous:weight(focus,r=>r.department==='driverless'),operations:operationsWeight??weight(focus,r=>r.department==='operations')};
  const ew=smooth((state.electric-.14)/.73),op=clamp(state.operations),steering=motion.chassis?.steering?.angle||0,brake=(motion.brake||0)*poseMotionWeight;
  // Focus within the electric variant is conditional on its own weight. Its
  // existing appearance curve supplies the variant fade exactly once.
  const electricSharp=state.electric>0?weight(focus,r=>r.variant==='e74'&&r.department==='power'&&(r.mode==='power'||r.mode==='wiring'))/state.electric:0;
  const electricAlpha=nativeElectric?0:ew*(.027+.973*electricSharp);
  const autonomousMotion=state.autonomous>1e-8||previous.autonomous>1e-8||!previous.autonomousMotion?autonomous.update(focus,{...motion,steer:(motion.steer||0)*poseMotionWeight,brake},state.autonomous,{animate:animateAutonomous}):previous.autonomousMotion;
  let energyDistance=motion.distance,energyRate=.25;
  if(motion.loopPeriod>0&&motion.loopDistanceM>0){energyRate=Math.max(1,Math.round(motion.loopDistanceM*.25))/motion.loopDistanceM;if(Number.isFinite(motion.loopDistanceStart)){let d=((energyDistance-motion.loopDistanceStart)%motion.loopDistanceM+motion.loopDistanceM)%motion.loopDistanceM;if(d<1e-8||motion.loopDistanceM-d<1e-8)d=0;energyDistance=motion.loopDistanceStart+d;}}
  if(electricAlpha>.002)for(const {dot,curve,phase}of energyDots)dot.position.copy(curve.getPointAt((energyDistance*energyRate+phase)%1));
  if(electricAlpha!==previousElectricAlpha||electricSharp!==previousElectricSharp)for(const m of electricMeshes){m.userData.effectOpacity=electricAlpha;m.material.opacity=electricAlpha;m.material.transparent=true;m.visible=electricAlpha>.002;m.userData.defocusWeight=1-electricSharp;m.userData.defocus=m.userData.defocusWeight>.5;}previousElectricAlpha=electricAlpha;previousElectricSharp=electricSharp;electricRoot.visible=!nativeElectric&&ew>.002;
  const bridgeAlpha=nativeElectric?0:Math.sin(Math.PI*clamp(state.electric))**2*.62;bridge.visible=bridgeAlpha>.003;particleMat.opacity=bridgeAlpha;
  if(bridge.visible){const t=smooth(state.electric);for(let i=0;i<particleCount;i++){const p=morphFrom[i].clone().lerp(morphTo[i],t);p.z+=.065*Math.sin(Math.PI*t)*Math.sin(i*2.39996);p.toArray(particlePos,i*3);}particleG.attributes.position.needsUpdate=true;}
  const operationState=operations.update(op,motion.conditionTime||0,motion);
  state.autonomousMotion=autonomousMotion;state.steeringAngle=steering;state.symbolAlpha=operationState.markAlpha;state.symbolSweep=operationState.sweep;
  return {...state,assemblyScale:operationState.assemblyScale,assemblyAlpha:operationState.assemblyAlpha};
 }
 return {root,symbolRoot,autoRoot,electricRoot,append,appendAutonomous:list=>autonomous.append(list),sourceFactor,transformPart,update,
  get autoFramingPoints(){return autonomous.framingPoints();},autonomousFramingPoints:request=>autonomous.framingPoints(request),
  autonomousLabels:request=>autonomous.labels(request),autonomousFocusMeshes:request=>autonomous.focusMeshes(request),autonomous,
  get autonomousRevision(){return autonomous.revision;},get state(){return state;},
  autoMeshes,electricMeshes,symbolMeshes,operations,get nativeElectric(){return nativeElectric;},operationsMeshes:()=>operations.meshes,
  dispose(){autonomous.dispose();operations.dispose();resources.forEach(r=>r.dispose());root.clear();symbolRoot.clear();}
 };
}
