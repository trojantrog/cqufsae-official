import * as T from './vendor/three.module.min.js';
import {C41_DRIVE} from './c41-drive-775.js?v=775';
import {sampleGeometry,visiblePoints} from './camera-framing.js?v=751.2';
import {solveCorner,uprightPose,solveTieRod,tieRodPose} from './source-kinematics.js?v=742';
import {mooseManeuver,roadHeight} from './moose-maneuver.js?v=742';
import {explosionPosition,explosionOrientation} from './explosion-layout.js?v=757';
import {createExplosionComposition} from './explosion-composition-751.js?v=751.2';
import {createChainExtraction} from './chain-extraction.js?v=751.2';
import {createEngineCore} from './engine-core.js?v=742';
import {createChassisMotion} from './chassis-motion.js?v=757';
import {createDrivelineKinematics} from './driveline-kinematics.js?v=754';
import {createRoadContact} from './road-contact.js?v=742';
import {createRoadSurface} from './road-surface.js?v=756';
import {createAeroField} from './aero-field.js?v=759.1';
import {createAeroWingSection} from './aero-wing-section.js?v=757';
import {createAeroExplosion} from './aero-explosion.js?v=751.2';
import {createFrameResponse} from './frame-response.js?v=775';
import {createHalfBodyReveal} from './half-body-reveal-751.js?v=753';
import {createVariantEffects} from './variant-effects.js?v=765.1';
import {updateNativeElectricParts} from './electric-details.js?v=756';
import {createNativeElectricChain} from './electric-chain-motion.js?v=753';
import {createEngineNativeMotion} from './engine-native-motion.js?v=750.8';
import {createAutonomousContext} from './autonomous-context.js?v=744';
import {createAutonomousPerception} from './autonomous-perception.js?v=775';
import {createPowertrainCompletion} from './powertrain-completion.js?v=771';
import {createCockpitCompletion} from './cockpit-completion.js?v=751.2';
import {createCockpitFirewall} from './cockpit-firewall.js?v=751.2';
import {createInstrumentCluster} from './c125-instrument.js?v=751.2';
import {createEngineHarness} from './engine-harness-751.js?v=771';
import {createA08Electrical} from './a08-electrical-752.js?v=752.3';
import {createA08Hydraulics} from './a08-hydraulics-752.js?v=753';
import {createA08VcuDetail} from './a08-vcu-detail-752.js?v=752.3';
import {createSystemAnnotations} from './system-annotations-768.js?v=773';
import {createCyclicPresentation} from './cyclic-presentation-753.js?v=753';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion(),X=V(1,0,0),Y=V(0,1,0),Z=V(0,0,1);
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const mean=a=>a.reduce((v,p)=>v.add(p),V()).multiplyScalar(1/Math.max(1,a.length));
const tags={chassis:['suspension','steering','brakes'],structure:['body','frame'],power:['engine','transmission'],driverless:['steering','brakes','transmission'],operations:[]};
const autonomousCalipers=new Set(['purchased-005','purchased-006','brakes-001','brakes-002','brakes-043','brakes-044']);
const engineMechanisms=new Set(['mo-power_unit','mo-intake','mo-exhaust','mo-cooling','mo-lubrication','mo-fuel','mo-clutch-control','mo-shifting','mo-engine_mount','mo-engine-electrics','mo-safety-controls']);
export function isC41EngineStudyPart(data={}){
 return data.variant!=='e74'&&data.variant!=='a08'&&(data.group==='engine'||engineMechanisms.has(data.mechanism));
}
export function isC41TransmissionStudyPart(data={}){
 return data.variant!=='e74'&&data.variant!=='a08'&&data.group==='transmission'&&!engineMechanisms.has(data.mechanism);
}
function rigid(m,q,p){m.quaternion.copy(q);m.position.copy(p).sub(p.clone().applyQuaternion(q));}
function opacity(m,alpha){if(!m.material.transparent){m.material.transparent=true;m.material.needsUpdate=true;}m.material.opacity=alpha;m.material.depthWrite=alpha>.9999;m.visible=alpha>.002;const shadowAlpha=alpha*smooth((alpha-.035)/.115);m.castShadow=shadowAlpha>.001;
 // Retain the skin layer used by cutaway panels. The frame renderer applies
 // continuous depth and context ordering across both the color and mask pass.
 if(m.userData.group==='body')m.renderOrder=10;
 if(!m.customDepthMaterial){
  const fade={value:alpha},depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,alphaHash:true});
  // Packed shadow depth omits the normal opacity uniform. Supply the same fade
  // explicitly so a ghosted panel does not leave an opaque silhouette behind.
  depth.onBeforeCompile=shader=>{shader.uniforms.displayOpacity=fade;shader.fragmentShader='uniform float displayOpacity;\n'+shader.fragmentShader.replace('vec4 diffuseColor = vec4( 1.0 );','vec4 diffuseColor = vec4(1.0, 1.0, 1.0, displayOpacity);').replace('#include <alphahash_fragment>','if (displayOpacity < .9999) {\n#include <alphahash_fragment>\n}');};
  depth.customProgramCacheKey=()=> 'vehicle-shadow-opacity-1';m.customDepthMaterial=depth;m.userData.shadowFade=fade;
 }
 m.customDepthMaterial.opacity=shadowAlpha;if(m.userData.shadowFade)m.userData.shadowFade.value=shadowAlpha;
 // Double-sided CAD skins retain studio reflection and cast onto the chassis.
 // Their near-coincident surfaces cannot reliably self-test a finite shadow map.
 m.receiveShadow=m.userData.group!=='body';}
export function createVehicleStudy(sources,{camera=null,captureProfile=null}={}){
 const root=new T.Group();root.name='shared-vehicle-study';const assembly=new T.Group();assembly.name='shared-vehicle-assembly';root.add(assembly);
 const extra=new T.Group();assembly.add(extra);const meshes=[],ids=new Set(),resources=new Set(),own=x=>(resources.add(x),x),framingCache=new Map();let motion={},lastTime=0,variants,electricChain,engineNative,vcuDetail=null;
 const explosionComposition=createExplosionComposition();
 function appendSources(list){explosionComposition.append(list);for(const m of list){if(ids.has(m.userData.id))continue;ids.add(m.userData.id);meshes.push(m);m.userData.framingPoints??=sampleGeometry(m.geometry);m.userData.baseColor??=m.material.color.clone();if(m.userData.sourceNative){m.userData.nativeRestTransform=new T.Matrix4().fromArray(m.userData.nativeRestMatrix||m.userData.installationMatrix);m.userData.nativeRestInverse=m.userData.nativeRestTransform.clone().invert();}assembly.add(m);}variants?.append(list.filter(m=>m.userData.variant==='e74'));electricChain?.append(list);engineNative?.append(list);}
 function appendAutonomousSources(list){const added=variants?.appendAutonomous(list)||0;if(added){autonomousPerception.append(list);a08Electrical.appendAutonomous(list);a08Hydraulics.appendAutonomous(list);if(!vcuDetail&&list.some(m=>m.userData.id==='a08-mcu-001'))vcuDetail=createA08VcuDetail(list);framingCache.clear();localFramingCache.clear();}return added;}
 appendSources(sources);
 electricChain=createNativeElectricChain(meshes);
 engineNative=createEngineNativeMotion(meshes);
 const hostedNative=meshes.filter(m=>m.userData.rigidHostId).map(mesh=>({mesh,host:meshes.find(m=>m.userData.id===mesh.userData.rigidHostId)})).filter(binding=>binding.host),hostPose=new T.Matrix4();
 const tyres=meshes.filter(m=>m.userData.label==='轮胎').sort((a,b)=>b.userData.center[0]-a.userData.center[0]);
 // Level the exported assembly from the actual tyre vertices. The source rear
 // tyres stand 64 mm above the front pair; do not carry that CAD pose onto a road.
 const ground=-.024,bodyPivot=V(-.185,0,.30);
 const support=(mesh,angle)=>{const a=mesh.geometry.attributes.position.array,s=Math.sin(angle),c=Math.cos(angle);let low=Infinity;for(let i=0;i<a.length;i+=3)low=Math.min(low,-s*a[i]+c*a[i+2]);return low;};
 const averageSupport=(list,a)=>list.reduce((n,m)=>n+support(m,a),0)/Math.max(1,list.length),frontTyres=tyres.filter(m=>m.userData.center[0]>0),rearTyres=tyres.filter(m=>m.userData.center[0]<0);
 let lowPitch=-.15,highPitch=.15;
 for(let i=0;i<26&&frontTyres.length&&rearTyres.length;i++){const a=(lowPitch+highPitch)/2;if(averageSupport(rearTyres,a)>averageSupport(frontTyres,a))highPitch=a;else lowPitch=a;}
 const ridePitch=tyres.length===4?(lowPitch+highPitch)/2:0,sourceGround=averageSupport(tyres,ridePitch),globalRideLift=ground-sourceGround,rideLift=globalRideLift-bodyPivot.clone().sub(bodyPivot.clone().applyAxisAngle(Y,ridePitch)).z;
 const corners=tyres.map(m=>{const c=V(...m.userData.center),side=Math.sign(c.y)||1,front=c.x>0,parts=meshes.filter(o=>(o.userData.mechanism||'').startsWith(front?'su-front_':'su-rear_')&&Math.sign(o.userData.center[1])===side);
  const pivot=upper=>{const points=parts.filter(o=>(o.userData.mechanism||'').includes(upper?'uca':'lca')).flatMap(o=>o.userData.framingPoints);if(!points.length)return {inner:V(c.x,side*.22,c.z+(upper?.09:-.08)),outer:V(c.x,side*(Math.abs(c.y)-.025),c.z+(upper?.09:-.08))};const ys=points.map(p=>Math.abs(p.y)),lo=Math.min(...ys),hi=Math.max(...ys),span=hi-lo;return {inner:mean(points.filter(p=>Math.abs(p.y)<lo+span*.055)),outer:mean(points.filter(p=>Math.abs(p.y)>hi-span*.035))};};
  const b=m.geometry.boundingBox;return {c,side,front,lower:pivot(false),upper:pivot(true),radius:Math.max(b.max.x-b.min.x,b.max.z-b.min.z)*.5,travel:0,steer:0,spin:0};
 });
 const cyclicPresentation=createCyclicPresentation(corners,captureProfile);
 for(const c of corners.filter(c=>c.front)){const ends=meshes.filter(m=>m.userData.mechanism==='st-tie_rods'&&Math.sign(m.userData.center[1])===c.side).map(m=>V(...m.userData.center)).sort((a,b)=>Math.abs(a.y)-Math.abs(b.y));if(ends.length>1)c.tie={inner:ends[0],outer:ends.at(-1)};}
 const wheelbase=Math.max(...corners.map(c=>c.c.x))-Math.min(...corners.map(c=>c.c.x)),rear=corners.filter(c=>!c.front),driveCentre=mean(rear.map(c=>c.c));
 const nearest=m=>corners.reduce((a,c)=>!a||V(...m.userData.center).distanceToSquared(c.c)<V(...m.userData.center).distanceToSquared(a.c)?c:a,null);
 const cornerMap=new Map(meshes.map(m=>[m,nearest(m)]));
 const rotors=new Set(meshes.filter(m=>{const r=m.userData.mechanism||'',l=m.userData.label||'';return l==='轮胎'||l==='轮辋'||r.startsWith('wt-')||l.includes('制动盘')||(m.userData.group==='suspension'&&/轮毂|轮芯|轮端法兰/.test(l));}));
 const pedal=meshes.find(m=>m.userData.label==='制动踏板'),pedalPivot=pedal?V(pedal.userData.center[0],pedal.userData.center[1],pedal.geometry.boundingBox.min.z+.012):V(.91,.08,.13);
 const chassis=createChassisMotion(meshes,{corners});extra.add(chassis.root);
 const driveline=createDrivelineKinematics(meshes,{corners,rotors});extra.add(driveline.root);
 const roadContact=createRoadContact(tyres,{corners,wheels:driveline.diagnostics().wheels,ground,roadHeight});
 const chassisState=()=>{const state=chassis.diagnostics();return {...state,legacyHalfshafts:state.halfshafts,halfshafts:driveline.diagnostics().halfshafts,halfshaftController:'native-driveline-kinematics'};};
 const core=createEngineCore();core.root.position.set(-.711,-.002,.233);core.root.quaternion.setFromUnitVectors(Z,V(.544,0,.839).normalize());extra.add(core.root);
 const engineOuter=meshes.filter(m=>m.userData.mechanism==='mo-power_unit'),engineBox=new T.Box3();engineOuter.forEach(m=>engineBox.expandByObject(m));
 const windows=engineOuter.map(m=>{const twin=new T.Mesh(m.geometry,m.material.clone());twin.material.onBeforeCompile=m.material.onBeforeCompile;twin.material.customProgramCacheKey=m.material.customProgramCacheKey;own(twin.material);twin.name='engine-window-'+m.userData.id;twin.userData.windowSource=m;assembly.add(twin);return twin;});
 const farPlane=new T.Plane(V(0,-1,0),-.002),nearPlane=farPlane.clone().negate(),worldFar=farPlane.clone(),worldNear=nearPlane.clone();
 // The native links themselves follow the native chain loop. No second chain
 // is overlaid, and its phase is identical in overview and system views.
 const chainLinks=meshes.filter(m=>/^transmission-\d+$/.test(m.userData.id)&&Number(m.userData.id.slice(13))>=85);
 const chainCentre=mean(chainLinks.map(m=>V(...m.userData.center)));
 chainLinks.sort((a,b)=>Math.atan2(a.userData.center[2]-chainCentre.z,a.userData.center[0]-chainCentre.x)-Math.atan2(b.userData.center[2]-chainCentre.z,b.userData.center[0]-chainCentre.x));
 const chainCurve=new T.CatmullRomCurve3(chainLinks.map(m=>V(...m.userData.center)),true,'centripetal');chainCurve.arcLengthDivisions=4096;
 const chainLengths=chainCurve.getLengths(),chainLength=chainLengths.at(-1),chainBindings=new Map(chainLinks.map((m,i)=>{const at=i/chainLinks.length*(chainLengths.length-1),j=Math.floor(at),s=T.MathUtils.lerp(chainLengths[j],chainLengths[Math.min(j+1,chainLengths.length-1)],at-j);return [m,{s,centre:V(...m.userData.center),tangent:chainCurve.getTangentAt(s/chainLength)}];}));
 const chainExtraction=createChainExtraction(chainLinks,chainBindings,chainCurve,chainLength);
 // Road coordinates move past one shared vehicle; every camera observes this condition.
 const roadSurface=createRoadSurface({ground});root.add(roadSurface.root);
 const aero=createAeroField({groundAt:x=>(ground-globalRideLift+.01+Math.sin(ridePitch)*x)/Math.cos(ridePitch),nativeMeshes:meshes});extra.add(aero.root);
 const aeroWing=createAeroWingSection(meshes,{camera});
 const aeroExplosion=createAeroExplosion(meshes);
 const frameResponse=createFrameResponse(meshes);extra.add(frameResponse.root);
 const halfBodyReveal=createHalfBodyReveal(meshes,{camera,assembly});
 variants=createVariantEffects(meshes);extra.add(variants.root);root.add(variants.symbolRoot);
 const restingOrientation=Q().setFromAxisAngle(Y,ridePitch),restingPosition=bodyPivot.clone().sub(bodyPivot.clone().applyQuaternion(restingOrientation)).add(V(0,0,rideLift));
 variants.operations.setSourceTransform(new T.Matrix4().compose(restingPosition,restingOrientation,V(1,1,1)));
 const completion=createPowertrainCompletion(meshes);extra.add(completion.root);
 const cockpit=createCockpitCompletion(meshes);extra.add(cockpit.root,cockpit.fixedRoot);
 const firewall=createCockpitFirewall(cockpit);extra.add(firewall.root);
 const instruments=createInstrumentCluster(meshes);extra.add(instruments.root);
 const engineHarness=createEngineHarness({meshes,instruments,assembly});extra.add(engineHarness.root);
 const a08Electrical=createA08Electrical({assembly}),a08Hydraulics=createA08Hydraulics({meshes,assembly});extra.add(a08Electrical.root,a08Hydraulics.root);
 const autonomousContext=createAutonomousContext(meshes),autonomousPerception=createAutonomousPerception(()=>variants.autoMeshes,{wheelbaseMeters:wheelbase});extra.add(autonomousContext.root,autonomousPerception.root);
 const annotations=createSystemAnnotations({meshes,assembly,getAutonomous:()=>variants.autoMeshes});
 // Capture fixed installation references before any operating pose or exploded
 // presentation is applied. These samples belong to the camera, not the model.
 root.updateMatrixWorld(true);
 const installedCloud=object=>{const out=[];object.traverse(m=>{if(m.isMesh&&m.geometry?.attributes.position){const n=m.geometry.attributes.position.array.length;for(const p of sampleGeometry(m.geometry,Math.max(24,Math.min(100,Math.floor(n/90)))))out.push(p.applyMatrix4(m.matrixWorld));}});return out;};
 const installedCockpit=[...installedCloud(cockpit.root),...installedCloud(cockpit.fixedRoot),...installedCloud(firewall.root),...instruments.framingPoints(),...meshes.filter(m=>m.userData.mechanism==='fr-headrest').flatMap(m=>m.userData.framingPoints.map(p=>p.clone()))],installedBottle=installedCloud(completion.bottle),installedClutch=installedCloud(completion.clutch),installedCore=installedCloud(core.root),installedHydraulics=chassis.hydraulics?.framingPoints()||[],localFramingCache=new Map();
 // Rotating parts keep one continuous displayed phase. Body pose may freeze
 // during a camera transfer, while the live condition still supplies speed.
 // Weight changes alter angular speed and never rewind accumulated revolutions.
 const rotationPhases=new Map();let rotationTime=null,rotationWeight=0;

 function selected(m,r){const d=m.userData,g=d.group;if(d.excludeFromFocusFraming)return false;if(r.department==='structure'&&g==='frame')return true;if(r.department==='structure'&&r.mode==='frame'&&d.mechanism==='fr-headrest')return true;if(r.mode==='all'||r.department==='operations')return d.variant!=='e74';if(r.department==='driverless')return r.mode!=='algorithm'&&autonomousCalipers.has(d.id);if(r.department==='power'&&r.variant==='e74'){if(d.variant!=='e74')return false;return r.mode==='power'||g===r.mode||r.mode==='wiring'&&(d.role?.startsWith('hvb-')||d.role==='busbar')||r.mode==='ecu'&&(d.role==='motor-housing'||d.role==='motor-rotor');}if(r.mode==='engine')return isC41EngineStudyPart(d);if(r.mode==='transmission')return isC41TransmissionStudyPart(d);if(['body','frame','suspension','steering','brakes'].includes(r.mode))return g===r.mode;return (tags[r.department]||[]).includes(g);}
 function targetOpacity(m,r){const d=m.userData,g=d.group,l=d.label;if(d.role==='ev-context-frame')return r.department==='power'&&r.variant==='e74'?.075:0;if(d.variant!=='e74'&&r.department==='power'&&r.variant==='e74'&&g==='frame')return 0;if(d.variant==='e74')return r.department==='power'&&r.variant==='e74'?(selected(m,r)?1:.035):0;if(r.department==='power'&&r.variant==='e74'&&(g==='engine'||g==='transmission'&&(variants.nativeElectric||d.mechanism!=='mo-halfshafts')))return 0;
  if(r.department==='driverless'&&variants.autonomous.hasNativeFrame&&(g==='frame'||d.mechanism==='fr-headrest'||g==='steering'&&d.mechanism!=='st-tie_rods'||['br-brake_pedal','br-accelerator_pedal'].includes(d.mechanism)))return 0;
  if(r.department==='structure'){if(l==='轮胎'||l==='轮辋')return .5;if(g==='body')return .75;}
  if(selected(m,r))return 1;if(r.department==='chassis'&&r.mode==='chassis'&&(l==='轮胎'||l==='轮辋'))return 1;if(r.department==='power'&&r.mode!=='engine'&&rotors.has(m)&&!cornerMap.get(m)?.front)return .055;
  if(r.department==='driverless'||r.department==='structure'){const size=d.presentationSize??=(m.geometry.boundingBox?.getSize(V()).length()||1);if(g==='body')return .026;if(g==='frame')return .095;if(l==='轮胎')return .115;if(l==='轮辋')return .13;if(size<.04)return .025;return .085;}
  const size=d.presentationSize??=(m.geometry.boundingBox?.getSize(V()).length()||1);if(size<.065&&g!=='frame'&&g!=='body')return 0;return g==='body'?.018:g==='frame'?.037:.027;}
 function apply(time,focus=[{department:'all',mode:'all',variant:'c41',weight:1}],exploded=0,presentation={}){
  lastTime=time;const k=clamp(presentation.poseMotionWeight??(exploded>0?0:1)),s=cyclicPresentation.condition(presentation.poseTime??time,wheelbase),live=presentation.poseTime===undefined||presentation.poseTime===time?s:cyclicPresentation.condition(time,wheelbase);let rack=s.steer*.065;
  const cycleMotion=cyclicPresentation.motion(time);cyclicPresentation.beginFrame(k,presentation.transitionStage,c=>rotationPhases.get(c)?.angle??0);
  const bodyQ=Q().setFromAxisAngle(Z,s.yaw*k).multiply(Q().setFromAxisAngle(Y,s.pitch*k+ridePitch)).multiply(Q().setFromAxisAngle(X,s.roll*k));
  const seek=!!presentation.seek||(rotationTime!==null&&time<rotationTime-1e-9),advance=rotationTime===null?0:Math.max(0,time-rotationTime),speedWeight=(rotationWeight+k)*.5;
  for(const c of corners){
   const sourceAngle=(live.distance-c.c.y*live.yaw)/Math.max(.16,c.radius);let phase=rotationPhases.get(c);
   if(!phase){phase={angle:k>0?sourceAngle*cyclicPresentation.scale(c):0,sourceAngle};rotationPhases.set(c,phase);}
   else if(seek)phase.angle=sourceAngle*cyclicPresentation.scale(c);
   else if(advance>1e-9)phase.angle+=(sourceAngle-phase.sourceAngle)*speedWeight*cyclicPresentation.scale(c);
   phase.sourceAngle=sourceAngle;c.spin=cyclicPresentation.angle(c,phase.angle,k);
   const roadPoint=c.c.clone().sub(bodyPivot).applyQuaternion(bodyQ).add(bodyPivot),input=roadHeight(s.x+roadPoint.x,s.y+roadPoint.y);c.travel=(-c.c.y*Math.sin(s.roll)+(c.c.x+.185)*Math.sin(s.pitch)+input-s.heave)*k;c.solved=solveCorner(c,c.travel);c.camber=c.solved.camber;c.steer=0;
  }
  rotationTime=time;rotationWeight=k;
  const axleAngle=rear.reduce((a,c)=>a+c.spin,0)/Math.max(1,rear.length),sourceAxleAngle=rear.reduce((a,c)=>a+rotationPhases.get(c).sourceAngle,0)/Math.max(1,rear.length);
  const axlePoseAngle=cyclicPresentation.phase(axleAngle);if(cyclicPresentation.enabled)for(const c of corners)c.spin=cyclicPresentation.phase(c.spin);
  const front=corners.filter(c=>c.front&&c.tie);function avg(a){front.forEach(c=>solveTieRod(c,a));return front.reduce((n,c)=>n+c.steer,0)/Math.max(1,front.length);}
  for(let i=0;i<6&&front.length;i++){const a=avg(rack),d=(avg(rack+.0001)-a)/.0001;if(Math.abs(d)<.01)break;rack=T.MathUtils.clamp(rack+(s.steer*k-a)/d,-.028,.028);}avg(rack);
  const bodyPosition=bodyPivot.clone().sub(bodyPivot.clone().applyQuaternion(bodyQ)).add(V(0,0,s.heave*k+rideLift));
  rack=roadContact.solve({bodyQuaternion:bodyQ,bodyPosition,x:s.x,y:s.y,weight:k,rack,targetSteer:s.steer*k}).rack;
  chassis.update({rack,steer:s.steer*k,brake:s.brake*k},corners,exploded);
  driveline.update();
  const effect=variants.update(focus,{...s,...cycleMotion,chassis:chassisState(),conditionTime:time},{exploded,operationsWeight:presentation.operationsWeight,poseMotionWeight:k});
  engineNative.update({conditionTime:time,poseMotionWeight:k},focus,exploded);
  for(const m of meshes){const d=m.userData,r=d.mechanism||'',c=cornerMap.get(m),g=d.group;if(d.sourceNative)d.nativeRestTransform.decompose(m.position,m.quaternion,m.scale);else{m.position.set(0,0,0);m.quaternion.identity();m.scale.setScalar(1);}
   if(engineNative.owns(m))engineNative.applyPart(m);
   else if(driveline.owns(m))driveline.applyPart(m);
   else if(chassis.owns(m))chassis.applyPart(m);
   else if(chainExtraction.has(m))chainExtraction.apply(m,cyclicPresentation.chainDistance(axleAngle,-C41_DRIVE.chainMetresPerAxleRadian,chainLength),exploded);
   else if(c&&rotors.has(m))uprightPose(m,c,c.spin);
   else if(c&&(r.includes('upright')||r==='br-wheel_brakes'))uprightPose(m,c);
   else if(c&&(r.includes('uca')||r.includes('lca'))){const upper=r.includes('uca');rigid(m,Q().setFromAxisAngle(X,upper?c.solved.upperAngle:c.solved.lowerAngle),(upper?c.upper:c.lower).inner);}
   else if(r==='st-tie_rods'&&c?.tie)tieRodPose(m,c);
   else if(r==='mo-halfshafts'){const corner=rear.find(c=>c.side===(Math.sign(d.center[1])||1));rigid(m,Q().setFromAxisAngle(Y,corner?.spin||0),driveCentre);}
   else if(r==='mo-final_drive'&&['transmission-055','transmission-056'].includes(d.id)){const corner=rear.find(c=>c.side===(Math.sign(d.center[1])||1));rigid(m,Q().setFromAxisAngle(Y,corner?.spin||0),V(-.962,0,.270));}
   else if(r==='mo-final_drive'&&['transmission-046','transmission-047','transmission-049','transmission-050','transmission-057'].includes(d.id))rigid(m,Q().setFromAxisAngle(Y,axlePoseAngle),V(-.962,0,.270));
   else if(m===pedal)rigid(m,Q().setFromAxisAngle(Y,s.brake*.12*k),pedalPivot);
   if((!d.sourceNative||d.nativeEngine)&&!d.rigidHostId&&!chainExtraction.has(m)){
    const extraction=explosionOrientation(d,exploded);if(extraction){const pivot=V(...(d.presentationPivot||d.center));m.position.applyQuaternion(extraction).add(pivot).sub(pivot.clone().applyQuaternion(extraction));m.quaternion.premultiply(extraction);}
    m.position.add(explosionPosition(d,exploded));
   }
   variants.transformPart(m);
   const alpha=focus.reduce((a,r)=>a+targetOpacity(m,r)*r.weight,0)*chassis.sourceVisibility(m,exploded)*variants.sourceFactor(m)*effect.assemblyAlpha,sharp=focus.reduce((a,r)=>a+(selected(m,r)?1:0)*r.weight,0);opacity(m,alpha);d.defocusWeight=1-sharp;d.defocus=d.defocusWeight>.5;
   for(const detail of d.detailMeshes||[]){opacity(detail,alpha*(detail.userData.detailOpacity??1));detail.userData.defocusWeight=d.defocusWeight;}
   m.material.emissive.setHex(g==='brakes'?0x9e5030:0);m.material.emissiveIntensity=g==='brakes'?s.brake*.13*k:0;
  }
  for(const {mesh,host} of hostedNative){host.updateMatrix();hostPose.copy(host.matrix).multiply(mesh.userData.nativeRestTransform).decompose(mesh.position,mesh.quaternion,mesh.scale);}
  chassis.syncAppearance?.(exploded);driveline.hideLegacyHelpers(chassis.root);const autonomousWeight=clamp(focus.reduce((n,r)=>n+(r.department==='driverless'?r.weight:0),0));chassis.root.traverse(o=>{if(o.isMesh)opacity(o,o.material.opacity*(o.userData.mechanism==='br-hydraulics'?1-autonomousWeight:1));});
  assembly.quaternion.copy(bodyQ);assembly.position.copy(bodyPosition);assembly.scale.setScalar(effect.assemblyScale);assembly.position.sub(V(0,0,.64)).multiplyScalar(effect.assemblyScale).add(V(0,0,.64));root.updateMatrixWorld(true);
  const engineFocus=focus.reduce((a,r)=>a+(r.variant!=='e74'?(r.mode==='engine'?1:r.department==='power'&&r.mode==='power'?.80:0)*r.weight:0),0),allFocus=focus.reduce((a,r)=>a+(r.mode==='all'?r.weight:0),0),electricFocus=focus.reduce((a,r)=>a+(r.department==='power'&&r.variant==='e74'?r.weight:0),0),coreAlpha=Math.max(engineFocus,allFocus*smooth((exploded-.05)/.25))*effect.assemblyAlpha*(1-smooth(electricFocus/.80));
  worldFar.copy(farPlane).applyMatrix4(assembly.matrixWorld);worldNear.copy(nearPlane).applyMatrix4(assembly.matrixWorld);
  windows.forEach(m=>{const source=m.userData.windowSource;m.position.copy(source.position);m.quaternion.copy(source.quaternion);m.scale.copy(source.scale);m.material.color.copy(source.material.color).lerp(new T.Color(0xb4d1df),engineFocus*.55);m.material.metalness=T.MathUtils.lerp(source.material.metalness,.08,engineFocus);m.material.roughness=T.MathUtils.lerp(source.material.roughness,.18,engineFocus);m.userData.defocusWeight=source.userData.defocusWeight;
   const show=engineFocus>.0001;source.material.clippingPlanes=show?[worldFar]:null;m.material.clippingPlanes=show?[worldNear]:null;opacity(m,show?source.material.opacity*(1-.96*engineFocus):0);
  });
  const engineAngle=cyclicPresentation.phase(axleAngle*C41_DRIVE.crankPerAxle,Math.PI*4);core.update(engineAngle);core.root.visible=coreAlpha>.002;core.root.traverse(o=>{if(o.isMesh){opacity(o,coreAlpha*T.MathUtils.lerp(1,o.userData.detailOpacity??1,engineFocus));o.userData.defocusWeight=0;}});
  const batteryView=focus.reduce((n,r)=>n+(r.department==='power'&&r.variant==='e74'&&['power','battery'].includes(r.mode)?r.weight:0),0);
  const electricMotion=updateNativeElectricParts(meshes,{rearAxleAngle:axlePoseAngle,leftRearWheelAngle:rear.find(c=>c.side>0)?.spin??axlePoseAngle,rightRearWheelAngle:rear.find(c=>c.side<0)?.spin??axlePoseAngle,motorAngle:cyclicPresentation.phase(axleAngle*37/11)},{windowsEnabled:electricFocus>.001,windowAmount:electricFocus,batteryView});
  electricChain.update(cyclicPresentation.electricInputs(axleAngle),1);electricMotion.chain=electricChain.diagnostics();
  for(const m of meshes)if(m.userData.presentationRotor)m.userData.presentationRotor.rotation.y=engineAngle;
  for(const m of [...variants.autoMeshes,...variants.electricMeshes])opacity(m,(m.userData.effectOpacity||0)*effect.assemblyAlpha);
  completion.update({...s,conditionTime:time,chassis:chassisState(),variants:effect},focus,exploded);completion.root.traverse(m=>{if(m.isMesh)opacity(m,m.material.opacity);});
  completion.clutchCable?.syncPresentation?.();
  cockpit.update({...s,variants:effect},focus,exploded);for(const object of [cockpit.root,cockpit.fixedRoot])object.traverse(m=>{if(m.isMesh)opacity(m,m.material.opacity);});
  firewall.update({...s,variants:effect},focus,exploded);for(const mesh of firewall.items)opacity(mesh,mesh.material.opacity);
  instruments.update({...s,variants:effect},focus,exploded);for(const mesh of instruments.items)opacity(mesh,mesh.material.opacity);
  engineHarness.update({...s,variants:effect},focus,exploded);for(const mesh of engineHarness.items)opacity(mesh,mesh.material.opacity);
  const aeroAlpha=focus.reduce((n,r)=>n+(r.department==='structure'?(r.mode==='frame'?0:r.mode==='body'?1:.35)*r.weight:0),0)*(1-smooth(exploded/.15));aero.update({...s,...cycleMotion,conditionTime:time},aeroAlpha);aeroWing.update(focus,exploded);aeroExplosion.update(focus,exploded);
  frameResponse.update(focus,{...s,conditionTime:time,poseMotionWeight:k,corners},exploded);
  halfBodyReveal.update(focus,exploded);
  root.updateMatrixWorld(true);const autonomousMotion={...s,...cycleMotion,conditionTime:time,chassis:chassisState(),variants:effect,poseMotionWeight:k};autonomousContext.update([],autonomousMotion);autonomousPerception.update(focus,autonomousMotion);a08Electrical.update(autonomousMotion,focus);a08Hydraulics.update(autonomousMotion,focus);vcuDetail?.update();for(const item of [...a08Electrical.items,...a08Hydraulics.items,...(vcuDetail?.items||[])])opacity(item,item.material.opacity);
  const roadWeight=(1-allFocus)*(1-engineFocus*.92)*(1-smooth(exploded/.1))*effect.assemblyAlpha;roadSurface.update({courseX:s.x,courseY:s.y,weight:roadWeight});
  motion={captureCycle:cyclicPresentation.diagnostics(),carOffset:V(),yaw:s.yaw,roll:s.roll,pitch:s.pitch,heave:s.heave,steer:s.steer,brake:s.brake,speed:s.speed,stage:s.stage,distance:s.distance,engineAngle,axleAngle,conditionTime:time,drivePhase:{sourceTime:time,sourceDistance:live.distance,displayedAxleAngle:axleAngle,sourceAxleAngle,axlePhaseOffset:axleAngle-sourceAxleAngle,speedWeight:k,seek,ratio:C41_DRIVE.crankPerAxle,chainMetresPerAxleRadian:C41_DRIVE.chainMetresPerAxleRadian,ratioBasis:C41_DRIVE.basis},driveline:driveline.diagnostics(),electricMotion,engineNative:engineNative.diagnostics(),autonomousContext:autonomousContext.diagnostics(),autonomousPerception:autonomousPerception.diagnostics(),a08Electrical:a08Electrical.diagnostics({includeDetails:false}),a08Hydraulics:a08Hydraulics.diagnostics({includePaths:false}),vcuDetail:vcuDetail?.diagnostics()||null,aeroAlpha,aeroWing:aeroWing.diagnostics(),aeroExplosion:aeroExplosion.diagnostics(),frameResponse:frameResponse.diagnostics(),halfBodyReveal:halfBodyReveal.diagnostics(),explosionComposition:explosionComposition.diagnostics(),aeroLines:aero.lineCount,aeroSurfaceCounts:aero.diagnostics.surfaceFlow?.sourceCurveCounts||[],aeroOuterPaths:aero.diagnostics.outerFlow?.paths||0,poseMotionWeight:k,roadContact:roadContact.diagnostics(),roadSurface:roadSurface.diagnostics(),variants:effect,completion:completion.diagnostics(),instruments:instruments.diagnostics(),engineHarness:engineHarness.diagnostics(),rideLevel:{pitch:ridePitch,globalLift:globalRideLift,ground},chassis:chassisState(),corners:corners.map(c=>({travel:c.travel,steer:c.steer,spin:c.spin,...c.solved,tieError:c.tie?.error||0}))};root.updateMatrixWorld(true);
 }
 function focusMeshes(request){if(request.mode==='all')return meshes.filter(m=>m.userData.variant!=='e74');if(request.department==='operations')return variants.operationsMeshes();if(request.department==='driverless')return variants.autonomousFocusMeshes(request);const items=meshes.filter(m=>selected(m,request));return items.length?items:meshes;}
 function autonomousWheelFraming(request){if(request.mode==='algorithm')return [];return meshes.filter(m=>autonomousCalipers.has(m.userData.id)).flatMap(m=>(m.userData.framingPoints||sampleGeometry(m.geometry)).flatMap(p=>[p.clone().add(V(.045,0,0)),p.clone().add(V(-.045,0,0)),p.clone().add(V(0,.045,0)),p.clone().add(V(0,-.045,0)),p.clone().add(V(0,0,.045)),p.clone().add(V(0,0,-.045))]));}
 function localFramingPoints(request,subject='system'){
  const key=[request.department,request.mode,request.variant,subject,meshes.length,variants.autonomousRevision].join('/');if(localFramingCache.has(key))return localFramingCache.get(key);
  if(request.department==='driverless'){const points=[...variants.autonomousFramingPoints(request),...a08Hydraulics.framingPoints(request),...autonomousWheelFraming(request),...instruments.framingPoints(request),...autonomousContext.framingPoints(request),...(request.mode==='algorithm'?autonomousPerception.framingPoints(request):[])];localFramingCache.set(key,points);return points;}
  if(subject==='cockpit'){localFramingCache.set(key,installedCockpit);return installedCockpit;}
  const points=meshes.filter(m=>selected(m,request)||request.department==='structure'&&m.userData.variant!=='e74'&&(m.userData.group==='body'||['轮胎','轮辋'].includes(m.userData.label))).flatMap(m=>m.userData.framingPoints||sampleGeometry(m.geometry));
  if(request.variant==='e74')for(const owner of meshes.filter(m=>selected(m,request)))for(const detail of owner.userData.detailMeshes||[]){
   const local=new T.Matrix4();for(let o=detail;o&&o!==owner;o=o.parent){o.updateMatrix();local.premultiply(o.matrix);}
   for(const p of sampleGeometry(detail.geometry))points.push(p.applyMatrix4(local));
  }
  if(request.department==='structure')points.push(...installedCockpit);
  else points.push(...instruments.framingPoints(request));
  if(request.mode==='all'||request.mode==='brakes'||request.mode==='chassis')points.push(...installedHydraulics);
  if(request.department==='chassis'&&request.mode==='steering')points.push(...engineHarness.framingPoints(request));
  if(request.department==='power'&&request.variant!=='e74'){
   if(request.mode==='power'||request.mode==='engine')points.push(...installedBottle,...installedClutch);
   if(request.mode==='engine'||request.mode==='power')points.push(...installedCore);
  }
  // Small local articulation allowance; the assembly's global yaw/roll/pitch
  // is followed exactly by the camera anchors and does not consume this margin.
  const allowance=request.department==='chassis'?.025:request.mode==='transmission'?.012:0;
  const cloud=allowance?points.flatMap(p=>[p.clone().add(V(allowance,0,0)),p.clone().add(V(-allowance,0,0)),p.clone().add(V(0,allowance,0)),p.clone().add(V(0,-allowance,0)),p.clone().add(V(0,0,allowance)),p.clone().add(V(0,0,-allowance))]):points;
  localFramingCache.set(key,cloud);return cloud;
 }
 function framingPoints(request){
  const key=[request.department,request.mode,request.variant,meshes.length,variants.autonomousRevision].join('/');if(framingCache.has(key))return framingCache.get(key);
  if(request.department==='operations')return [V(-1.12,-.025,-.04),V(1.12,.025,1.32)];
  const canonical=new T.Matrix4().compose(V(0,0,globalRideLift),Q().setFromAxisAngle(Y,ridePitch),V(1,1,1));
  if(request.department==='driverless'){const points=[...variants.autonomousFramingPoints(request),...a08Hydraulics.framingPoints(request),...autonomousWheelFraming(request),...instruments.framingPoints(request),...autonomousContext.framingPoints(request),...(request.mode==='algorithm'?autonomousPerception.framingPoints(request):[])].map(p=>p.clone().applyMatrix4(canonical));framingCache.set(key,points);return points;}
  const points=focusMeshes(request).flatMap(m=>(m.userData.framingPoints||sampleGeometry(m.geometry)).map(p=>p.clone().applyMatrix4(canonical)));
  points.push(...instruments.framingPoints(request,canonical));
  if(request.department==='structure')points.push(...installedCockpit.map(p=>p.clone().applyMatrix4(canonical)));
  if(request.mode==='all'||request.mode==='brakes'||request.mode==='chassis')points.push(...installedHydraulics.map(p=>p.clone().applyMatrix4(canonical)));
  if(request.department==='power'&&request.variant!=='e74'&&['power','engine'].includes(request.mode))points.push(...installedBottle.map(p=>p.clone().applyMatrix4(canonical)),...installedClutch.map(p=>p.clone().applyMatrix4(canonical)),...installedCore.map(p=>p.clone().applyMatrix4(canonical)));
  framingCache.set(key,points);return points;
 }
 function labels(request){
  if(request.department==='structure'&&request.mode==='frame')return frameResponse.labels(request).map(({text,point})=>({text,point:point.applyMatrix4(assembly.matrixWorld)}));
  if(request.department==='driverless')return [...variants.autonomousLabels(request),...a08Hydraulics.labels(request),...autonomousPerception.labels(request)].map(({text,point})=>({text,point:point.applyMatrix4(assembly.matrixWorld)}));
  if(request.department==='power'&&request.variant==='e74'&&variants.nativeElectric){
   const byRole=(roles,text)=>{const mesh=roles.map(role=>meshes.find(m=>m.userData.sourceNative&&m.userData.role===role)).find(Boolean);if(!mesh)return null;mesh.updateWorldMatrix(true,false);return {text,point:V(...mesh.userData.center).applyMatrix4(mesh.userData.nativeRestInverse).applyMatrix4(mesh.matrixWorld)};};
   const specs=request.mode==='battery'?[[['accumulator-case'],'电池箱'],[['battery-cell','module-frame'],'电芯模组']]:request.mode==='wiring'?[[['hvb-case'],'高压盒'],[['hv-busbar','busbar'],'汇流排']]:request.mode==='transmission'?[[['motor-housing'],'电机'],[['sprocket-output','differential'],'链传动与差速器'],[['halfshaft-left','halfshaft-right'],'驱动半轴']]:request.mode==='ecu'?[[['motor-controller'],'电机控制器'],[['motor-housing'],'电机']]:[[['accumulator-case'],'电池箱'],[['hvb-case'],'高压盒'],[['motor-housing'],'电机']];
   return specs.map(([roles,text])=>byRole(roles,text)).filter(Boolean);
  }
  if(request.department==='power'&&request.variant!=='e74'&&request.mode==='engine'){
   const anchor=(mechanism,text,role)=>{
    const candidates=meshes.filter(m=>m.userData.mechanism===mechanism&&isC41EngineStudyPart(m.userData));
    const preferred=candidates.filter(m=>!role||m.userData.role===role),pool=preferred.length?preferred:candidates;
    const size=m=>m.userData.presentationSize??m.geometry.boundingBox?.getSize(V()).length()??0;
    const mesh=pool.reduce((largest,m)=>!largest||size(m)>size(largest)?m:largest,null);if(!mesh)return null;
    const data=mesh.userData,point=V(...data.center);if(data.sourceNative&&data.nativeRestInverse)point.applyMatrix4(data.nativeRestInverse);
    mesh.updateWorldMatrix(true,false);return {text,point:point.applyMatrix4(mesh.matrixWorld)};
   };
   const labels=[anchor('mo-power_unit','发动机'),anchor('mo-intake','进气系统'),anchor('mo-exhaust','排气系统','exhaust-fixed'),anchor('mo-cooling','冷却系统','cooling-radiator-fixed'),anchor('mo-fuel','燃油系统'),anchor('mo-lubrication','润滑系统')].filter(Boolean);
   const ecuLabel=anchor('mo-engine-electrics','M150 ECU','engine-controller-fixed');if(ecuLabel)labels.push(ecuLabel);
   if(instruments.labels)labels.push(...instruments.labels(request));
   const clutch=engineNative.labels(request);if(clutch.length)labels.push(...clutch.map(({text,point})=>({text,point:point.applyMatrix4(assembly.matrixWorld)})));
   else{const label=anchor('mo-clutch-control','离合操纵','clutch-lever');if(label)labels.push(label);}
   return labels;
  }
  const motor=meshes.find(m=>m.userData.variant==='e74'&&m.userData.presentationCenter),motorPoint=motor?V(...(motor.userData.motorOutputPoint||motor.userData.presentationCenter)).applyMatrix4(motor.matrix):V(-.80314,0,.19385);
  const specific={brakes:[['双回路制动主缸',V(.98,.04,.22)],['前轮制动器',V(.735,.48,.28)]],steering:[['转向轴',V(.24,0,.49)],['转向机与横拉杆',V(.70,.12,.19)]],suspension:[['前轮减振器',V(.73,.32,.51)],['后轮减振机构',V(-.97,.22,.50)]],frame:[['承载车架',V(.20,.25,.38)],['座椅与六点式安全带',V(-.16,0,.34)],['头枕与防火墙',V(-.465,0,.79)]]}[request.mode];
  if(specific)return specific.map(([text,point])=>({text,point:point.applyMatrix4(assembly.matrixWorld)}));
  const local=request.department==='power'&&request.variant==='e74'?(request.mode==='battery'?[['电池箱',V(-.474,.225,.24)]]:request.mode==='wiring'?[['高压配电盒',V(-.634,-.174,.44)],['低压供电盒',V(-.214,.12,.15)]]:request.mode==='transmission'?[['电机与输出轴',motorPoint.clone()]]:request.mode==='ecu'?[['电机控制器',V(-.634,.24,.49)],['电机',motorPoint.clone()]]:[['电机控制器',V(-.634,.24,.49)],['电池箱',V(-.474,.225,.24)],['电机',motorPoint.clone()]]):request.mode==='transmission'?[['差速器与主传动',V(-.962,.089,.32)],['驱动半轴',V(-.962,.34,.27)]]:request.department==='chassis'?[['制动踏板',pedalPivot.clone().add(V(0,0,.18))],['前轮与悬架',V(.60,.52,.27)]]:request.department==='structure'?[['车身覆盖件',V(.35,0,.64)],['承载车架',V(-.15,.25,.38)]]:request.department==='power'?[['动力总成',V(-.69,0,.47)],['主传动',V(-.962,.12,.27)]]:[];return [...local.map(([text,point])=>({text,point})),...engineNative.labels(request).filter(()=>request.mode==='power')].map(({text,point})=>({text,point:point.applyMatrix4(assembly.matrixWorld)}));}
 return {root,meshes,assembly,annotations,cyclicPresentation,appendSources,appendAutonomousSources,apply,focusMeshes,framingPoints,localFramingPoints,overviewPoints:()=>[...aeroExplosion.framingPoints({matrix:assembly.matrixWorld}),...visiblePoints([...meshes.filter(m=>m.userData.variant!=='e74'),...cockpit.items,...firewall.items,...instruments.items.filter(m=>m.userData.variant==='c41')]),...(chassis.hydraulics?.framingPoints()||[]).map(p=>p.applyMatrix4(chassis.hydraulics.root.matrixWorld))],labels,getMotion:()=>motion,core,windows,chassis,driveline,engineNative,roadContact,roadSurface,chainExtraction,aero,aeroWing,aeroExplosion,frameResponse,halfBodyReveal,explosionComposition,variants,completion,cockpit,firewall,instruments,engineHarness,a08Electrical,a08Hydraulics,get vcuDetail(){return vcuDetail;},autonomousContext,autonomousPerception,
  async prepareAutonomous(camera){if(camera)autonomousContext.setCamera(camera);await autonomousPerception.prepare();},
  dispose(){root.traverse(o=>o.customDepthMaterial?.dispose());core.dispose();chassis.dispose();driveline.dispose();electricChain.dispose();engineNative.dispose();roadSurface.dispose();frameResponse.dispose();halfBodyReveal.dispose();explosionComposition.dispose();aeroExplosion.dispose();aeroWing.dispose();aero.dispose();vcuDetail?.dispose();variants.dispose();completion.dispose();cockpit.dispose();firewall.dispose();instruments.dispose();engineHarness.dispose();a08Electrical.dispose();a08Hydraulics.dispose();autonomousContext.dispose();autonomousPerception.dispose();resources.forEach(x=>x.dispose());meshes.forEach(m=>{m.material.clippingPlanes=null;});root.clear();}
 };
}
