import * as T from './vendor/three.module.min.js';
import {explosionPosition,explosionEnvelopePoints} from './explosion-layout.js?v=747';

const V=(...a)=>new T.Vector3(...a),clamp=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
const smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const corners=box=>{const out=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])out.push(V(x,y,z));return out;};

// Relative to each source body's extraction path. Front wing elements move
// laterally from the outset, clearing the unchanged near-nose extraction.
export function aeroExplosionOffset(sourceId,group,progress){
 const p=clamp(progress),start=sourceId==='body-005'?.22:.18;
 const amount=smooth((p-start)/(1-start)),offset=V(...group.displayOffsetM).multiplyScalar(amount);
 if(sourceId==='body-004'){
  const release=1-(1-p)**3;offset.y=group.displayOffsetM[1]*release;
  if(group.id.includes('lower-flap')){
   offset.x=group.displayOffsetM[0]*release;offset.z=group.displayOffsetM[2]*release;
   const initialLateral=Math.sign(group.displayOffsetM[1])*.80;
   offset.y=initialLateral*release+(group.displayOffsetM[1]-initialLateral)*smooth((p-.25)/.75);
  }
 }
 return offset;
}

export function createAeroExplosion(sources=[],{data=null}={}){
 data??=sources.find(mesh=>mesh.userData.aeroExplosionGroups)?.userData.aeroExplosionGroups;
 const entries=[],parts=[],resources=[];let progress=0,disposed=false;
 if(data&&!(data.schemaVersion===1&&data.kind==='native-aero-display-partitions'))throw new Error('Aero partition format');
 for(const definition of data?.objects||[]){
  const source=sources.find(mesh=>mesh.userData.id===definition.sourceId);if(!source)continue;
  const geometry=source.geometry,position=geometry.attributes.position,index=geometry.index;
  if(Array.isArray(source.material)||!position||!index||position.count!==definition.sourceVertices||index.count!==definition.sourceIndices)throw new Error('Aero partition source mismatch');
  const coverage=new Uint8Array(index.count/3),entry={source,definition,groups:[],active:false,originalMaterialVisible:source.material.visible};
  for(const definitionGroup of definition.groups){
   const indices=new Uint32Array(definitionGroup.sourceTriangles*3);let cursor=0;
   for(const [first,count]of definitionGroup.triangleRanges){
    if(!Number.isInteger(first)||!Number.isInteger(count)||first<0||count<1||first+count>coverage.length)throw new Error('Aero partition range');
    for(let triangle=first;triangle<first+count;triangle++)if(coverage[triangle]++)throw new Error('Aero partition overlap');
    indices.set(index.array.subarray(first*3,(first+count)*3),cursor);cursor+=count*3;
   }
   if(cursor!==indices.length)throw new Error('Aero partition count');
   const partGeometry=new T.BufferGeometry(),box=new T.Box3(),point=V();
   for(const [name,attribute]of Object.entries(geometry.attributes))partGeometry.setAttribute(name,attribute);
   for(const value of indices)box.expandByPoint(point.fromBufferAttribute(position,value));
   partGeometry.setIndex(new T.BufferAttribute(indices,1));partGeometry.boundingBox=box;partGeometry.boundingSphere=box.getBoundingSphere(new T.Sphere());
   const material=source.material.clone();material.onBeforeCompile=source.material.onBeforeCompile;material.customProgramCacheKey=source.material.customProgramCacheKey;
   const mesh=new T.Mesh(partGeometry,material);mesh.name=definitionGroup.id;mesh.visible=false;mesh.receiveShadow=false;
   mesh.userData={id:definitionGroup.id,label:source.userData.label,group:'body',mechanism:'fr-aero',aeroExplosion:true,sourceId:definition.sourceId,sourceTriangles:indices.length/3,derivedCapTriangles:definitionGroup.derivedCapTriangles,partCounted:false,defocusWeight:0};
   source.add(mesh);parts.push(mesh);resources.push({geometry:partGeometry,material,sharedAttributes:true});
   const capPositions=[],capIndices=[];let capOffset=0;
   for(const cap of definitionGroup.caps){
    for(const sourceIndex of cap.sourceVertexIndices){
     if(!Number.isInteger(sourceIndex)||sourceIndex<0||sourceIndex>=position.count)throw new Error('Aero cap source vertex');
     capPositions.push(position.getX(sourceIndex),position.getY(sourceIndex),position.getZ(sourceIndex));
    }
    for(const capIndex of cap.indices){if(!Number.isInteger(capIndex)||capIndex<0||capIndex>=cap.sourceVertexIndices.length)throw new Error('Aero cap index');capIndices.push(capIndex+capOffset);}
    capOffset+=cap.sourceVertexIndices.length;
   }
   const capGeometry=new T.BufferGeometry();capGeometry.setAttribute('position',new T.Float32BufferAttribute(capPositions,3));capGeometry.setIndex(capIndices);capGeometry.computeVertexNormals();capGeometry.computeBoundingBox();capGeometry.computeBoundingSphere();
   const capMaterial=material.clone();capMaterial.onBeforeCompile=source.material.onBeforeCompile;capMaterial.customProgramCacheKey=source.material.customProgramCacheKey;
   const capMesh=new T.Mesh(capGeometry,capMaterial);capMesh.name=definitionGroup.id+'-mating-cap';capMesh.visible=false;capMesh.receiveShadow=false;capMesh.userData={...mesh.userData,derivedMatingCap:true,sourceTriangles:0,derivedCapTriangles:capIndices.length/3};mesh.add(capMesh);
   resources.push({geometry:capGeometry,material:capMaterial,sharedAttributes:false});entry.groups.push({definition:definitionGroup,mesh,cap:capMesh,box});
  }
  if(coverage.some(count=>count!==1))throw new Error('Aero partition coverage');entries.push(entry);
 }
 function appearance(target,source){
  const material=target.material;material.copy(source.material);material.onBeforeCompile=source.material.onBeforeCompile;material.customProgramCacheKey=source.material.customProgramCacheKey;material.visible=true;
  target.renderOrder=source.renderOrder;target.castShadow=source.castShadow;target.receiveShadow=source.receiveShadow;target.customDepthMaterial=source.customDepthMaterial;target.customDistanceMaterial=source.customDistanceMaterial;
  target.userData.defocusWeight=source.userData.defocusWeight??0;target.userData.defocus=source.userData.defocus??false;
 }
 // Call after aero-wing-section.update. Rear-wing subdivision begins after the
 // section fades. Front parts start together with the native extraction route.
 function update(focus=[],exploded=0){
  if(disposed)return;
  progress=clamp(exploded);
  for(const entry of entries){
   const {source}=entry;
   const active=source.userData.id==='body-004'?progress>1e-7:progress>.15;
   if(active)source.material.visible=false;
   else if(entry.active&&!source.userData.aeroWingGroups)source.material.visible=entry.originalMaterialVisible;
   for(const group of entry.groups){
    group.mesh.position.copy(aeroExplosionOffset(source.userData.id,group.definition,progress));
    group.mesh.visible=active&&source.visible&&source.material.opacity>.002;
    if(active){appearance(group.mesh,source);appearance(group.cap,source);}
    group.cap.visible=group.mesh.visible&&(source.userData.id==='body-004'||group.mesh.position.lengthSq()>1e-12);
   }
   entry.active=active;
  }
 }
 function framingPoints({progress:at=progress,matrix=null}={}){
  const out=[];
  for(const {source,groups}of entries){const base=explosionPosition(source.userData,clamp(at));for(const group of groups){const offset=aeroExplosionOffset(source.userData.id,group.definition,at).add(base);for(const point of corners(group.box)){point.add(offset);if(matrix)point.applyMatrix4(matrix);out.push(point);}}}
  return out;
 }
 function envelopePoints(matrix=null){
  const out=[];
  for(const {source,groups}of entries)for(const group of groups){
   const item={geometry:group.mesh.geometry,userData:{...source.userData,framingPoints:corners(group.box)}},base=explosionEnvelopePoints([item]),detail=V(...group.definition.displayOffsetM);
   if(source.userData.id==='body-004'&&group.definition.id.includes('lower-flap'))detail.y=Math.sign(detail.y)*.80;
   // Minkowski hull of the audited source path and the bounded secondary
   // translation covers every intermediate progress without spline overshoot.
   const offsets=source.userData.id==='body-004'?[V(),V(0,detail.y,0),V(detail.x,0,detail.z),detail]:[V(),detail];
   for(const point of base)for(const offset of offsets){const at=point.clone().add(offset);if(matrix)at.applyMatrix4(matrix);out.push(at);}
  }
  return out;
 }
 function diagnostics(){return {ready:!!data?.objects.length&&entries.length===data.objects.length,disposed,progress,active:entries.some(entry=>entry.active),sources:entries.length,groups:parts.length,
  originalTriangles:entries.reduce((n,entry)=>n+entry.definition.sourceTriangles,0),derivedCapTriangles:entries.reduce((n,entry)=>n+entry.groups.reduce((a,group)=>a+group.definition.derivedCapTriangles,0),0),
  originalBuffersModified:false,originalTriangleCoverage:'exactly once',sourceKind:'fused native solid shells; display separation at original CAD mating boundaries',
  groupsState:entries.flatMap(entry=>entry.groups.map(group=>({sourceId:entry.source.userData.id,id:group.definition.id,visible:group.mesh.visible,capVisible:group.cap.visible,offset:group.mesh.position.toArray(),originalTriangles:group.definition.sourceTriangles,derivedCapTriangles:group.definition.derivedCapTriangles})))
 };}
 return {parts,update,framingPoints,envelopePoints,diagnostics,
  dispose(){if(disposed)return;disposed=true;for(const {source,originalMaterialVisible}of entries)source.material.visible=originalMaterialVisible;for(const part of parts)part.removeFromParent();for(const {geometry,material,sharedAttributes}of resources){if(sharedAttributes)for(const name of Object.keys(geometry.attributes))geometry.deleteAttribute(name);geometry.dispose();material.dispose();}}
 };
}
