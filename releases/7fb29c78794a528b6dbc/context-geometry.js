import {sha256} from './asset-checksum-767.js';
import {assetLoader,loadJSON,loadBinary} from './resource-loader-776.js';
import * as T from './vendor/three.module.min.js';
import {modelArray} from './model-geometry.js?v=749';

// Only the renderer borrows these index buffers. Native positions, normals,
// kinematic registration, picking and framing always retain the source mesh.
export function createContextGeometry({enabled=true,maxPixelError=.75,solidPixelError=.15}={}){
 let epoch=0,status='idle',candidates=new WeakMap(),owned=new Set(),last={meshes:0,trianglesSaved:0,maxProjectedError:0};
 const centre=new T.Vector3(),viewProjection=new T.Matrix4(),frustum=new T.Frustum();
 const digest=buffer=>assetLoader.verifiedHash(buffer)||sha256(buffer);
 function clear(){
  epoch++;candidates=new WeakMap();status='idle';
  // Attribute buffers belong to the native geometry. Dispose only the LOD's
  // index/VAO resources, leaving shared attribute buffers owned by the source.
  for(const geometry of owned){for(const name of Object.keys(geometry.attributes))geometry.deleteAttribute(name);geometry.dispose();}
  owned.clear();last={meshes:0,trianglesSaved:0,maxProjectedError:0};
 }
 function register(meshes,manifest,buffer,excludedIds=new Set()){
  const byId=new Map(meshes.map(m=>[m.userData.id,m]));
  if(manifest.schemaVersion!==1||manifest.kind!=='context-only-index-lod'||buffer.byteLength!==manifest.binaryBytes)throw new Error('Context geometry format');
  for(const part of manifest.objects){
   if(!part.reduced)continue;
   if(excludedIds.has(part.id))continue;
   const mesh=byId.get(part.id),source=mesh?.geometry;
   if(!source||source.attributes.position.count!==part.originalVertices||source.index?.count!==part.originalIndices)throw new Error('Context geometry source mismatch');
   const indexBytes=part.componentType===5123?2:4;
   if(!Number.isInteger(part.byteOffset)||part.byteOffset<0||part.byteOffset%4||!Number.isInteger(part.indices)||part.indices<3||part.indices%3||part.byteLength!==part.indices*indexBytes||part.byteOffset+part.byteLength>buffer.byteLength||!Number.isFinite(part.errorMetres)||part.errorMetres<0||part.errorMetres>.000301)throw new Error('Context geometry bounds');
   const index=modelArray(buffer,{byteOffset:part.byteOffset,count:part.indices,itemSize:1,componentType:part.componentType??5125},5125);
   for(const value of index)if(value>=part.originalVertices)throw new Error('Context geometry index');
   const geometry=new T.BufferGeometry();for(const [name,attribute]of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
   geometry.setIndex(new T.BufferAttribute(index,1));geometry.boundingBox=source.boundingBox?.clone()||null;geometry.boundingSphere=source.boundingSphere?.clone()||null;
   candidates.set(source,{geometry,error:Math.max(.00001,part.errorMetres)*4});owned.add(geometry);
  }
  status='ready';
 }
 async function load(meshes,{metadataBuffer,buffer,excludedIds=new Set()}){
  clear();const current=epoch;status='loading';
  try{
   const url=new URL('./assets/exploded/c41-context-749.json',import.meta.url),manifest=await loadJSON(url);
   if(!/^c41-context-\d+\.bin$/.test(manifest.binary))throw new Error('Context geometry path');
   const [metadataHash,binaryHash,derived]=await Promise.all([digest(metadataBuffer),digest(buffer),loadBinary(new URL(manifest.binary,url))]);
   if(metadataHash!==manifest.sourceHashes.metadata||binaryHash!==manifest.sourceHashes.binary||await digest(derived)!==manifest.binarySHA256)throw new Error('Context geometry hash');
   if(current!==epoch)return false;
   register(meshes,manifest,derived,excludedIds);return true;
  }catch(error){if(current===epoch){clear();status='unavailable';}return false;}
 }
 function render(scene,camera,draw,{strength=0,pixelHeight=1}={}){
  last={meshes:0,trianglesSaved:0,maxProjectedError:0};
  if(!enabled||status!=='ready'||!camera.isPerspectiveCamera||!Number.isFinite(pixelHeight)||pixelHeight<=0||!Number.isFinite(maxPixelError)||maxPixelError<=0||!Number.isFinite(solidPixelError)||solidPixelError<=0)return draw();
  scene.updateMatrixWorld();camera.updateMatrixWorld();viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(viewProjection);
  const focal=pixelHeight*camera.zoom/(2*Math.tan(T.MathUtils.degToRad(camera.fov)/2)),restore=[];
  try{
   scene.traverseVisible(mesh=>{
    const item=candidates.get(mesh.geometry),material=mesh.material;
    if(!item||!mesh.isMesh||mesh.isSkinnedMesh||mesh.isInstancedMesh||Array.isArray(material)||!material||mesh.frustumCulled&&!frustum.intersectsObject(mesh))return;
    // Selected solids have a much tighter subpixel limit. Keep exact source
    // vertices, normals, UVs and shader deformation; only borrow fewer indices
    // where even the conservative fourfold geometric error stays invisible.
    const ghost=strength>=.99&&material.opacity<.12&&(mesh.userData.defocusWeight??0)>=.999;
    const pixelLimit=ghost?maxPixelError:Math.min(solidPixelError,maxPixelError);
    const source=mesh.geometry;if(!source.boundingSphere)source.computeBoundingSphere();
    const scale=mesh.matrixWorld.getMaxScaleOnAxis(),sphere=source.boundingSphere;
    centre.copy(sphere.center).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    const nearDepth=-centre.z-sphere.radius*scale;if(nearDepth<=camera.near)return;
    const error=item.error*scale*focal/nearDepth;if(!Number.isFinite(error)||error>pixelLimit)return;
    restore.push([mesh,source]);mesh.geometry=item.geometry;last.meshes++;last.trianglesSaved+=(source.index.count-item.geometry.index.count)/3;last.maxProjectedError=Math.max(last.maxProjectedError,error);
   });
   return draw();
  }finally{for(const [mesh,geometry]of restore)mesh.geometry=geometry;}
 }
 return {load,register,render,clear,dispose:clear,diagnostics:()=>({enabled,status,available:owned.size,...last})};
}
