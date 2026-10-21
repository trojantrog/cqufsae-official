import * as T from './vendor/three.module.min.js';
import {C41_DRIVE} from './c41-drive-775.js?v=775';
import {createTyreSidewallMark} from './tyre-sidewall-mark-757.js?v=758.1';

const TAU4=Math.PI*4,clamp=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
const smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const mod=(x,n)=>((x%n)+n)%n;
const identity=()=>new T.Matrix4();
const sourceId=o=>o?.userData?.id||o?.userData?.sourceId||o?.userData?.source_sourceId||o?.name;
const listMaterials=object=>Array.isArray(object?.material)?object.material:object?.material?[object.material]:[];

/** Exact Blender deltas below the existing rig's assembly transform. */
export function createNativeGeometry(manifest,buffer,materialFactory){
 if(typeof materialFactory!=='function')throw new Error('Native materialFactory is required');
 const pieces=new Map(manifest.pieces.map(p=>[p.id,p])),definitions=new Map(manifest.geometries.map(g=>[g.id,g]));
 const chunkDefs=new Map(manifest.chunks.map(c=>[c.id,c])),geometryCache=new Map(),prepared=new Map(),consumed=new Set(),aeroMetadata=new Set();
 const bodyIds=new Set(['body-003-near','body-003-far','body-004','body-005','body-006']);
 const replacements=new Set(manifest.replaceSources),hideSources=new Set(manifest.hideSourceIds);
 const hideNames=new Set(manifest.hideNames.map(n=>n.replace(/\.\d{3}$/,'')));
 const rows=[],batches=[],nativeSources=[],hiddenOwn=new Set(),hostMap=new Map(),hostCache=new Map(),nodeCache=new Map();
 const hostRest=new Map(manifest.hosts.map(h=>[h.sourceId,new T.Matrix4().fromArray(h.restAssemblyMatrix)]));
 const invHostRest=new Map([...hostRest].map(([id,m])=>[id,m.clone().invert()]));
 const root=new T.Group();root.name='blender-native-c41-geometry';root.userData.nativeC41Bridge=true;
 const scratch={a:identity(),b:identity(),c:identity(),d:identity(),v:new T.Vector3(),p:new T.Vector3(),q:new T.Quaternion(),s:new T.Vector3()};
 let attachedRig=null,updateVersion=0,disposed=false;
 const stats={preparedSources:0,reusedSources:0,chunks:0,drawCalls:0,nearWindows:0,instances:0,missingHosts:[],nativeMotionNodes:0,springDeformation:'GPU weighted translation and inverse Jacobian normals'};

 function array(d){
  const Type=d.componentType===5126?Float32Array:d.componentType===5123?Uint16Array:d.componentType===5125?Uint32Array:null;
  if(!Type)throw new Error('Native attribute component type');
  return new Type(buffer,d.byteOffset,d.count*d.itemSize);
 }
 function geometry(id){
  if(geometryCache.has(id))return geometryCache.get(id);
  const d=definitions.get(id);if(!d)throw new Error('Native geometry is missing: '+id);
  const g=new T.BufferGeometry();g.name=id;
  g.setAttribute('position',new T.BufferAttribute(array(d.position),3));g.setAttribute('normal',new T.BufferAttribute(array(d.normal),3));
  g.setIndex(new T.BufferAttribute(array(d.index),1));
  const uvNames=Object.keys(d.uvLayers),channels={};
  for(const [i,name]of uvNames.entries()){
   const attr=new T.BufferAttribute(array(d.uvLayers[name]),2),channel=name==='Carbon_Weave'?1:i;
   g.setAttribute(name,attr);g.setAttribute(channel===0?'uv':'uv'+channel,attr);channels[name]=channel;
  }
  for(const [name,descriptor]of Object.entries(d.extraAttributes||{}))g.setAttribute(name,new T.BufferAttribute(array(descriptor),descriptor.itemSize));
  const morphs=Object.keys(d.extraAttributes||{}).filter(n=>n.startsWith('morphDelta')).sort();
  if(morphs.length){g.morphTargetsRelative=true;g.morphAttributes.position=morphs.map(name=>g.getAttribute(name));}
  g.userData={nativeC41:true,uvChannels:channels,sourceGeometryId:id};g.computeBoundingBox();g.computeBoundingSphere();geometryCache.set(id,g);return g;
 }
 function makeMaterial(id,g,context={}){
  const m=materialFactory(id,{geometry:g,sourceKey:'c41',...context});
  if(!m?.isMaterial)throw new Error('Native materialFactory must synchronously return a Three material');
  m.userData.nativeC41MaterialId=id;return m;
 }
 function setOpacity(mesh,alpha,host=null,{ignoreClipping=false}={}){
  alpha=clamp(alpha);const source=listMaterials(host)[0];
  for(const material of listMaterials(mesh)){
   material.opacity=alpha;material.userData.setNativeOpacity?.(alpha);
   material.transparent=true;material.depthWrite=alpha>.9999;
   const planes=ignoreClipping?null:source?.clippingPlanes||null;
   const intersection=ignoreClipping?false:source?.clipIntersection||false;
   material.clippingPlanes=planes;material.clipIntersection=intersection;
   material.userData.setNativeClipping?.(planes,intersection);
  }
  for(const material of [mesh.customDepthMaterial,mesh.customDistanceMaterial])if(material){material.clippingPlanes=ignoreClipping?null:source?.clippingPlanes||null;material.clipIntersection=ignoreClipping?false:source?.clipIntersection||false;}
  mesh.visible=alpha>.002;mesh.castShadow=alpha>.9999;mesh.receiveShadow=host?.receiveShadow??true;
  mesh.userData.defocusWeight=host?.userData?.defocusWeight??0;mesh.userData.defocus=host?.userData?.defocus??false;
 }
 function sourceMaterial(mesh,slot){
  if(!slot)return;
  const material=makeMaterial(slot.materialId,mesh.geometry,{source:mesh.userData,sourceMesh:mesh,reuse:true});
  mesh.material=material;
  if(material.color){mesh.userData.baseColor=material.color.clone();mesh.userData.contextColor=material.color.clone().lerp(new T.Color('#85877f'),.58);}
  mesh.userData.baseMetal=material.metalness??0;mesh.userData.baseRoughness=material.roughness??.5;
  mesh.userData.nativeC41Material=true;
 }

 /** Call before livery-derived wing and half-body views are constructed. */
 function prepareSource(mesh){
  if(disposed||!mesh?.isMesh)return false;
  const id=sourceId(mesh);
  const reuse=manifest.reuse.find(r=>r.sourceId===id);
  if(reuse){sourceMaterial(mesh,reuse.materialSlots[0]);mesh.userData.nativeDamperRestored=true;return true;}
  if(!bodyIds.has(id)||prepared.has(id))return false;
  const piece=manifest.pieces.find(p=>p.sourceId===id&&p.category==='body-carbon-and-clearance');
  const candidates=manifest.chunks.filter(c=>c.ranges.some(r=>r.pieceId===piece?.id));
  if(candidates.length!==1)throw new Error('Native body replacement requires one original-order chunk: '+id);
  const chunk=candidates[0],old=mesh.geometry,next=geometry(chunk.geometry);
  if(!old.index||old.index.count!==next.index.count)throw new Error('Native body triangle ordering changed: '+id);
  const oldIndex=old.index.array,first=new Uint32Array(old.attributes.position.count);first.fill(0xffffffff);
  for(let i=0;i<oldIndex.length;i++)if(first[oldIndex[i]]===0xffffffff)first[oldIndex[i]]=next.index.array[i];
  prepared.set(id,{mesh,oldIndex,oldPosition:old.attributes.position,first,newIndex:next.index.array,triangleMap:null});
  mesh.geometry=next;sourceMaterial(mesh,{materialId:chunk.materialId});
  mesh.userData.nativeC41Geometry=true;mesh.userData.nativeOriginalTriangleOrder=true;
  consumed.add(chunk.id);stats.preparedSources++;
  // The first source stores the whole front/rear partition dataset. Later
  // prepareSource calls must also update that already-returned private copy.
  for(const entry of aeroMetadata)adaptMetadata(entry);
  return true;
 }
 function remapVertex(data,value){
  if(!Number.isInteger(value)||value<0||value>=data.first.length)throw new Error(`Native cap vertex outside ${sourceId(data.mesh)} old=${data.first.length} new=${data.mesh.geometry.attributes.position.count} index=${value}`);
  if(data.first[value]===0xffffffff){
   // Caps may refer to a source CAD vertex unused by all exterior triangles.
   // Recover only a geometrically coincident retained corner, never a free snap.
   const old=data.oldPosition,next=data.mesh.geometry.attributes.position,x=old.getX(value),y=old.getY(value),z=old.getZ(value);let best=-1,distance=1e-12;
   for(let i=0;i<next.count;i++){const d=(next.getX(i)-x)**2+(next.getY(i)-y)**2+(next.getZ(i)-z)**2;if(d<distance){distance=d;best=i;}}
   if(best<0)throw new Error(`Native cap vertex unused and no coincident retained corner: ${sourceId(data.mesh)} index=${value}`);
   data.first[value]=best;
  }
  return data.first[value];
 }
 function remapTriangleIndices(data,indices){
  if(indices.length%3)throw new Error('Native wing triangle index count');
  if(!data.triangleMap){
   data.triangleMap=new Map();
   for(let i=0;i<data.oldIndex.length;i+=3){const key=data.oldIndex[i]+','+data.oldIndex[i+1]+','+data.oldIndex[i+2];let bucket=data.triangleMap.get(key);if(!bucket){bucket=[];data.triangleMap.set(key,bucket);}bucket.push(i);}
  }
  const result=new Uint32Array(indices.length),used=new Map();
  for(let i=0;i<indices.length;i+=3){
   const key=indices[i]+','+indices[i+1]+','+indices[i+2],offset=used.get(key)||0,bucket=data.triangleMap.get(key);
   if(!bucket?.[offset]&&bucket?.[offset]!==0)throw new Error('Native wing triangle is absent from the original source');
   const at=bucket[offset];used.set(key,offset+1);result[i]=data.newIndex[at];result[i+1]=data.newIndex[at+1];result[i+2]=data.newIndex[at+2];
  }
  return Array.from(result);
 }
 function adaptMetadata(entry){
  function adapt(definition,id){
   const data=prepared.get(id);if(!data||entry.adapted.has(id))return;
   const position=data.mesh.geometry.attributes.position;
   // Keep a durable marker because callers can clone userData between the
   // per-source preparation and the final whole-dataset adaptation pass.
   const already=definition.nativeGeometryIndexRevision===manifest.binarySHA256||
    (definition.sourceVertices===position.count&&definition.sourceIndices===data.newIndex.length&&position.count!==data.oldPosition.count);
   definition.sourceVertices=position.count;definition.sourceIndices=data.newIndex.length;
   if(!already){
    const groups=Array.isArray(definition.groups)?definition.groups:Object.values(definition.groups||{});
    for(const group of groups){
     for(const cap of group.caps||[])cap.sourceVertexIndices=cap.sourceVertexIndices.map(v=>remapVertex(data,v));
     if(group.indices)group.indices=remapTriangleIndices(data,group.indices);
    }
   }
   definition.nativeGeometryIndexRevision=manifest.binarySHA256;
   entry.adapted.add(id);
  }
  if(Array.isArray(entry.result.objects)){for(const definition of entry.result.objects)adapt(definition,definition.sourceId);}
  else adapt(entry.result,entry.result.sourceId||entry.id);
 }
 /** Clone metadata, preserving source triangle ranges and remapping cap corners. */
 function adaptAeroGroups(original,source){
  if(!original)return original;
  for(const entry of aeroMetadata)if(entry.result===original){adaptMetadata(entry);return entry.result;}
  const entry={result:structuredClone(original),id:typeof source==='string'?source:sourceId(source),adapted:new Set()};
  aeroMetadata.add(entry);adaptMetadata(entry);return entry.result;
 }

 // Convert source matrices to compact rigid samples once. Continuous shaft
 // rotations and the native timing-chain route bypass the 120-frame clip loop.
 const motionNodes=new Map(manifest.nodes.filter(n=>n.deltaSamples).map(n=>{
  const values=array(n.deltaSamples),samples=[];
  for(let i=0;i<n.deltaSamples.count;i++){
   const matrix=new T.Matrix4().fromArray(values,i*16),p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();matrix.decompose(p,q,s);samples.push({p,q,s});
  }
  return [n.id,{definition:n,samples,reference:new T.Matrix4().fromArray(n.referenceMatrix),inverseReference:new T.Matrix4().fromArray(n.referenceMatrix).invert(),matrix:identity(),version:-1,
                axis:n.continuousMotion?.axis?new T.Vector3(...n.continuousMotion.axis):null,pivot:n.continuousMotion?.pivot?new T.Vector3(...n.continuousMotion.pivot):null}];
 }));
 stats.nativeMotionNodes=motionNodes.size;
 const timing=manifest.nativeTimingChain,engineRoot=timing?new T.Matrix4().fromArray(timing.engineRootReferenceMatrix):identity();
 function motionDelta(id,theta){
  if(!id)return scratch.d.identity();
  const node=motionNodes.get(id);if(!node)throw new Error('Missing native motion node: '+id);
  if(node.version===updateVersion)return node.matrix;node.version=updateVersion;
  const rule=node.definition.continuousMotion;
  if(rule?.kind==='fixed-axis'){
   node.matrix.makeRotationAxis(node.axis,(theta-rule.crankReference)*rule.crankGain);
   scratch.v.copy(node.pivot).applyMatrix4(node.matrix);node.matrix.setPosition(scratch.v.subVectors(node.pivot,scratch.v));
  }else if(rule?.kind==='native-timing-chain'){
   if(!timing)throw new Error('Native timing-chain route is missing');
   const distance=mod(rule.index/timing.count-theta*timing.crankPitchRadius/timing.length,1)*timing.length,cumulative=timing.cumulativeDistance;
   let lo=0,hi=cumulative.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(cumulative[mid]<=distance)lo=mid;else hi=mid;}
   const first=timing.pathXZ[lo],last=timing.pathXZ[lo+1],dx=last[0]-first[0],dz=last[1]-first[1],weight=(distance-cumulative[lo])/(cumulative[lo+1]-cumulative[lo]);
   node.matrix.makeRotationY(-Math.atan2(dx,dz));node.matrix.setPosition(first[0]+dx*weight,timing.localY,first[1]+dz*weight);
   node.matrix.premultiply(engineRoot).multiply(node.inverseReference);
  }else{
   const frame=mod(theta-(manifest.nativeEngineClip.nativeStartCrankRadians??Math.PI/3),TAU4)*120/TAU4;
   const first=Math.floor(frame),weight=frame-first,a=node.samples[first],b=node.samples[first+1];
   scratch.p.lerpVectors(a.p,b.p,weight);scratch.q.slerpQuaternions(a.q,b.q,weight);scratch.s.lerpVectors(a.s,b.s,weight);
   node.matrix.compose(scratch.p,scratch.q,scratch.s);
  }
  return node.matrix;
 }
 function hostDelta(id,assemblyInverse){
  if(id==='@assembly')return scratch.d.identity();
  const cached=hostCache.get(id);if(cached?.version===updateVersion)return cached.matrix;
  const host=hostMap.get(id);if(!host)return scratch.d.identity();
  const entry=cached||{matrix:identity(),version:0};entry.matrix.copy(assemblyInverse).multiply(host.matrixWorld).multiply(invHostRest.get(id)||identity());entry.version=updateVersion;hostCache.set(id,entry);return entry.matrix;
 }
 function ownDrawOff(object){
  if(!object)return;
  for(const material of listMaterials(object))material.visible=false;
 }
 function bindSpring(mesh,piece){
  const g=mesh.geometry,position=g.getAttribute('position').array,weights=g.getAttribute(piece.spring.weightAttribute).array,index=g.index.array;
  const gradient=new Float32Array(position.length),areaSum=new Float64Array(weights.length);
  // Gradient of the piecewise-linear weight on each original surface triangle.
  // Area averaging retains smooth split normals and does not move a source point.
  const e1=new T.Vector3(),e2=new T.Vector3(),normal=new T.Vector3(),first=new T.Vector3(),second=new T.Vector3();
  for(let i=0;i<index.length;i+=3){
   const a=index[i],b=index[i+1],c=index[i+2];
   e1.fromArray(position,b*3).sub(first.fromArray(position,a*3));e2.fromArray(position,c*3).sub(first);
   normal.crossVectors(e1,e2);const squared=normal.lengthSq();if(squared<1e-24)continue;
   const area=Math.sqrt(squared),dw1=weights[b]-weights[a],dw2=weights[c]-weights[a];
   first.crossVectors(e2,normal).multiplyScalar(dw1);second.crossVectors(normal,e1).multiplyScalar(dw2);first.add(second).multiplyScalar(area/squared);
   for(const vertex of [a,b,c]){gradient[vertex*3]+=first.x;gradient[vertex*3+1]+=first.y;gradient[vertex*3+2]+=first.z;areaSum[vertex]+=area;}
  }
  for(let i=0;i<weights.length;i++)if(areaSum[i]>0)for(let k=0;k<3;k++)gradient[i*3+k]/=areaSum[i];
  g.setAttribute('nativeSpringGradient',new T.BufferAttribute(gradient,3));
  const uniforms={nativeSpringTravel:{value:0},nativeSpringAxis:{value:new T.Vector3(...piece.spring.axis)}};
  function maskVertexPatch(shader){
   Object.assign(shader.uniforms,uniforms);
   if(!shader.vertexShader.includes('#include <begin_vertex>'))throw new Error('Native spring requires the standard Three vertex position stage');
   shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute float springWeight;
uniform float nativeSpringTravel;
uniform vec3 nativeSpringAxis;`);
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
transformed += nativeSpringAxis * (springWeight * nativeSpringTravel);`);
  }
  maskVertexPatch.cacheKey='native-spring-position-756';
  mesh.userData.nativeMaskVertexPatch=maskVertexPatch;mesh.userData.nativeMaskVertexKey=maskVertexPatch.cacheKey;
  mesh.material.userData.nativeMaskVertexPatch=maskVertexPatch;
  function patch(material){
   const previous=material.onBeforeCompile,programKey=material.customProgramCacheKey.bind(material);
   material.onBeforeCompile=function(shader,renderer){
    previous.call(this,shader,renderer);maskVertexPatch(shader);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec3 nativeSpringGradient;`);
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
float nativeSpringDet = 1.0 + nativeSpringTravel * dot(nativeSpringGradient, nativeSpringAxis);
nativeSpringDet = abs(nativeSpringDet) < 0.00001 ? (nativeSpringDet < 0.0 ? -0.00001 : 0.00001) : nativeSpringDet;
objectNormal = normalize(objectNormal - nativeSpringGradient * (nativeSpringTravel * dot(nativeSpringAxis, objectNormal) / nativeSpringDet));`);
   };
   material.customProgramCacheKey=()=>programKey()+'|native-spring-inverse-jacobian-756';material.needsUpdate=true;return material;
  }
  patch(mesh.material);
  mesh.customDepthMaterial=patch(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:mesh.material.side}));
  mesh.customDistanceMaterial=patch(new T.MeshDistanceMaterial({side:mesh.material.side}));
  mesh.userData.nativeSpringUniforms=uniforms;mesh.frustumCulled=false;
  return uniforms;
 }
 function attach(rig){
  if(disposed)throw new Error('The native geometry bridge has been disposed');
  if(attachedRig){if(attachedRig!==rig)throw new Error('Native geometry already belongs to another rig');return api;}
  attachedRig=rig;
  rig.root.traverse(object=>{const id=sourceId(object);if(id&&!hostMap.has(id))hostMap.set(id,object);if(object.name&&!hostMap.has(object.name))hostMap.set(object.name,object);});
  for(const mesh of rig.meshes||[])hostMap.set(sourceId(mesh),mesh);
  rig.assembly.add(root);
  for(const id of [...hideSources,...replacements]){
   if(prepared.has(id))continue;const source=hostMap.get(id);if(source?.isMesh){hiddenOwn.add(source);ownDrawOff(source);}
  }
  for(const row of manifest.reuse){
   const mesh=hostMap.get(row.sourceId),host=hostMap.get(row.hostId);
   if(!mesh||!host){stats.missingHosts.push(row.sourceId);continue;}
   if(!mesh.userData.nativeDamperRestored)sourceMaterial(mesh,row.materialSlots[0]);
   nativeSources.push({mesh,host,row});
  }
  function createRow(chunk){
   const piece=pieces.get(chunk.ranges[0].pieceId);let g=geometry(chunk.geometry);
   if(piece.sourceId?.startsWith('Hoosier_')){
    const wheel=rig.driveline?.diagnostics().wheels.find(w=>w.sourceId===chunk.hostId);
    const rim=rig.meshes.find(m=>m.userData.label==='轮辋'&&(m.userData.center[0]>0)===wheel?.front&&Math.sign(m.userData.center[1])===wheel?.side);
    g=createTyreSidewallMark(hostMap.get(chunk.hostId),wheel,{rim});geometryCache.set('outer-mark-'+chunk.hostId,g);
   }
   return {chunk,piece,g,reference:new T.Matrix4().fromArray(chunk.referenceMatrix),host:hostMap.get(chunk.hostId)||null};
  }
  const instancedChunkIds=new Set();
  for(const batch of manifest.instanceBatches||[]){
   const selected=batch.chunks.filter(id=>!consumed.has(id));if(selected.length<2)continue;
   const entries=selected.map(id=>createRow(chunkDefs.get(id))),g=entries[0].g;
   const material=makeMaterial(batch.materialId,g,{chunk:entries[0].chunk,piece:entries[0].piece,instanced:true});
   const mesh=new T.InstancedMesh(g,material,entries.length);mesh.name=batch.id;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
   mesh.userData={nativeC41:true,nativeInstanceBatch:true,group:entries[0].piece.group,mechanism:entries[0].piece.mechanism,partCounted:false};
   root.add(mesh);batches.push({mesh,entries});for(const id of selected)instancedChunkIds.add(id);stats.instances+=entries.length;
  }
  for(const chunk of manifest.chunks){
   if(consumed.has(chunk.id)||instancedChunkIds.has(chunk.id))continue;
   const row=createRow(chunk),material=makeMaterial(chunk.materialId,row.g,{chunk,piece:row.piece});
   const mesh=new T.Mesh(row.g,material);mesh.name=chunk.id;mesh.matrixAutoUpdate=false;
   mesh.userData={nativeC41:true,group:row.piece.group,mechanism:row.piece.mechanism,partCounted:false,sourceId:row.piece.sourceId};
   if(row.g.userData.nativeTyreMark){material.side=T.FrontSide;material.alphaTest=.025;mesh.userData.nativeTyreMark={...row.g.userData};}
   root.add(mesh);row.mesh=mesh;
   if(row.piece.spring)row.springUniforms=bindSpring(mesh,row.piece);
   if(row.piece.category==='complete-engine-CAD'){
    const twin=new T.Mesh(row.g,makeMaterial(chunk.materialId,row.g,{chunk,piece:row.piece,nativeNearWindow:true}));
    twin.name=chunk.id+'-native-near-window';twin.matrixAutoUpdate=false;twin.visible=false;twin.renderOrder=32;
    twin.userData={...mesh.userData,nativeNearWindow:true};root.add(twin);row.nearWindow=twin;stats.nearWindows++;
   }
   rows.push(row);
  }
  for(const chunk of manifest.chunks)if(chunk.hostId!=='@assembly'&&!hostMap.has(chunk.hostId))stats.missingHosts.push(chunk.hostId);
  stats.missingHosts=[...new Set(stats.missingHosts)];stats.reusedSources=nativeSources.length;stats.chunks=manifest.chunks.length-consumed.size;stats.drawCalls=rows.length+batches.length+consumed.size+stats.nearWindows;
  if(stats.missingHosts.length)throw new Error('Native C41 motion hosts are missing: '+stats.missingHosts.join(', '));
  return api;
 }
 function trackValue(track,frame){
  const keys=track.keys;if(frame<=keys[0][0])return keys[0][1];if(frame>=keys.at(-1)[0])return keys.at(-1)[1];
  let lo=0,hi=keys.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(keys[mid][0]<=frame)lo=mid;else hi=mid;}
  const a=keys[lo],b=keys[hi],kind=track.interpolation?.[lo];if(kind==='CONSTANT')return a[1];
  if(kind!=='BEZIER')return T.MathUtils.lerp(a[1],b[1],(frame-a[0])/(b[0]-a[0]));
  const h1=track.handlesRight[lo],h2=track.handlesLeft[hi],bezier=(u,v,w,x,t)=>{const s=1-t;return s*s*s*u+3*s*s*t*v+3*s*t*t*w+t*t*t*x;};
  let left=0,right=1,t=.5;for(let i=0;i<15;i++){t=(left+right)*.5;if(bezier(a[0],h1[0],h2[0],b[0],t)<frame)left=t;else right=t;}
  return bezier(a[1],h1[1],h2[1],b[1],t);
 }
 function update(rig,focus=[],exploded=0,motion=rig.getMotion?.()||{}){
  if(disposed)return;if(!attachedRig)attach(rig);updateVersion++;
  rig.assembly.updateWorldMatrix(true,true);const assemblyInverse=scratch.a.copy(rig.assembly.matrixWorld).invert();
  const start=manifest.nativeEngineClip.nativeStartCrankRadians??Math.PI/3;
  const phase=motion.nativeCrankRadians??(start+(motion.drivePhase?.displayedAxleAngle??motion.axleAngle??0)*C41_DRIVE.crankPerAxle);
  const coreWeight=focus.reduce((a,r)=>a+(r.variant!=='e74'?(r.mode==='engine'?1:r.department==='power'&&r.mode==='power'?.8:0)*r.weight:0),0);
  const allWeight=focus.reduce((a,r)=>a+(r.mode==='all'?r.weight:0),0),electricWeight=focus.reduce((a,r)=>a+(r.department==='power'&&r.variant==='e74'?r.weight:0),0);
  const coreAlpha=Math.max(coreWeight,allWeight*smooth((exploded-.05)/.25))*(motion.variants?.assemblyAlpha??1)*(1-smooth(electricWeight/.8));
  const nearHost=rig.windows?.find(mesh=>hideSources.has(sourceId(mesh.userData.windowSource)))||null;
  for(const {mesh,host}of nativeSources){
   const alpha=listMaterials(host)[0]?.opacity??0;setOpacity(mesh,alpha,host);mesh.material.visible=true;
   // chassis.applyPart already supplied rigid motion and explosion. No scale or
   // replacement transform is applied to these byte-identical source meshes.
  }
  function applyMatrix(row,target){
   const h=hostDelta(row.chunk.hostId,assemblyInverse),n=motionDelta(row.chunk.motionNode,phase);
   target.copy(h).multiply(n).multiply(row.reference);return target;
  }
  function appearance(row,mesh){
   const internal=row.piece.category==='engine-internals';
   let host=row.host;
   if(!host&&row.chunk.hostId==='@assembly')host=hostMap.get(row.piece.mechanism==='fr-aero'?'body-004':'frame-057');
   let alpha=internal?coreAlpha:listMaterials(host)[0]?.opacity??1;
   if(row.piece.category==='spring-and-brand-marks'&&host?.userData.nativeDamperRestored)alpha=listMaterials(host)[0]?.opacity??alpha;
   setOpacity(mesh,alpha,host,{ignoreClipping:internal});
  }
  for(const row of rows){
   applyMatrix(row,row.mesh.matrix);row.mesh.matrixWorldNeedsUpdate=true;
   appearance(row,row.mesh);
   if(row.springUniforms&&row.mesh.visible){
    const d=motion.chassis?.dampers?.find(v=>v.name===row.piece.spring.damper),travel=d?(d.length-d.baseLength):0;
    if(row.springUniforms.nativeSpringTravel.value!==travel)row.springUniforms.nativeSpringTravel.value=travel;
   }
   if(row.mesh.visible&&row.chunk.nativeMorphs?.length){
    const frame=1+mod(phase-start,TAU4)*120/TAU4;
    row.chunk.nativeMorphs.forEach((m,i)=>{const track=m.tracks[0];if(track)row.mesh.morphTargetInfluences[i]=trackValue(track,frame)-m.initialValue;});
   }
   if(row.nearWindow){
    row.nearWindow.matrix.copy(row.mesh.matrix);row.nearWindow.matrixWorldNeedsUpdate=true;
    const alpha=(listMaterials(row.host)[0]?.opacity??0)*clamp(coreWeight)*.08;
    setOpacity(row.nearWindow,nearHost?.material?.clippingPlanes?.length?alpha:0,nearHost);
    row.nearWindow.userData.defocusWeight=row.mesh.userData.defocusWeight;
   }
  }
  for(const batch of batches){
   batch.entries.forEach((row,i)=>{applyMatrix(row,scratch.b);batch.mesh.setMatrixAt(i,scratch.b);});batch.mesh.instanceMatrix.needsUpdate=true;appearance(batch.entries[0],batch.mesh);
  }
  for(const object of hiddenOwn)ownDrawOff(object);
  for(const mesh of rig.windows||[])if(hideSources.has(sourceId(mesh.userData.windowSource)))mesh.visible=false;
  if(rig.core?.root)rig.core.root.visible=false;
  rig.chassis?.root.traverse(object=>{if(hideNames.has(object.name.replace(/\.\d{3}$/,'')))object.visible=false;});
  root.updateMatrixWorld(true);
 }
 function dispose(){
  if(disposed)return;disposed=true;root.removeFromParent();
  for(const g of geometryCache.values())g.dispose();geometryCache.clear();
  for(const mesh of root.children){for(const material of listMaterials(mesh))material.dispose();mesh.customDepthMaterial?.dispose();mesh.customDistanceMaterial?.dispose();}root.clear();
  prepared.clear();aeroMetadata.clear();hostCache.clear();nodeCache.clear();
 }
 const api={prepareSource,adaptAeroGroups,attach,update,dispose,stats,root};return api;
}
