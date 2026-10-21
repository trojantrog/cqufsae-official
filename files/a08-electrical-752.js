import * as T from './vendor/three.module.min.js';
import {prepareInSlices} from './runtime-prepare-761.js';

const V=(...p)=>new T.Vector3(...p),Z=V(0,0,1),clamp=x=>T.MathUtils.clamp(x,0,1);
const smooth=x=>{x=clamp(x);return x*x*x*(3-2*x);};
const MCU='a08-mcu-001',LEEP='a08-context-electronics-004';

function roundedPath(nodes,count){
 const path=[nodes[0].clone()];
 for(let i=1;i<nodes.length-1;i++){
  const p=nodes[i],a=nodes[i-1],b=nodes[i+1],radius=Math.min(.027,p.distanceTo(a)*.27,p.distanceTo(b)*.27),entry=p.clone().lerp(a,radius/Math.max(1e-10,p.distanceTo(a))),exit=p.clone().lerp(b,radius/Math.max(1e-10,p.distanceTo(b)));
  path.push(entry);for(let j=1;j<=6;j++){const t=j/6;path.push(entry.clone().multiplyScalar((1-t)**2).addScaledVector(p,2*(1-t)*t).addScaledVector(exit,t*t));}
 }
 path.push(nodes.at(-1).clone());const lengths=[0];for(let i=1;i<path.length;i++)lengths.push(lengths.at(-1)+path[i].distanceTo(path[i-1]));let segment=0;
 return Array.from({length:count},(_,i)=>{const d=lengths.at(-1)*i/(count-1);while(segment<path.length-2&&lengths[segment+1]<d)segment++;return path[segment].clone().lerp(path[segment+1],(d-lengths[segment])/Math.max(1e-12,lengths[segment+1]-lengths[segment]));});
}

function* closestSteps(mesh,target){
 const p=mesh.geometry.attributes.position,index=mesh.geometry.index,a=V(),b=V(),c=V(),at=V(),triangle=new T.Triangle();let best=Infinity,point=null,face=-1;
 const count=index?.count??p.count;
 for(let i=0;i<count;i+=3){if(i&&i%3072===0)yield;a.fromBufferAttribute(p,index?index.getX(i):i);b.fromBufferAttribute(p,index?index.getX(i+1):i+1);c.fromBufferAttribute(p,index?index.getX(i+2):i+2);triangle.set(a,b,c);triangle.closestPointToPoint(target,at);const d=at.distanceToSquared(target);if(d<best){best=d;point=at.clone();face=i/3;}}
 return {point,face,distance:Math.sqrt(best)};
}

// All component surfaces are original A08 meshes. The additional connectors
// and frame-guided loom are presentation geometry, with no pin assignment.
export function createA08Electrical({assembly}={}){
 const root=new T.Group();root.name='a08-electrical-connections';
 const items=[],owners=new Map(),ports=new Map(),wires=[],resources=new Set(),inverse=new T.Matrix4(),matrix=new T.Matrix4();
 const own=o=>(resources.add(o),o),fixed=p=>({position:V(...p)}),missing=new Set();
 let built=false,buildAttempted=false,buildIterator=null,preparePromise=null,deferred=false,preparation=null,revision=0,state={ready:false,visibleWires:0},disposed=false;
 function displayMesh(geometry,material,name){const mesh=new T.Mesh(own(geometry),own(material));mesh.name=name;mesh.visible=false;mesh.receiveShadow=true;mesh.userData={id:name,variant:'a08',group:'electronics',mechanism:'av-electrical',partCounted:false,presentationOnly:true,defocusWeight:0};root.add(mesh);items.push(mesh);return mesh;}
 function* port(name,id,{point,face=[0,1,0],offset=[0,0,0],channel='control',shape='round',radius=.005}={}){
  const owner=owners.get(id);if(!owner){missing.add(id);return null;}
  const geometry=owner.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();const box=geometry.boundingBox,size=box.getSize(V()),direction=V(...face).normalize(),target=point?V(...point):box.getCenter(V());
  if(!point){for(let i=0;i<3;i++){if(face[i])target.setComponent(i,face[i]>0?box.max.getComponent(i):box.min.getComponent(i));else target.setComponent(i,target.getComponent(i)+size.getComponent(i)*(offset[i]||0));}}
  const surface=yield* closestSteps(owner,target);if(!surface.point){missing.add(name);return null;}
  const length=shape==='round'?.020:.018;
  const body=displayMesh(shape==='round'?new T.CylinderGeometry(radius*.84,radius,length,16).rotateX(Math.PI/2):new T.BoxGeometry(shape==='network'?.014:.012,.007,length),new T.MeshStandardMaterial({color:0x282e31,roughness:.67,metalness:.08,transparent:true,opacity:0}),name+'-boot');
  const collar=displayMesh(new T.CylinderGeometry(radius*1.07,radius*1.07,.003,shape==='round'?12:16).rotateX(Math.PI/2),new T.MeshStandardMaterial({color:0x899297,roughness:.37,metalness:.8,transparent:true,opacity:0}),name+'-collar');
  const value={name,id,owner,local:surface.point,normal:direction,surface:V(),direction:V(),position:V(),lead:V(),body,collar,length,channel,sourceFace:surface.face,requestedSurfaceDistance:surface.distance,shape};ports.set(name,value);return value;
 }
 function wire(id,start,end,guides=[],{radius=.002,channel='control'}={}){
  if(!start||!end)return;
  const rings=80,sides=8,positions=new Float32Array(rings*sides*3),normals=new Float32Array(positions.length),indices=new Uint16Array((rings-1)*sides*6);let k=0;
  for(let i=0;i<rings-1;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=(i+1)*sides+j,c=(i+1)*sides+(j+1)%sides,d=i*sides+(j+1)%sides;indices.set([a,b,d,b,c,d],k);k+=6;}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('normal',new T.BufferAttribute(normals,3).setUsage(T.DynamicDrawUsage));geometry.setIndex(new T.BufferAttribute(indices,1));
  const mesh=displayMesh(geometry,new T.MeshStandardMaterial({color:channel==='power'?0x323b40:0x222a2f,roughness:.64,metalness:.09,transparent:true,opacity:0,emissive:0x15262b,emissiveIntensity:0}),id);mesh.frustumCulled=false;
  const path=[start,...guides.map(p=>Array.isArray(p)?fixed(p):p),end],points=Array.from({length:rings},()=>V());
  wires.push({id,start,end,path,channel,radius,mesh,rings,sides,positions,normals,points,last:[],updates:0,length:0,firstMean:V(),lastMean:V()});revision++;
 }
 function* buildSteps(){
  const mcuPower=yield* port('mcu-power',MCU,{face:[0,1,0],offset:[-.30,0,0],channel:'power'}),mcuData=yield* port('mcu-data',MCU,{face:[0,-1,0],offset:[-.24,0,0]}),mcuControl=yield* port('mcu-actuators',MCU,{face:[0,-1,0],offset:[.27,0,0],radius:.007}),mcuSafety=yield* port('mcu-safety',MCU,{face:[0,1,0],offset:[.24,0,0],channel:'safety'});
  // These four points are measured on the original LEEP I/O face.
  const dc=yield* port('leep-dc',LEEP,{point:[.1150891064,.4623994199,.2174952223],channel:'power'}),network=yield* port('leep-network',LEEP,{point:[.0970891064,.4623244199,.2174952223],channel:'sensing',shape:'network'}),usbA=yield* port('leep-usb-upper',LEEP,{point:[.0760737165,.4631537476,.2201352223],channel:'sensing',shape:'usb',radius:.0038}),usbB=yield* port('leep-usb-lower',LEEP,{point:[.0760737165,.4631537476,.2118752223],shape:'usb',radius:.0038});
  const power=yield* port('dcdc-output','a08-context-electronics-012',{face:[1,0,0],offset:[0,0,-.25],channel:'power',radius:.006}),res=yield* port('res-safety','a08-context-electronics-008',{face:[1,0,0],channel:'safety'});
  const hubIn=yield* port('hub-input','a08-context-electronics-003',{face:[1,0,0],channel:'sensing',shape:'usb',radius:.0038}),hubCam=yield* port('hub-camera','a08-context-electronics-003',{face:[0,1,0],offset:[.24,0,0],channel:'sensing',shape:'usb',radius:.0038}),hubImu=yield* port('hub-imu','a08-context-electronics-003',{face:[0,1,0],offset:[-.24,0,0],channel:'sensing',shape:'usb',radius:.0038});
  const imu=yield* port('imu-communication','a08-context-electronics-002',{face:[1,0,0],channel:'sensing',radius:.0036}),camera=yield* port('camera-communication','a08-sensors-002',{face:[0,1,0],channel:'sensing',shape:'usb',radius:.004});
  const routerA=yield* port('router-compute','a08-context-electronics-007',{face:[1,0,0],offset:[0,-.2,0],channel:'sensing',shape:'network'}),routerB=yield* port('router-lidar','a08-context-electronics-007',{face:[1,0,0],offset:[0,.2,0],channel:'sensing',shape:'network'});
  const lidarPower=yield* port('lidar-breakout','a08-context-electronics-001',{face:[0,1,0],channel:'sensing'}),lidar=yield* port('lidar-cable','a08-sensors-001',{face:[-1,0,0],offset:[0,0,-.30],channel:'sensing',radius:.006});
  const steer=yield* port('steering-servo-cable','a08-steering-019',{face:[0,-1,0],offset:[0,0,.23],radius:.006}),brake=yield* port('braking-servo-cable','a08-brakes-039',{face:[0,-1,0],radius:.006}),valve=yield* port('brake-valve-cable','a08-gas-004',{face:[0,1,0],offset:[0,0,.22],channel:'safety'});
  // Main loom follows offset native lower rails (frame faces 62/84/104 and
  // 166/168/188). Cross-car supply uses the lower crossmember at x=-.112 m.
  const powerSplit=fixed([.16,-.27,.105]),controlSplit=fixed([.79,.167,.145]);
  yield;wire('a08-low-voltage-main',power,powerSplit,[[.16,-.40,.29],[.16,-.40,.19],[.16,-.29,.11]],{radius:.0035,channel:'power'});
  yield;wire('a08-mcu-supply',powerSplit,mcuPower,[[-.10,-.245,.087],[-.43,-.26,.087],[-.43,-.15,.08]],{radius:.0026,channel:'power'});
  yield;wire('a08-computer-supply',powerSplit,dc,[[-.10,-.245,.083],[-.10,.26,.083],[.05,.20,.083],[.05,.20,.12],[.05,.44,.12],[.16,.48,.116],[.16,.49,.21]],{radius:.0025,channel:'power'});
  yield;wire('a08-computer-mcu',usbB,mcuData,[[.07,.49,.20],[.16,.49,.18],[.16,.48,.12],[-.11,.268,.093],[-.43,.268,.085],[-.43,.15,.08]],{radius:.0022});
  yield;wire('a08-control-main',mcuControl,controlSplit,[[-.55,.255,.085],[-.12,.255,.085],[.38,.175,.13]],{radius:.0034});
  yield;wire('a08-steering-command',controlSplit,steer,[[.804,.167,.2573],[.804,-.14,.2573],[.83,-.14,.22]],{radius:.0028});
  yield;wire('a08-brake-command',controlSplit,brake,[[1.23,.158,.16],[1.304,.15,.17],[1.304,-.17,.17],[1.304,-.17,.393],[1.304,-.145,.393],[1.225,-.145,.393]],{radius:.0028});
  yield;wire('a08-ebs-valve-command',mcuSafety,valve,[[-.55,-.12,.085],[-.67,-.26,.083],[-.715,-.26,.083],[-.715,.26,.083],[-.68,.262,.09],[-.36,.301,.37],[-.66,.279,.37],[-.685,.305,.48],[-.685,.315,.555]],{radius:.0022,channel:'safety'});
  yield;wire('a08-res-safety-loop',res,mcuSafety,[[.10,-.37,.12],[.10,-.225,.105],[-.12,-.26,.083],[-.55,-.26,.083],[-.55,-.12,.08]],{radius:.0021,channel:'safety'});
  yield;wire('a08-computer-usb-hub',usbA,hubIn,[[.076,.49,.23],[.15,.49,.19],[.15,.42,.18]],{radius:.002,channel:'sensing'});
  yield;wire('a08-hub-imu',hubImu,imu,[[.015,.48,.18],[-.018,.48,.16]],{radius:.0016,channel:'sensing'});
  yield;wire('a08-camera-data',hubCam,camera,[[.09,.482,.19],[-.14,.48,.19],[-.14,.48,.33],[-.36,.29,.39],[-.36,.19,.65],[-.36,.09,.91],[-.36,.055,.992]],{radius:.0022,channel:'sensing'});
  yield;wire('a08-computer-network',network,routerA,[[.097,.49,.215],[.16,.49,.25],[.16,.35,.25]],{radius:.0022,channel:'sensing'});
  yield;wire('a08-lidar-network',routerB,lidarPower,[[.15,.36,.25],[.17,.46,.15]],{radius:.0023,channel:'sensing'});
  yield;wire('a08-lidar-umbilical',lidarPower,lidar,[[.12,.48,.14],[.16,.48,.13],[.16,.295,.38],[.40,.263,.38],[.59,.208,.575],[.70,.10,.57]],{radius:.0032,channel:'sensing'});
  yield;root.updateWorldMatrix(true,false);inverse.copy(root.matrixWorld).invert();for(const p of ports.values()){syncPort(p);yield;}for(const w of wires){updateWire(w);yield;}built=missing.size===0;
 }
 function startBuild(){if(disposed||!owners.has(MCU)||!owners.has(LEEP))return null;if(!buildIterator&&!buildAttempted){buildAttempted=true;buildIterator=buildSteps();}return buildIterator;}
 function build(){if(deferred)return;const steps=startBuild();if(!steps)return;while(!steps.next().done){}buildIterator=null;}
 function appendAutonomous(list=[],{defer=false}={}){let added=0;for(const mesh of list)if(mesh.userData.variant==='a08'&&!owners.has(mesh.userData.id)){owners.set(mesh.userData.id,mesh);added++;}if(!added)return 0;deferred||=defer;if(!deferred)build();revision++;return added;}
 async function prepare(options={}){if(disposed||built)return preparation;if(preparePromise)return preparePromise;const steps=startBuild();if(!steps)return null;deferred=true;preparePromise=prepareInSlices(steps,{...options,stopped:()=>disposed}).then(result=>{preparation=result;buildIterator=null;if(result.ready)deferred=false;return result;});return preparePromise;}
 const tangent=V(),normal=V(),binormal=V(),axis=V(),radial=V();
 function updateWire(w){
  const nodes=[w.start.position,...(w.start.lead?[w.start.lead]:[]),...w.path.slice(1,-1).map(p=>p.position),...(w.end.lead?[w.end.lead]:[]),w.end.position];
  const values=nodes.flatMap(p=>p.toArray());if(w.last.length===values.length&&values.every((n,i)=>Math.abs(n-w.last[i])<1e-7))return;w.last=values;
  const rounded=roundedPath(nodes,w.rings);w.length=0;
  for(let i=0;i<w.rings;i++){w.points[i].copy(rounded[i]);if(i)w.length+=w.points[i].distanceTo(w.points[i-1]);}
  w.firstMean.set(0,0,0);w.lastMean.set(0,0,0);
  for(let i=0;i<w.rings;i++){
   tangent.copy(w.points[Math.min(w.rings-1,i+1)]).sub(w.points[Math.max(0,i-1)]).normalize();
   if(!i){axis.set(Math.abs(tangent.z)>.9?1:0,0,Math.abs(tangent.z)>.9?0:1);normal.crossVectors(axis,tangent).normalize();}else normal.addScaledVector(tangent,-normal.dot(tangent)).normalize();
   if(normal.lengthSq()<.5)normal.crossVectors(V(0,1,0),tangent).normalize();binormal.crossVectors(tangent,normal).normalize();
   for(let j=0;j<w.sides;j++){const a=j/w.sides*Math.PI*2,k=(i*w.sides+j)*3;radial.copy(normal).multiplyScalar(Math.cos(a)).addScaledVector(binormal,Math.sin(a));w.positions[k]=w.points[i].x+w.radius*radial.x;w.positions[k+1]=w.points[i].y+w.radius*radial.y;w.positions[k+2]=w.points[i].z+w.radius*radial.z;radial.toArray(w.normals,k);if(!i)w.firstMean.add(V(...w.positions.slice(k,k+3)));if(i===w.rings-1)w.lastMean.add(V(...w.positions.slice(k,k+3)));}
  }
  w.firstMean.divideScalar(w.sides);w.lastMean.divideScalar(w.sides);w.mesh.geometry.attributes.position.needsUpdate=true;w.mesh.geometry.attributes.normal.needsUpdate=true;w.mesh.geometry.computeBoundingSphere();w.updates++;
 }
 function syncPort(port){port.owner.updateWorldMatrix(true,false);matrix.copy(inverse).multiply(port.owner.matrixWorld);port.surface.copy(port.local).applyMatrix4(matrix);port.direction.copy(port.normal).transformDirection(matrix);port.position.copy(port.surface).addScaledVector(port.direction,port.length);port.lead.copy(port.position).addScaledVector(port.direction,.018);
   port.body.position.copy(port.surface).addScaledVector(port.direction,port.length*.5);port.body.quaternion.setFromUnitVectors(Z,port.direction);port.collar.position.copy(port.surface).addScaledVector(port.direction,.002);port.collar.quaternion.copy(port.body.quaternion);}
 function channelWeight(focus,channel){return focus.reduce((sum,r)=>sum+(r.department==='driverless'?(r.mode==='algorithm'?(channel==='sensing'||channel==='power'?1:.18):r.mode==='control'?(channel==='sensing'?.32:1):1)*r.weight:0),0);}
 function update(motion={},focus=[],{geometry=true}={}){
  if(disposed)return state;build();
  const total=focus.reduce((n,r)=>n+(r.department==='driverless'?r.weight:0),0)*(motion.variants?.assemblyAlpha??1);
  if(total<=.00001){root.visible=false;for(const item of items){item.visible=false;item.material.opacity=0;}state={ready:built,visibleWires:0,conditionTime:motion.conditionTime??0};return state;}
  if(geometry){root.updateWorldMatrix(true,false);inverse.copy(root.matrixWorld).invert();}
  for(const port of ports.values()){
   if(geometry){
   syncPort(port);
   }
   const alpha=smooth(channelWeight(focus,port.channel))*(motion.variants?.assemblyAlpha??1);for(const mesh of [port.body,port.collar]){mesh.visible=alpha>.002;mesh.material.opacity=alpha;mesh.material.depthWrite=alpha>.9999;mesh.userData.defocusWeight=1-alpha;}
  }
  let visible=0;for(const wire of wires){if(geometry)updateWire(wire);const alpha=smooth(channelWeight(focus,wire.channel))*(motion.variants?.assemblyAlpha??1);wire.mesh.material.opacity=alpha;wire.mesh.material.depthWrite=alpha>.9999;wire.mesh.visible=alpha>.002;wire.mesh.userData.defocusWeight=1-alpha;wire.mesh.userData.defocus=alpha<.5;wire.mesh.material.emissiveIntensity=wire.channel==='control'?.04+Math.abs(motion.steer||0)*.1:wire.channel==='safety'?(motion.brake||0)*.12:.025;if(wire.mesh.visible)visible++;}
  root.visible=built&&visible>0;state={ready:built,visibleWires:visible,conditionTime:motion.conditionTime??0};return state;
 }
 function framingPoints(request={}){return request.department==='driverless'?wires.flatMap(w=>w.points.filter((_,i)=>i%12===0).map(p=>p.clone())):[];}
 function diagnostics({includeDetails=true}={}){return {...state,preparation,wires:wires.length,connectors:ports.size,missingOwners:[...missing],sourceGeometryModified:false,pinAssignment:false,routingBasis:'Original A08 device positions; four measured LEEP I/O faces; additional connector boots and frame-guided display loom',dynamicBufferReuse:true,maximumEndpointGapM:Math.max(0,...wires.flatMap(w=>[w.firstMean.distanceTo(w.start.position),w.lastMean.distanceTo(w.end.position)])),...(includeDetails?{ports:[...ports.values()].map(p=>({name:p.name,sourceId:p.id,sourceSurface:p.local.toArray(),sourceTriangle:p.sourceFace,requestedSurfaceDistanceM:p.requestedSurfaceDistance,position:p.position.toArray(),channel:p.channel})),circuits:wires.map(w=>({id:w.id,channel:w.channel,source:w.start.name||'shared-junction',destination:w.end.name||'shared-junction',lengthM:w.length,geometryUpdates:w.updates,geometryUuid:w.mesh.geometry.uuid}))}:{})};}
 return {root,items,appendAutonomous,prepare,update,framingPoints,diagnostics,get revision(){return revision;},dispose(){if(disposed)return;disposed=true;resources.forEach(r=>r.dispose());root.clear();owners.clear();ports.clear();wires.length=0;items.length=0;}};
}
