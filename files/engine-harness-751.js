import * as T from './vendor/three.module.min.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=x=>Math.max(0,Math.min(1,x));
const whole={department:'all',mode:'all',variant:'c41',weight:1};
const vector=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
const ECU_ID='c41-engine-update-167';

function closestSurface(geometry,point){
 const p=geometry.attributes.position,ix=geometry.index,triangle=new T.Triangle(),hit=V(),best=V();let distance=Infinity;
 if(!p)return {point:point.clone(),distance};
 const count=ix?.count??p.count;
 for(let i=0;i+2<count;i+=3){
  triangle.a.fromBufferAttribute(p,ix?ix.getX(i):i);triangle.b.fromBufferAttribute(p,ix?ix.getX(i+1):i+1);triangle.c.fromBufferAttribute(p,ix?ix.getX(i+2):i+2);
  triangle.closestPointToPoint(point,hit);const d=point.distanceToSquared(hit);if(d<distance){distance=d;best.copy(hit);}
 }
 return {point:best,distance:Math.sqrt(distance)};
}

// The controller is the original M150 occurrence. Its four connector end
// faces are at local Y=-5.6 mm; no individual electrical pin is assigned.
// Harness grouping follows the dashboard and shutdown branches in the source
// cost report. Flexible paths show the installation, not a cutting-length BOM.
export function createEngineHarness({meshes=[],instruments=null,assembly=null}={}){
 const root=new T.Group();root.name='engine-electrical-harness';
 const items=[],nodes=new Map(),wires=[],resources=new Set(),sourceById=new Map(meshes.map(m=>[m.userData.id,m]));
 const inverseRoot=new T.Matrix4(),basis=new T.Matrix4(),missing=new Map(),instrumentIds=new Set(),instrumentAnchors=new Map();
 let state={},disposed=false,revision=0,instrumentCount=-1,geometryUpdates=0;

 function ownerNode(id,mesh,point,direction=[0,0,1],{surface=false,offset=0,guide=false}={}){
  if(!mesh?.isMesh||!vector(point)||!vector(direction)){missing.set(id,'source-anchor-missing');return null;}
  if(nodes.has(id))return nodes.get(id);
  let local=V(...point),normal=V(...direction).normalize(),surfaceDistance=null;
  if(surface||guide){
   const nearest=closestSurface(mesh.geometry,local);surfaceDistance=nearest.distance;
   if(surface&&nearest.distance>.0015){missing.set(id,'anchor-outside-source-surface');return null;}
   if(guide){const outward=local.clone().sub(nearest.point);if(outward.lengthSq()>1e-10)normal.copy(outward.normalize());}
   local.copy(nearest.point);
  }
  local.addScaledVector(normal,offset);
  const node={id,mesh,local,normal,position:V(),direction:V(),matrix:new T.Matrix4(),surfaceDistance,guide,offset};
  nodes.set(id,node);missing.delete(id);return node;
 }
 function leadNode(id,base,length){
  if(!base)return null;
  return ownerNode(id,base.mesh,base.local.clone().addScaledVector(base.normal,length).toArray(),base.normal.toArray());
 }
 function guide(id,owner,point){return ownerNode(id,sourceById.get(owner),point,[0,1,0],{guide:true,offset:.006});}
 function addWire(id,path,radius,channel,endpointIds=[]){
  if(path.some(p=>!p)||path.length<2)return null;
  const rings=65,sides=8,positions=new Float32Array(rings*sides*3),normals=new Float32Array(positions.length),indices=new Uint16Array((rings-1)*sides*6);
  let k=0;for(let i=0;i<rings-1;i++)for(let j=0;j<sides;j++){
   const a=i*sides+j,b=(i+1)*sides+j,c=(i+1)*sides+(j+1)%sides,d=i*sides+(j+1)%sides;
   indices.set([a,d,b,b,d,c],k);k+=6;
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('normal',new T.BufferAttribute(normals,3).setUsage(T.DynamicDrawUsage));geometry.setIndex(new T.BufferAttribute(indices,1));
  geometry.boundingBox=new T.Box3();geometry.boundingSphere=new T.Sphere();
  const material=new T.MeshStandardMaterial({color:channel==='terminal'?0x252b2e:0x1c2225,roughness:.68,metalness:.035,envMapIntensity:.6,transparent:true,opacity:0});
  material.forceSinglePass=true;
  const mesh=new T.Mesh(geometry,material);mesh.name=id;mesh.frustumCulled=false;mesh.visible=false;mesh.receiveShadow=true;
  mesh.userData={id,variant:'c41',group:'engine',mechanism:channel==='safety'?'mo-safety-controls':'mo-engine-electrics',role:'electrical-harness-display',partCounted:false,engineHarness:true,channel,endpointIds:endpointIds.slice(),defocusWeight:0};
  root.add(mesh);items.push(mesh);resources.add(geometry);resources.add(material);
  const wire={id,mesh,path,radius,channel,endpointIds,curve:new T.CatmullRomCurve3(path.map(n=>n.position),false,'centripetal'),centres:Array.from({length:rings},()=>V()),last:new Float64Array(path.length*3).fill(Infinity),rings,sides,positions,normals,firstMean:V(),lastMean:V(),installedLength:null,length:0,updates:0};
  wires.push(wire);revision++;return wire;
 }
 function endpoint(id,mesh,point,direction){return ownerNode(id,mesh,point,direction,{surface:true});}
 function connectorBranch(id,mesh,point,direction,start,path,channel,radius=.0019,terminals=null){
  if(!mesh||!start)return;
  if(Array.isArray(terminals)&&terminals.length>=2){
   const tips=terminals.map((t,i)=>endpoint(id+'-contact-'+i,t.mesh||mesh,t.point,t.direction||direction));
   if(tips.some(n=>!n))return;
   mesh.updateWorldMatrix(true,false);const bodyInverse=new T.Matrix4().copy(mesh.matrixWorld).invert();
   const centre=tips.reduce((p,n)=>{n.mesh.updateWorldMatrix(true,false);return p.add(n.local.clone().applyMatrix4(n.mesh.matrixWorld).applyMatrix4(bodyInverse));},V()).multiplyScalar(1/tips.length),normal=V(...direction).normalize();
   const split=ownerNode(id+'-split',mesh,centre.addScaledVector(normal,.018).toArray(),normal.toArray());
   addWire(id+'-branch',[start,...path,split],radius,channel,[id]);
   for(let i=0;i<tips.length;i++){const lead=leadNode(id+'-contact-lead-'+i,tips[i],.008);addWire(id+'-lead-'+i,[split,lead,tips[i]],.0008,'terminal',[id]);}
  }else{
   const tip=endpoint(id+'-contact',mesh,point,direction),lead=leadNode(id+'-contact-lead',tip,.016);
   if(tip)addWire(id+'-branch',[start,...path,lead,tip],radius,channel,[id]);
  }
 }

 const ecu=sourceById.get(ECU_ID);
 const ecuPort=endpoint('m150-connector',ecu,[.1033351,-.0056,.02025],[0,-1,0]),ecuLead=leadNode('m150-strain-relief',ecuPort,.024);
 const bay=guide('electronics-bay-guide','frame-064',[-.430,-.290,.383]);
 const rear=guide('cockpit-rear-guide','frame-015',[-.430,-.290,.406]);
 const railA=guide('cockpit-rail-a','frame-015',[-.25,-.264,.447]);
 const railB=guide('cockpit-rail-b','frame-015',[0,-.225,.504]);
 const railC=guide('cockpit-rail-c','frame-015',[.220,-.190,.554]);
 const frontLeft=guide('dashboard-right-guide','frame-003',[.295,-.150,.590]);
 const frontCentre=guide('dashboard-centre-guide','frame-003',[.298,0,.614]);
 const frontRight=guide('dashboard-left-guide','frame-003',[.295,.150,.590]);
 addWire('engine-harness-main',[ecuPort,ecuLead,bay,rear,railA,railB,railC,frontLeft,frontCentre],.0041,'main',[ECU_ID]);

 // A shutdown lead shares the physical loom with the ECU circuits. This does
 // not turn the mechanical shutdown switches into named ECU input pins.
 const safety189=sourceById.get('c41-engine-update-189');
 const stopOuterTop=ownerNode('cockpit-stop-outer-top',safety189,[.018,-.028,0]);
 const stopOuterBottom=ownerNode('cockpit-stop-outer-bottom',safety189,[-.062,-.028,0]);
 connectorBranch('c41-engine-update-189',safety189,[-.0401779709,0,0],[-1,0,0],frontCentre,[frontRight,stopOuterTop,stopOuterBottom],'safety',.0018,[
  {point:[-.0401779709,0,0],direction:[-1,0,0]},
  {point:[-.0401779709,.00405676,0],direction:[-1,0,0]}
 ]);
 const inertia=sourceById.get('c41-engine-update-190');
 const inertiaOuterTop=ownerNode('inertial-outer-top',inertia,[-.038,0,.074]);
 const inertiaOuterBottom=ownerNode('inertial-outer-bottom',inertia,[-.038,0,-.014]);
 connectorBranch('c41-engine-update-190',inertia,[-.00425,0,.00616],[0,0,-1],frontCentre,[frontRight,inertiaOuterTop,inertiaOuterBottom],'safety',.0018,[
  {point:[-.00425,0,.00616],direction:[0,0,-1]},
  {point:[0,0,.00625],direction:[0,0,-1]}
 ]);
 const hoopLeft=guide('rear-left-low-guide','frame-004',[-.520,-.310,.540]);
 const hoopLeftTop=guide('rear-left-top-guide','frame-004',[-.508,-.310,.680]);
 const crossLeft=guide('rear-cross-left-guide','frame-020',[-.520,-.220,.536]);
 const crossRight=guide('rear-cross-right-guide','frame-020',[-.520,.220,.536]);
 const hoopRight=guide('rear-right-low-guide','frame-004',[-.520,.310,.540]);
 const hoopRightTop=guide('rear-right-top-guide','frame-004',[-.508,.310,.680]);
 for(const [id,path]of [['c41-engine-update-192',[hoopLeft,hoopLeftTop]],['c41-engine-update-193',[hoopLeft,crossLeft,crossRight,hoopRight,hoopRightTop]]]){
  const owner=sourceById.get(id),outer=ownerNode(id+'-outer-face-guide',owner,[0,.080,-.034]),back=ownerNode(id+'-back-face-guide',owner,[0,-.025,-.034]);
  connectorBranch(id,owner,[.007,0,.0038],[0,-1,0],rear,[...path,outer,back],'safety',.0018,[
   {point:[.007,0,.0038],direction:[0,-1,0]},
   {point:[-.007,0,.0038],direction:[0,-1,0]}
  ]);
 }

 function syncInstrumentAnchors(){
  const count=instruments?.items?.length??0;
  if(count===instrumentCount&&instrumentIds.size)return;
  const anchors=instruments?.harnessAnchors?.()||[];instrumentCount=count;
  for(const anchor of anchors){
   if(anchor.variant&&anchor.variant!=='c41'||anchor.mesh?.userData.variant==='a08'||instrumentIds.has(anchor.id))continue;
   if(!anchor.id||!anchor.mesh||!vector(anchor.point)||!vector(anchor.direction))continue;
   const display=anchor.role==='display',start=display?frontCentre:frontLeft;
   connectorBranch(anchor.id,anchor.mesh,anchor.point,anchor.direction,start,[],display?'dashboard':'buttons',display?.0023:.0016,anchor.terminals);
   instrumentIds.add(anchor.id);instrumentAnchors.set(anchor.id,anchor);
  }
 }

 const tangent=V(),normal=V(),binormal=V(),radial=V(),axis=V(),boxSize=V();
 function updateGeometry(wire){
  const {path,last,positions,normals,rings,sides,radius,mesh,centres}=wire;let changed=wire.updates===0;
  for(let i=0;i<path.length;i++)for(let j=0;j<3;j++){const value=path[i].position.getComponent(j);if(Math.abs(last[i*3+j]-value)>1e-9)changed=true;last[i*3+j]=value;}
  if(!changed)return;
  const box=mesh.geometry.boundingBox;box.makeEmpty();wire.length=0;
  for(let i=0;i<rings;i++){wire.curve.getPoint(i/(rings-1),centres[i]);box.expandByPoint(centres[i]);if(i)wire.length+=centres[i].distanceTo(centres[i-1]);}
  wire.firstMean.set(0,0,0);wire.lastMean.set(0,0,0);
  for(let i=0;i<rings;i++){
   tangent.copy(centres[Math.min(rings-1,i+1)]).sub(centres[Math.max(0,i-1)]).normalize();
   if(!i){axis.set(Math.abs(tangent.z)>.9?1:0,0,Math.abs(tangent.z)>.9?0:1);normal.crossVectors(axis,tangent).normalize();}
   else normal.addScaledVector(tangent,-normal.dot(tangent)).normalize();
   if(normal.lengthSq()<.5){axis.set(0,1,0);normal.crossVectors(axis,tangent).normalize();}
   binormal.crossVectors(tangent,normal).normalize();
   for(let j=0;j<sides;j++){
    const angle=j/sides*Math.PI*2;radial.copy(normal).multiplyScalar(Math.cos(angle)).addScaledVector(binormal,Math.sin(angle));const k=(i*sides+j)*3;
    positions[k]=centres[i].x+radius*radial.x;positions[k+1]=centres[i].y+radius*radial.y;positions[k+2]=centres[i].z+radius*radial.z;
    normals[k]=radial.x;normals[k+1]=radial.y;normals[k+2]=radial.z;
    if(i===0){wire.firstMean.x+=positions[k];wire.firstMean.y+=positions[k+1];wire.firstMean.z+=positions[k+2];}
    if(i===rings-1){wire.lastMean.x+=positions[k];wire.lastMean.y+=positions[k+1];wire.lastMean.z+=positions[k+2];}
   }
  }
  wire.firstMean.divideScalar(sides);wire.lastMean.divideScalar(sides);box.expandByScalar(radius);
  box.getCenter(mesh.geometry.boundingSphere.center);mesh.geometry.boundingSphere.radius=box.getSize(boxSize).length()*.5;
  mesh.geometry.attributes.position.needsUpdate=true;mesh.geometry.attributes.normal.needsUpdate=true;
  if(wire.installedLength===null)wire.installedLength=wire.length;wire.updates++;geometryUpdates++;
 }
 function targetAlpha(request,channel,endpointIds=[]){
  if(request.variant==='e74'||request.department==='driverless'||request.department==='operations')return 0;
  if(request.department==='all'||request.mode==='all')return 1;
  if(request.department==='power'&&['power','engine'].includes(request.mode))return 1;
  if(request.department==='structure'&&request.mode==='frame')return .32;
  if(request.department==='chassis'&&['steering','chassis'].includes(request.mode))return ['dashboard','buttons'].includes(channel)||channel==='terminal'&&endpointIds.some(id=>instrumentIds.has(id))?.65:.10;
  return .027;
 }
 function update(motion={},focus=[whole],exploded=0){
  if(disposed)return state;syncInstrumentAnchors();
  if(root.parent){root.updateWorldMatrix(true,false);inverseRoot.copy(root.matrixWorld).invert();}
  else if(assembly){assembly.updateWorldMatrix(true,false);inverseRoot.copy(assembly.matrixWorld).invert();}
  else inverseRoot.identity();
  for(const node of nodes.values()){
   node.mesh.updateWorldMatrix(true,false);basis.copy(inverseRoot).multiply(node.mesh.matrixWorld);node.matrix.copy(basis);node.position.copy(node.local).applyMatrix4(basis);node.direction.copy(node.normal).transformDirection(basis);
  }
  const assemblyAlpha=motion.variants?.assemblyAlpha??motion.assemblyAlpha??1;let visible=0;
  for(const wire of wires){
   updateGeometry(wire);const alpha=clamp(focus.reduce((n,r)=>n+targetAlpha(r,wire.channel,wire.endpointIds)*r.weight,0))*assemblyAlpha;
   wire.mesh.material.opacity=alpha;wire.mesh.material.depthWrite=alpha>.9999;wire.mesh.visible=alpha>.002;wire.mesh.castShadow=alpha>.15;wire.mesh.userData.defocusWeight=1-clamp(alpha);wire.mesh.userData.defocus=alpha<.5;if(wire.mesh.visible)visible++;
  }
  root.visible=visible>0;state={ready:!!ecuPort&&missing.size===0&&wires.some(w=>w.channel==='main')&&wires.some(w=>w.channel==='dashboard')&&wires.some(w=>w.channel==='buttons'),visibleWires:visible,exploded:clamp(exploded),assemblyAlpha};return state;
 }
 function diagnostics(){
  let maximumEndpointGap=0;
  const circuits=wires.map(w=>{const first=w.firstMean.distanceTo(w.path[0].position),last=w.lastMean.distanceTo(w.path.at(-1).position);maximumEndpointGap=Math.max(maximumEndpointGap,first,last);return {id:w.id,channel:w.channel,radius:w.radius,endpointIds:w.endpointIds,pathNodeIds:w.path.map(n=>n.id),firstNode:w.path[0].id,lastNode:w.path.at(-1).id,firstEndpoint:w.path[0].position.toArray(),lastEndpoint:w.path.at(-1).position.toArray(),firstGapM:first,lastGapM:last,installedLengthM:w.installedLength,currentLengthM:w.length,geometryUpdates:w.updates,geometryUuid:w.mesh.geometry.uuid};});
  const endpoints=new Set(wires.flatMap(w=>[w.path[0],w.path.at(-1)]));
  const unconnectedEndpointIds=[...endpoints].filter(n=>n.surfaceDistance===null&&wires.filter(w=>w.path.includes(n)).length<2).map(n=>n.id);
  return {...state,ecuId:ECU_ID,ecuModel:'M150',wires:wires.length,instrumentEndpointIds:[...instrumentIds],instrumentButtons:[...instrumentAnchors.values()].filter(a=>a.role==='button').map(a=>a.id),maximumEndpointGapM:maximumEndpointGap,unconnectedEndpointIds,missingAnchors:[...missing].map(([id,reason])=>({id,reason})),coordinateSpace:'harness-root-local-m',dynamicBufferReuse:true,geometryUpdates,sourceCADModified:false,individualPinMappingAssigned:false,routeBasis:'source-identified controller connector and instrument/switch terminals; frame-guided presentation',sourceSurfaceDistances:[...nodes.values()].filter(n=>n.surfaceDistance!==null&&!n.guide).map(n=>({id:n.id,meshId:n.mesh.userData.id,distanceM:n.surfaceDistance})),supportIds:[...new Set([...nodes.values()].filter(n=>n.guide).map(n=>n.mesh.userData.id))],circuits};
 }
 function framingPoints(request=whole){if(request.variant==='e74'||['driverless','operations'].includes(request.department))return [];return wires.filter(w=>targetAlpha(request,w.channel,w.endpointIds)>.35).flatMap(w=>w.centres.filter((_,i)=>i%8===0).map(p=>p.clone()));}
 syncInstrumentAnchors();
 return {root,items,update,diagnostics,framingPoints,get revision(){return revision;},dispose(){if(disposed)return;disposed=true;for(const item of resources)item.dispose();resources.clear();root.clear();nodes.clear();wires.length=0;items.length=0;}};
}
