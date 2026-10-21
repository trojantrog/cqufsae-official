import * as T from './vendor/three.module.min.js';
import {captureClock,captureAngularFrequency,captureFrequency} from './cyclic-presentation-753.js?v=761';

const V=(...a)=>new T.Vector3(...a),clamp=x=>T.MathUtils.clamp(x,0,1),smooth=x=>{x=clamp(x);return x*x*x*(3-2*x);};
// The source mounting axes orient the graphics. Range and field angles are
// display parameters; these outlines contain no acquired sensor samples.
const mounting={lidar:{forward:[1,0,0],up:[0,.000273492256,.999999962601]},
 camera:{forward:[.999722424077,-.023559840195,.000093417224],up:[0,.003965073145,.999992139067]}};
const display={lidarRange:1.05,lidarAzimuth:Math.PI*2,cameraRange:1.1,cameraHalfWidth:.52,cameraHalfHeight:.30};

function shapeFor(data){
 if(data.role==='lidar-fixed'||data.role==='radar-fixed')return 'lidar';
 if(data.role==='camera-fixed')return 'camera';
 if(data.role==='steering-motor-fixed')return 'steering';
 if(data.role==='brake-cylinder-body-fixed')return 'brake';
 return null;
}

export function createAutonomousPerception(getAutonomousMeshes=[],{wheelbaseMeters=1.533690989}={}){
 const root=new T.Group();root.name='autonomous-perception-demonstration';const groups=[],bindings=new Map(),resources=new Set(),own=value=>(resources.add(value),value);
 const inverseRoot=new T.Matrix4(),relative=new T.Matrix4(),worldPoint=V();let last={ready:false,sensorParts:0,controlParts:0,conditionTime:0},disposed=false;
 function line(points,color,opacity,{segments=false,dashed=false,dynamic=false}={}){
  const geometry=own(new T.BufferGeometry());geometry.setAttribute('position',new T.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));
  const material=own(dashed?new T.LineDashedMaterial({color,dashSize:.024,gapSize:.017,transparent:true,opacity,depthWrite:false,depthTest:true,toneMapped:false}):
   new T.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false,depthTest:true,toneMapped:false}));
  const object=segments?new T.LineSegments(geometry,material):new T.Line(geometry,material);if(dashed)object.computeLineDistances();object.frustumCulled=false;object.renderOrder=20;
  object.userData={baseOpacity:opacity,illustrativeOverlay:true,partCounted:false,measuredSensorData:false,dynamic};return object;
 }
 function add(source){
  if(!source?.isMesh||source.userData.variant!=='a08'||bindings.has(source))return false;
  const kind=shapeFor(source.userData);if(!kind)return false;
  const group=new T.Group();group.name='autonomous-'+kind+'-demonstration';group.matrixAutoUpdate=false;root.add(group);groups.push(group);
  const anchor=V(...(source.userData.perceptionOrigin||source.userData.center)),binding={source,kind,group,anchor,localAnchor:anchor.clone(),objects:[],fieldPoints:[]};
  if(kind==='lidar'){
   for(const radius of [.40,.72,display.lidarRange]){
    const points=Array.from({length:97},(_,i)=>{const angle=i/96*Math.PI*2;return V(Math.cos(angle)*radius,Math.sin(angle)*radius,-radius*.04);});
    binding.objects.push(line(points,0x428b92,.34,{dashed:true}));binding.fieldPoints.push(...points.filter((_,i)=>i%24===0).map(p=>p.clone()));
   }
   binding.sweep=line([V(),V(display.lidarRange,0,-display.lidarRange*.04)],0x297b84,.72,{dynamic:true});binding.objects.push(binding.sweep);
   binding.sweep.name='lidar-rotating-azimuth';
   binding.preview=line(Array.from({length:33},()=>V()),0x327e85,.62,{dynamic:true});binding.objects.push(binding.preview);
  }else if(kind==='camera'){
   const r=display.cameraRange,w=display.cameraHalfWidth*r,h=display.cameraHalfHeight*r,corners=[V(r,-w,-h),V(r,w,-h),V(r,w,h),V(r,-w,h)],points=[];
   for(let i=0;i<4;i++)points.push(V(),corners[i].clone(),corners[i].clone(),corners[(i+1)%4].clone());
   binding.objects.push(line(points,0x557e92,.38,{segments:true,dashed:true}));binding.fieldPoints.push(...corners);
   // Active stereo acquires a complete image pair. A fixed image-plane grid
   // brightens as a whole; no beam or plane travels through the scene depth.
   const grid=[];
   for(let i=0;i<=4;i++){const y=T.MathUtils.lerp(-w,w,i/4),z=T.MathUtils.lerp(-h,h,i/4);grid.push(V(r,y,-h),V(r,y,h),V(r,-w,z),V(r,w,z));}
   binding.imageFrame=line(grid,0x426f87,.30,{segments:true});binding.imageFrame.name='stereo-image-frame';binding.objects.push(binding.imageFrame);
  }else{
   const radius=kind==='steering'?.043:.035,points=Array.from({length:41},(_,i)=>V(0,Math.cos(i/40*Math.PI*2)*radius,Math.sin(i/40*Math.PI*2)*radius));
   binding.halo=line(points,kind==='steering'?0xb08348:0xac5948,.36);binding.objects.push(binding.halo);binding.fieldPoints.push(...points.filter((_,i)=>i%10===0));
  }
  if(mounting[kind]){
   const forward=V(...mounting[kind].forward).normalize(),up=V(...mounting[kind].up),side=up.clone().cross(forward).normalize();up.copy(forward).cross(side).normalize();group.matrix.makeBasis(forward,side,up).setPosition(anchor);
  }else group.matrix.makeTranslation(...anchor.toArray());
  binding.installedFrame=group.matrix.clone();group.add(...binding.objects);bindings.set(source,binding);return true;
 }
 function append(list=[]){let added=0;for(const source of list)if(add(source))added++;return added;}
 function fetchSources(){return typeof getAutonomousMeshes==='function'?getAutonomousMeshes():getAutonomousMeshes;}
 function frame(binding){
  binding.source.updateWorldMatrix(true,false);relative.copy(inverseRoot).multiply(binding.source.matrixWorld);
  const anchor=binding.anchor.clone().applyMatrix4(relative);binding.localAnchor.copy(anchor);
  if(mounting[binding.kind]){
   const forward=V(...mounting[binding.kind].forward).transformDirection(relative),up=V(...mounting[binding.kind].up).transformDirection(relative),side=up.clone().cross(forward).normalize();up.copy(forward).cross(side).normalize();
   binding.group.matrix.makeBasis(forward,side,up).setPosition(anchor);
  }else binding.group.matrix.copy(relative).setPosition(anchor);
  binding.group.matrixWorldNeedsUpdate=true;
 }
 function update(focus=[],motion={}){
  if(disposed)return last;const started=performance.now();append(fetchSources()||[]);
  const weight=focus.reduce((n,r)=>n+(r.department==='driverless'?r.weight:0),0),alpha=smooth(weight),sharp=kind=>weight>1e-9?focus.reduce((n,r)=>n+(r.department==='driverless'?r.weight*(r.mode==='control'?(kind==='steering'||kind==='brake'?1:.18):r.mode==='algorithm'?(kind==='lidar'||kind==='camera'?1:.15):1):0),0)/weight:0;
  root.visible=alpha>.002&&bindings.size>0;if(!root.visible){last={...last,ready:bindings.size>0,updateMilliseconds:performance.now()-started};return last;}
  root.updateWorldMatrix(true,false);inverseRoot.copy(root.matrixWorld).invert();
  const time=Number.isFinite(motion.conditionTime)?captureClock(motion):0,steering=motion.chassis?.steering,
   steer=steering?.steer??motion.steer??0,brake=clamp(motion.variants?.autonomousMotion?.brake??steering?.brake??(motion.brake||0)*(motion.poseMotionWeight??1)),rack=steering?.rack??0;
  for(const binding of bindings.values()){
   frame(binding);const contrast=sharp(binding.kind),activity=binding.kind==='brake'?brake:binding.kind==='steering'?Math.min(1,Math.abs(steer)/.12):1;
   for(const object of binding.objects){object.material.opacity=object.userData.baseOpacity*alpha*contrast*(binding.kind==='brake'||binding.kind==='steering'?.30+.70*activity:1);object.visible=object.material.opacity>.002;}
   if(binding.sweep){
    // The internal scanner turns continuously through 360 degrees. Playback
    // is slowed for readability; the installed outer housing stays fixed.
    const angle=time*captureAngularFrequency(1.65,motion),position=binding.sweep.geometry.attributes.position;
    position.setXYZ(1,Math.cos(angle)*display.lidarRange,Math.sin(angle)*display.lidarRange,-display.lidarRange*.04);position.needsUpdate=true;
    const path=binding.preview.geometry.attributes.position,curvature=Math.tan(steer)/wheelbaseMeters;
    for(let i=0;i<path.count;i++){const s=.90*i/(path.count-1),angle=s*curvature,x=Math.abs(curvature)>1e-7?Math.sin(angle)/curvature:s,y=Math.abs(curvature)>1e-7?(1-Math.cos(angle))/curvature:0;path.setXYZ(i,x,y,-.055);}
    path.needsUpdate=true;binding.preview.material.color.setHex(brake>.05?0xac5948:0x327e85);
   }
   if(binding.imageFrame){const pulse=.55+.45*Math.pow(.5+.5*Math.cos(time*captureFrequency(.65,motion)*Math.PI*2),4);binding.imageFrame.material.opacity*=pulse;}
  }
  root.updateMatrixWorld(true);last={ready:true,sensorParts:[...bindings.values()].filter(b=>mounting[b.kind]).length,controlParts:[...bindings.values()].filter(b=>!mounting[b.kind]).length,
   conditionTime:time,control:{steer,rack,brake,workingStrokeMeters:brake*.0275,capacityMeters:.03,reducerRatio:10,ratioBasis:'illustrative'},
   origins:[...bindings.values()].map(b=>({id:b.source.userData.id,kind:b.kind,installationPoint:b.anchor.toArray(),localPoint:b.localAnchor.toArray(),sourceRigidPoseUnchanged:true})),
   acquiredSensorData:false,acquisition:{lidar:'continuous full-azimuth rotation',camera:'simultaneous stereo image pair',playbackRate:'slowed illustration'},fieldParameters:{...display,basis:'illustrative'},updateMilliseconds:performance.now()-started};return last;
 }
 function framingPoints(request={}){
  if(request.department!=='driverless')return [];
  const selected=[...bindings.values()].filter(b=>request.mode==='control'?['steering','brake'].includes(b.kind):['lidar','camera'].includes(b.kind));
  return selected.flatMap(b=>[V(),...b.fieldPoints].map(p=>p.clone().applyMatrix4(b.installedFrame)));
 }
 function labels(request={}){
  if(request.department!=='driverless')return [];
  const output=[];
  if(request.mode==='control'){for(const b of bindings.values())if(b.kind==='steering'||b.kind==='brake')output.push({text:b.kind==='steering'?'转向控制示意':'制动控制示意',point:b.localAnchor.clone().add(V(0,.06,.045))});}
  else{const lidar=[...bindings.values()].find(b=>b.kind==='lidar');if(lidar)output.push({text:'感知范围示意',point:V(.63,.43,-.04).applyMatrix4(lidar.group.matrix)});}
  return output;
 }
 append(fetchSources()||[]);
 return {root,groups,append,update,framingPoints,labels,prepare:async()=>{append(fetchSources()||[]);last={...last,ready:bindings.size>0,sensorParts:[...bindings.values()].filter(b=>mounting[b.kind]).length,controlParts:[...bindings.values()].filter(b=>!mounting[b.kind]).length};return last;},diagnostics:()=>({...last}),
  dispose(){if(disposed)return;disposed=true;resources.forEach(resource=>resource.dispose());root.clear();bindings.clear();groups.length=0;}
 };
}
