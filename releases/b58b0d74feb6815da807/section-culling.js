import * as T from './vendor/three.module.min.js';

// Register only native meshes whose position buffers and vertex/shadow hooks
// have been checked to remain rigid. Registration captures that verified path;
// changed hooks or position buffers keep the original draw until re-registered.
// Wrap the complete synchronous color + mask draw. Only leaf visibility is
// borrowed, with restoration in finally; source geometry/materials stay intact.
export function createSectionCulling(renderer,{enabled=true,epsilonMetres=.00001}={}){
 let records=new Map(),bounds=new WeakMap(),active=false,last={tested:0,culledMeshes:0,trianglesSaved:0,callsSaved:0};
 const centre=new T.Vector3(),half=new T.Vector3(),worldCentre=new T.Vector3();
 const finite=v=>Number.isFinite(v),defaultHook=T.Object3D.prototype;
 function fixedGeometry(mesh){
  const g=mesh.geometry,p=g?.attributes.position;
  return mesh.isMesh&&!mesh.isSkinnedMesh&&!mesh.isInstancedMesh&&!mesh.isBatchedMesh&&
   g?.isBufferGeometry&&!g.isInstancedBufferGeometry&&p?.isBufferAttribute&&!p.isInterleavedBufferAttribute&&
   !p.isGLBufferAttribute&&p.itemSize===3&&!p.normalized&&p.usage===T.StaticDrawUsage&&p.count>0&&
   (p.array instanceof Float32Array||p.array instanceof Float64Array)&&!mesh.skeleton&&!mesh.morphTexture&&
   !Object.values(g.morphAttributes||{}).some(a=>a.length)&&!(mesh.morphTargetInfluences?.length);
 }
 function ordinaryMaterial(m){
  return m?.isMaterial&&!Array.isArray(m)&&!m.isShaderMaterial&&!m.isRawShaderMaterial&&
   !m.displacementMap&&!m.alphaToCoverage&&!m.wireframe;
 }
 function ordinaryShadow(m){return !m||((m.isMeshDepthMaterial||m.isMeshDistanceMaterial)&&ordinaryMaterial(m));}
 function leafHooks(mesh){return !mesh.children.length&&mesh.onBeforeRender===defaultHook.onBeforeRender&&
  mesh.onAfterRender===defaultHook.onAfterRender&&mesh.onBeforeShadow===defaultHook.onBeforeShadow&&mesh.onAfterShadow===defaultHook.onAfterShadow;}
 function registerStatic(meshes){
  records=new Map();last={tested:0,culledMeshes:0,trianglesSaved:0,callsSaved:0};
  for(const mesh of meshes||[]){
   if(!mesh||records.has(mesh)||!fixedGeometry(mesh)||!ordinaryMaterial(mesh.material)||!leafHooks(mesh)||
    !ordinaryShadow(mesh.customDepthMaterial)||!ordinaryShadow(mesh.customDistanceMaterial))continue;
   const g=mesh.geometry,p=g.attributes.position;let box=bounds.get(p);
   if(!box||box.version!==p.version||box.array!==p.array||box.count!==p.count){
    const ownBox=new T.Box3().setFromBufferAttribute(p);if(ownBox.isEmpty()||!ownBox.min.toArray().every(finite)||!ownBox.max.toArray().every(finite))continue;
    box={min:ownBox.min.clone(),max:ownBox.max.clone(),version:p.version,array:p.array,count:p.count};bounds.set(p,box);
   }
   const material=mesh.material,depth=mesh.customDepthMaterial,distance=mesh.customDistanceMaterial;
   records.set(mesh,{geometry:g,position:p,box,material,vertexHook:material.onBeforeCompile,materialHook:material.onBeforeRender,
    depth,depthHook:depth?.onBeforeCompile,depthRender:depth?.onBeforeRender,distance,distanceHook:distance?.onBeforeCompile,distanceRender:distance?.onBeforeRender});
  }
  return records.size;
 }
 function unchanged(mesh,r){
  const p=mesh.geometry?.attributes.position,m=mesh.material,d=mesh.customDepthMaterial,s=mesh.customDistanceMaterial;
  return fixedGeometry(mesh)&&leafHooks(mesh)&&mesh.geometry===r.geometry&&p===r.position&&
   p.version===r.box.version&&p.array===r.box.array&&p.count===r.box.count&&m===r.material&&ordinaryMaterial(m)&&
   m.onBeforeCompile===r.vertexHook&&m.onBeforeRender===r.materialHook&&d===r.depth&&ordinaryShadow(d)&&
   d?.onBeforeCompile===r.depthHook&&d?.onBeforeRender===r.depthRender&&s===r.distance&&ordinaryShadow(s)&&
   s?.onBeforeCompile===r.distanceHook&&s?.onBeforeRender===r.distanceRender;
 }
 function visibleInScene(mesh,scene){for(let o=mesh;o;o=o.parent){if(!o.visible)return false;if(o===scene)return true;}return false;}
 function outside(mesh,r,planes,camera){
  const e=mesh.matrixWorld.elements;
  if(e.length!==16||!e.every(finite)||e[3]!==0||e[7]!==0||e[11]!==0||e[15]!==1)return false;
  centre.copy(r.box.min).add(r.box.max).multiplyScalar(.5);half.copy(r.box.max).sub(r.box.min).multiplyScalar(.5);worldCentre.copy(centre).applyMatrix4(mesh.matrixWorld);
  let all=true,any=false;
  for(const plane of planes){
   const n=plane?.normal,c=plane?.constant;if(!plane?.isPlane||!n||![n.x,n.y,n.z,c].every(finite))return false;
   const length=Math.hypot(n.x,n.y,n.z);if(length<1e-12||Math.abs(length-1)>1e-6)return false;
   const projectedHalf=Math.abs(n.x*e[0]+n.y*e[1]+n.z*e[2])*half.x+
    Math.abs(n.x*e[4]+n.y*e[5]+n.z*e[6])*half.y+Math.abs(n.x*e[8]+n.y*e[9]+n.z*e[10])*half.z;
   const maximum=(n.dot(worldCentre)+c+projectedHalf)/length;
   // Leave room for GPU float32 transforms and the view-space plane uniform.
   // This deliberately preserves coplanar, crossing and very distant cases.
   const magnitude=Math.abs(worldCentre.x)+Math.abs(worldCentre.y)+Math.abs(worldCentre.z)+
    projectedHalf/length+Math.abs(c)/length+Math.abs(camera.matrixWorld.elements[12])+Math.abs(camera.matrixWorld.elements[13])+Math.abs(camera.matrixWorld.elements[14])+1;
   const margin=Math.max(epsilonMetres,64*2**-23*magnitude);
   if(!finite(maximum)||!finite(margin))return false;
   const clipped=maximum< -margin;all&&=clipped;any||=clipped;
  }
  return mesh.material.clipIntersection?all:any;
 }
 function render(scene,camera,draw){
  if(active)return draw();last={tested:0,culledMeshes:0,trianglesSaved:0,callsSaved:0};
  if(!enabled||!finite(epsilonMetres)||epsilonMetres<=0||renderer.localClippingEnabled!==true||
   !scene?.isScene||scene.overrideMaterial||!camera?.isCamera||camera.isArrayCamera||
   scene.onBeforeRender!==defaultHook.onBeforeRender||scene.onAfterRender!==defaultHook.onAfterRender)return draw();
  let section=false;for(const mesh of records.keys())if(mesh.visible&&mesh.material?.visible&&Array.isArray(mesh.material.clippingPlanes)&&mesh.material.clippingPlanes.length){section=true;break;}
  if(!section)return draw();
  if(scene.matrixWorldAutoUpdate===true)scene.updateMatrixWorld();
  if(camera.parent===null&&camera.matrixWorldAutoUpdate===true)camera.updateMatrixWorld();
  if(!camera.matrixWorld.elements.every(finite))return draw();
  const restore=[];active=true;
  try{
   for(const [mesh,r]of records){
    const m=mesh.material,planes=m?.clippingPlanes;
    if(!visibleInScene(mesh,scene)||!m?.visible||!Array.isArray(planes)||!planes.length||!mesh.layers.test(camera.layers)||!unchanged(mesh,r))continue;
    // WebGLShadowMap includes VSM receivers as well as explicit casters. Its
    // depth/distance material copies clipShadows from the visible material.
    // A false flag preserves the complete original shadow even on a quiet pass.
    const shadowParticipant=mesh.castShadow||(renderer.shadowMap?.type===T.VSMShadowMap&&mesh.receiveShadow);
    if(shadowParticipant&&m.clipShadows!==true)continue;
    last.tested++;if(!outside(mesh,r,planes,camera))continue;
    const total=mesh.geometry.index?.count??mesh.geometry.attributes.position.count,range=mesh.geometry.drawRange;
    const drawCount=Math.max(0,Math.min(total,range.start+range.count)-Math.max(0,range.start));if(!finite(drawCount)||drawCount<=0)continue;
    restore.push([mesh,mesh.visible]);mesh.visible=false;last.culledMeshes++;
    const repeat=m.transparent&&m.side===T.DoubleSide&&!m.forceSinglePass?2:1;
    last.callsSaved+=repeat;last.trianglesSaved+=repeat*drawCount/3;
   }
   return draw();
  }finally{for(const [mesh,visible]of restore)mesh.visible=visible;active=false;}
 }
 function clear(){records=new Map();bounds=new WeakMap();last={tested:0,culledMeshes:0,trianglesSaved:0,callsSaved:0};}
 return {registerStatic,render,clear,dispose:clear,diagnostics:()=>({enabled,registered:records.size,...last})};
}
