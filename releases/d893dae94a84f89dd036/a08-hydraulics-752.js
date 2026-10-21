import * as T from './vendor/three.module.min.js';
import {prepareInSlices} from './runtime-prepare-761.js?v=761';
import {brakeCadRoutes,brakeCadFittings} from './brake-hose-extraction.js?v=761';

const V=(...a)=>new T.Vector3(...a),Y=V(0,1,0),Z=V(0,0,1);
const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*x*(3-2*x);};
// CP7855 pressure outlet: native cylinders 25/440, axis (69,y,0) mm,
// intersecting original seat face 423 at y=27 mm. The x=37 reservoir port
// remains untouched. These coordinates use the existing rigid A08 registration.
const masterPorts=[
 {id:'a08-brakes-010',point:[1.1465029486007068,.04393606449091253,.1690042228098474]},
 {id:'a08-brakes-015',point:[1.1465029486007057,.11353554123834252,.16873434045581686]}
];
const masterNormal=V(.9751585757458021,.0008589234901998687,.22150624009483776).normalize();
const wheelSpecs=[
 {id:'purchased-005',file:'TubeF_TtoL.stp',front:true,side:1},
 {id:'purchased-006',file:'TubeF_TtoR.stp',front:true,side:-1},
 {id:'brakes-001',file:'TubeR_TtoL.stp',front:false,side:1},
 {id:'brakes-043',file:'TubeR_TtoR.stp',front:false,side:-1}
];

// Rounded display routes preserve the exact first/last node. Port and guide
// coordinates are never substituted for a different vehicle's master cylinder.
function rounded(nodes,steps){
 const path=[nodes[0].clone()];
 for(let i=1;i<nodes.length-1;i++){
  const p=nodes[i],a=nodes[i-1],b=nodes[i+1],r=Math.min(.025,p.distanceTo(a)*.22,p.distanceTo(b)*.22),entry=p.clone().lerp(a,r/Math.max(1e-10,p.distanceTo(a))),exit=p.clone().lerp(b,r/Math.max(1e-10,p.distanceTo(b)));
  path.push(entry);for(let k=1;k<=6;k++){const t=k/6;path.push(entry.clone().multiplyScalar((1-t)**2).addScaledVector(p,2*(1-t)*t).addScaledVector(exit,t*t));}
 }
 path.push(nodes.at(-1).clone());const arc=[0];for(let i=1;i<path.length;i++)arc.push(arc.at(-1)+path[i].distanceTo(path[i-1]));let j=0;const out=[];
 for(let i=0;i<=steps;i++){const d=arc.at(-1)*i/steps;while(j<path.length-2&&arc[j+1]<d)j++;out.push(path[j].clone().lerp(path[j+1],(d-arc[j])/Math.max(1e-15,arc[j+1]-arc[j])));}return out;
}

export function createA08Hydraulics({meshes=[],assembly=null}={}){
 const root=new T.Group();root.name='a08-brake-hydraulics';
 const items=[],resources=new Set(),byId=new Map(meshes.map(m=>[m.userData.id,m])),endpoints=[],routes=[],fittings=[],tees=[];
 const own=x=>(resources.add(x),x),hoseMat=own(new T.MeshStandardMaterial({color:0x353b3e,roughness:.62,metalness:.10})),metal=own(new T.MeshStandardMaterial({color:0x919da4,roughness:.34,metalness:.78}));
 for(const material of [hoseMat,metal]){material.transparent=true;material.forceSinglePass=true;}
 let ready=false,buildIterator=null,preparePromise=null,deferred=false,disposed=false,preparation=null,alpha=0,pressure=0,geometryUpdates=0,missing=[],installedFraming=[];
 const inverse=new T.Matrix4(),relative=new T.Matrix4();
 function add(g,mat,id){const m=new T.Mesh(own(g),mat);m.name=id;m.userData={id,variant:'a08',group:'brakes',system:'brakes',mechanism:'av-hydraulics',a08Hydraulics:true,presentationOnly:true,partCounted:false,defocusWeight:0};m.castShadow=true;m.receiveShadow=true;root.add(m);items.push(m);return m;}
 function cylinder(id,r,sides=16){return add(new T.CylinderGeometry(r,r,1,sides),metal,id);}
 let fittingGeometry=null;
 function nativeFitting(id){if(!fittingGeometry){fittingGeometry=new T.BufferGeometry();fittingGeometry.setAttribute('position',new T.Float32BufferAttribute(brakeCadFittings.geometry.position,3));fittingGeometry.setAttribute('normal',new T.Float32BufferAttribute(brakeCadFittings.geometry.normal,3));fittingGeometry.setIndex(brakeCadFittings.geometry.index);}const m=add(fittingGeometry,metal,id);m.matrixAutoUpdate=false;return m;}
 function segment(mesh,a,b){const d=b.clone().sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(Y,d.clone().normalize());mesh.scale.set(1,Math.max(1e-8,d.length()),1);mesh.updateMatrix();}
 function endpoint(id,mesh,point,normal,source){const e={id,mesh,point:point.clone(),normal:normal.clone().normalize(),current:point.clone(),direction:normal.clone(),source};endpoints.push(e);return e;}
 function localPoint(mesh,p){mesh.updateWorldMatrix(true,false);relative.multiplyMatrices(inverse,mesh.matrixWorld);return p.clone().applyMatrix4(relative);}
 function syncEndpoint(e){e.mesh.updateWorldMatrix(true,false);relative.multiplyMatrices(inverse,e.mesh.matrixWorld);e.current.copy(e.point).applyMatrix4(relative);e.direction.copy(e.normal).transformDirection(relative);}
 function tube(id,nodes,radius=.00235){
  const steps=192,sides=10,p=new Float32Array((steps+1)*sides*3),n=new Float32Array(p.length),index=new Uint16Array(steps*sides*6);let at=0;
  for(let i=0;i<steps;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;index.set([a,c,b,b,c,d],at);at+=6;}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3).setUsage(T.DynamicDrawUsage));g.setAttribute('normal',new T.BufferAttribute(n,3).setUsage(T.DynamicDrawUsage));g.setIndex(new T.BufferAttribute(index,1));
  g.boundingBox=new T.Box3();g.boundingSphere=new T.Sphere();const cosine=Array.from({length:sides},(_,i)=>Math.cos(i/sides*Math.PI*2)),sine=Array.from({length:sides},(_,i)=>Math.sin(i/sides*Math.PI*2));
  const mesh=add(g,hoseMat,id),route={id,mesh,nodes,radius,steps,sides,cosine,sine,points:[],last:[],length:0,endpointError:0};routes.push(route);return route;
 }
 function render(route,nodes){
  if(route.last.length===nodes.length&&nodes.every((p,i)=>p.distanceToSquared(route.last[i])<1e-20))return;
  route.last=nodes.map(p=>p.clone());const points=rounded(nodes,route.steps),geometry=route.mesh.geometry,p=geometry.attributes.position,n=geometry.attributes.normal,tangent=V(),normal=V(),binormal=V(),previous=V(),q=new T.Quaternion();geometry.boundingBox.makeEmpty();
  for(let i=0;i<points.length;i++){
   tangent.copy(points[Math.min(i+1,route.steps)]).sub(points[Math.max(0,i-1)]).normalize();
   if(!i){normal.copy(Z).addScaledVector(tangent,-Z.dot(tangent));if(normal.lengthSq()<1e-6)normal.copy(Y).addScaledVector(tangent,-Y.dot(tangent));normal.normalize();}else normal.applyQuaternion(q.setFromUnitVectors(previous,tangent)).normalize();
   binormal.crossVectors(tangent,normal).normalize();previous.copy(tangent);
   const point=points[i];geometry.boundingBox.expandByPoint(point);
   for(let j=0;j<route.sides;j++){const k=i*route.sides+j,c=route.cosine[j],s=route.sine[j],x=normal.x*c+binormal.x*s,y=normal.y*c+binormal.y*s,z=normal.z*c+binormal.z*s;p.setXYZ(k,point.x+route.radius*x,point.y+route.radius*y,point.z+route.radius*z);n.setXYZ(k,x,y,z);}
  }
  route.points=points;route.length=points.slice(1).reduce((s,p,i)=>s+p.distanceTo(points[i]),0);route.endpointError=0;
  for(const [ring,target]of [[0,nodes[0]],[route.steps,nodes.at(-1)]]){const centre=V();for(let j=0;j<route.sides;j++)centre.add(V().fromBufferAttribute(p,ring*route.sides+j));route.endpointError=Math.max(route.endpointError,centre.divideScalar(route.sides).distanceTo(target));}
  p.needsUpdate=true;n.needsUpdate=true;geometry.boundingBox.expandByScalar(route.radius);geometry.boundingBox.getCenter(geometry.boundingSphere.center);geometry.boundingSphere.radius=geometry.boundingBox.min.distanceTo(geometry.boundingBox.max)*.5;geometryUpdates++;
 }
 function* buildSteps(){
  const masters=masterPorts.map((s,i)=>{const e=endpoint(s.id+'-pressure-outlet',byId.get(s.id),V(...s.point),masterNormal,{nativePointMm:[69,27,0],nativeAxis:[0,1,0],seatFace:423,cylinderFaces:[25,440],thread:'3/8 x 24 UNF',source:'CP7855-92-41aac40d.step'});const nut=cylinder('a08-hydraulic-master-'+i+'-union-nut',.0062,6),stem=cylinder('a08-hydraulic-master-'+i+'-union-stem',.00395);fittings.push({type:'master',e,nut,stem});return e;});
  yield;const wheels=[];for(const s of wheelSpecs){const record=brakeCadRoutes.find(r=>r.file===s.file),native=brakeCadFittings.instances.find(r=>r.sourceId===s.id),mesh=byId.get(s.id),e=endpoint(s.id+'-hydraulic-inlet',mesh,V(...native.socketPoint),V(...native.socketInward).negate(),{file:brakeCadFittings.sourceFile,sha256:brakeCadFittings.sourceSHA256,sourceNode:native.sourceNode,sourceItemId:native.sourceItemId,caliperPortCylinderFace:native.portCylinderFace,caliperSeatPoint:native.caliperSeatPoint,socketPoint:native.socketPoint,originalSourceHoseCap:record.points.at(-1),qualification:native.qualification});const union=nativeFitting('a08-hydraulic-'+s.id+'-source-adapter'),nut=cylinder('a08-hydraulic-'+s.id+'-hose-nut',.0055,6),bolt=cylinder('a08-hydraulic-'+s.id+'-retaining-bolt',.0044),head=cylinder('a08-hydraulic-'+s.id+'-retaining-head',.007,6);fittings.push({type:'wheel',e,native,restMatrix:new T.Matrix4().fromArray(native.matrix),union,nut,bolt,head});wheels.push({...s,e});yield;}
  // Offset native A08 tubes: lower rails 62/188 and 84/104, front/rear
  // crossmembers 142/118, rear diagonals 108/162. Original fitted axes and
  // radii are recorded in research/752-a08-frame-wire-guides.json.
  const teeF=V(.810,0,.217),teeR=V(-.700,.250,.105);
  for(const [id,p]of [['front',teeF],['rear',teeR]]){const mesh=add(new T.SphereGeometry(.0055,16,10),metal,'a08-hydraulic-'+id+'-distributor');mesh.position.copy(p);tees.push({id,point:p,mesh});}
  const lead=e=>e.current.clone().addScaledVector(e.direction,.015);
  tube('a08-hydraulic-front-master-feed',()=>[lead(masters[0]),lead(masters[0]).addScaledVector(masters[0].direction,.026),V(1.235,.025,.170),V(1.252,-.145,.170),V(.850,-.165,.145),V(.810,-.185,.217),teeF.clone()]);
  tube('a08-hydraulic-rear-master-feed',()=>[lead(masters[1]),lead(masters[1]).addScaledVector(masters[1].direction,.008),V(1.170,.155,.180),V(.980,.180,.160),V(.850,.145,.160),V(.780,.165,.087),V(.590,.155,.087),V(.450,.145,.145),V(.340,.170,.145),V(-.100,.265,.090),V(-.130,.245,.105),V(-.180,.250,.100),V(-.640,.250,.100),V(-.660,.245,.105),teeR.clone()]);
  yield;for(const w of wheels){
   const nodes=()=>{const end=w.e.current.clone(),approach=end.clone().addScaledVector(w.e.direction,.028),near=end.clone().addScaledVector(w.e.direction,.008);return w.front?[teeF.clone(),V(.810,w.side*.245,.217),V(.750,w.side*.290,.225),V(.600,w.side*.420,.225),approach,near,end]:[teeR.clone(),...(w.side<0?[V(-.700,-.250,.105)]:[]),V(-.850,w.side*.205,.110),V(-.850,w.side*.400,.150),approach,near,end];};
   yield;tube('a08-hydraulic-'+(w.front?'front':'rear')+'-'+(w.side>0?'left':'right')+'-caliper-feed',nodes);
  }
  // Capture before the first pose update: endpoint.current still contains the
  // immutable registered source cap, regardless of the loader's current pose.
  installedFraming=routes.flatMap(r=>rounded(r.nodes(),96).filter((_,i)=>i%6===0));
  installedFraming.push(...endpoints.map(e=>e.point.clone()));yield;for(const route of routes){render(route,route.nodes());yield;}ready=true;
 }
 function startBuild(){if(disposed||ready)return null;missing=[...masterPorts,...wheelSpecs].filter(s=>!byId.has(s.id)).map(s=>s.id);if(missing.length)return null;if(!buildIterator)buildIterator=buildSteps();return buildIterator;}
 function build(){if(deferred)return;const steps=startBuild();if(!steps)return;while(!steps.next().done){}buildIterator=null;}
 function appendAutonomous(list=[],{defer=false}={}){let added=0;for(const m of list)if(m?.isMesh&&m.userData.variant==='a08'&&!byId.has(m.userData.id)){byId.set(m.userData.id,m);added++;}if(added){deferred||=defer;if(!deferred)build();}return added;}
 async function prepare(options={}){if(disposed||ready)return preparation;if(preparePromise)return preparePromise;const steps=startBuild();if(!steps)return null;deferred=true;preparePromise=prepareInSlices(steps,{...options,stopped:()=>disposed}).then(result=>{preparation=result;buildIterator=null;if(result.ready)deferred=false;return result;});return preparePromise;}
 function appearance(autonomous,sharp){
  for(const mat of [hoseMat,metal]){mat.opacity=alpha;mat.depthWrite=alpha>.9999;}
  for(const mesh of items){mesh.visible=alpha>.002;mesh.userData.effectOpacity=alpha;mesh.userData.defocusWeight=autonomous>1e-10?1-sharp/autonomous:1;mesh.userData.defocus=mesh.userData.defocusWeight>.5;}
  root.visible=ready&&alpha>.002;
 }
 function update(motion={},focus=[],{geometry=true}={}){
  const autonomous=focus.reduce((s,r)=>s+(r.department==='driverless'?r.weight:0),0),sharp=focus.reduce((s,r)=>s+(r.department==='driverless'&&r.mode!=='algorithm'?r.weight:0),0);
  alpha=smooth(autonomous)*(autonomous>1e-10?(.10+.90*sharp/autonomous):0)*(motion.variants?.assemblyAlpha??1);pressure=T.MathUtils.clamp(motion.brake??0,0,1);
  if(alpha<=.002||!geometry){hoseMat.emissiveIntensity=pressure*.055;appearance(autonomous,sharp);return {ready,opacity:alpha,pressure};}
  build();root.updateWorldMatrix(true,false);inverse.copy(root.matrixWorld).invert();for(const e of endpoints)syncEndpoint(e);
  for(const f of fittings){const e=f.e,d=e.direction;if(f.type==='master'){segment(f.stem,e.current.clone().addScaledVector(d,-.003),e.current.clone().addScaledVector(d,.015));segment(f.nut,e.current.clone().addScaledVector(d,.002),e.current.clone().addScaledVector(d,.008));}else{e.mesh.updateWorldMatrix(true,false);relative.multiplyMatrices(inverse,e.mesh.matrixWorld);f.union.matrix.copy(relative).multiply(f.restMatrix);const seat=V(...f.native.caliperSeatPoint).applyMatrix4(relative),outward=V(...f.native.portOutward).transformDirection(relative);segment(f.bolt,seat.clone().addScaledVector(outward,-.006),seat.clone().addScaledVector(outward,brakeCadFittings.eyeThicknessM));segment(f.head,seat.clone().addScaledVector(outward,brakeCadFittings.eyeThicknessM),seat.clone().addScaledVector(outward,brakeCadFittings.eyeThicknessM+.003));segment(f.nut,e.current,e.current.clone().addScaledVector(d,.008));}}
  for(const r of routes)render(r,r.nodes());
  hoseMat.emissive.setHex(0x805637);hoseMat.emissiveIntensity=pressure*.055;
  appearance(autonomous,sharp);root.updateMatrixWorld(true);return {ready,opacity:alpha,pressure};
 }
 function diagnostics({includePaths=true}={}){return {ready,preparation,independentCircuits:ready?2:0,masterIds:masterPorts.map(s=>s.id),caliperIds:wheelSpecs.map(s=>s.id),pressure,routes:routes.map(r=>({id:r.id,lengthM:r.length,radiusM:r.radius,endpointErrorM:r.endpointError,...(includePaths?{points:r.points.map(p=>p.toArray())}:{})})),maximumEndpointGapM:Math.max(0,...routes.map(r=>r.endpointError)),missingAnchors:missing.slice(),unconnectedEndpointIds:ready?[]:missing.slice(),endpointSources:endpoints.map(e=>({id:e.id,meshId:e.mesh.userData.id,localPoint:e.point.toArray(),currentPoint:e.current.toArray(),source:e.source})),visible:root.visible,opacity:alpha,dynamicBufferReuse:true,geometryUpdates,sourceCADModified:false,inferredRouting:true,nativeFrameSourceId:'a08-context-frame-001',nativeFrameGuideFaces:[62,188,142,84,104,118,108,162],routingQualification:'Two independent front/rear display branches. Master pressure ports follow native CP7855 analytic geometry; wheel ends terminate at original HoseEnd sockets whose eye axes and mating faces register to native FC26 caliper inlet bores and seats. Middle routes follow offset original A08 frame axes, retaining short wheel-end flexible tails. Branch assignment and guide offsets are display layout, not verified A08 as-built plumbing or cutting lengths.',internalHydraulicMotionVerified:false};}
 function framingPoints(request={}){if(request.department!=='driverless'||request.mode==='algorithm'||!ready)return [];return installedFraming.map(p=>p.clone());}
 function labels(request={}){return request.department==='driverless'&&request.mode!=='algorithm'&&ready?[{text:'制动液压管路',point:tees[0].point.clone()}]:[];}
 function dispose(){disposed=true;resources.forEach(r=>r.dispose());items.length=0;root.clear();}
 appendAutonomous(meshes.filter(m=>m.userData.variant==='a08'));root.visible=false;
 return {root,items,appendAutonomous,prepare,update,diagnostics,framingPoints,labels,dispose};
}
