import * as T from './vendor/three.module.min.js';

const clamp=x=>Math.max(0,Math.min(1,x));
export function createAeroWingSection(sources,{camera=null}={}){
 const source=sources.find(mesh=>mesh.userData.id==='body-005'),data=source?.userData.aeroWingGroups;
 const parts=[],resources=[],inverse=new T.Matrix4(),eye=new T.Vector3();let state={ready:false,weight:0};
 if(data){
  const geometry=source.geometry;
  if(data.sourceVertices!==geometry.attributes.position.count||data.sourceIndices!==geometry.index.count)throw new Error('Rear-wing source geometry mismatch');
  for(const [name,group] of Object.entries(data.groups)){
   const partGeometry=new T.BufferGeometry();
   for(const [name,attribute] of Object.entries(geometry.attributes))partGeometry.setAttribute(name,attribute);
   partGeometry.setIndex(new T.BufferAttribute(new Uint32Array(group.indices),1));partGeometry.computeBoundingBox();partGeometry.computeBoundingSphere();
   const material=source.material.clone();material.onBeforeCompile=source.material.onBeforeCompile;material.customProgramCacheKey=source.material.customProgramCacheKey;
   const mesh=new T.Mesh(partGeometry,material);mesh.name='rear-wing-'+name;mesh.visible=false;mesh.receiveShadow=false;
   mesh.userData={aeroSection:true,partCounted:false,side:group.side,defocusWeight:0};source.add(mesh);parts.push(mesh);resources.push({geometry:partGeometry,material});
  }
  state.ready=true;
 }
 function update(focus=[],exploded=0){
  if(!source||!data)return;
  const weight=clamp(focus.reduce((n,r)=>n+(r.department==='structure'&&r.mode!=='frame'?r.weight:0),0))*clamp(1-exploded/.15);
  source.updateWorldMatrix(true,false);inverse.copy(source.matrixWorld).invert();
  if(camera)camera.getWorldPosition(eye).applyMatrix4(inverse);else eye.set(0,7,3.8);
  const nearPositive=.5+.5*Math.tanh(eye.y/.18),sourceAlpha=source.material.opacity,active=weight>1e-7;
  source.material.visible=!active;
  for(const mesh of parts){
   const near=mesh.userData.side===1?nearPositive:mesh.userData.side===-1?1-nearPositive:0;
   const alpha=sourceAlpha*(1-weight*near*.84),material=mesh.material;
   material.color.copy(source.material.color);material.metalness=source.material.metalness;material.roughness=source.material.roughness;material.clearcoat=source.material.clearcoat;
   material.emissive.copy(source.material.emissive);material.emissiveIntensity=source.material.emissiveIntensity;
   material.transparent=true;material.opacity=alpha;material.depthWrite=alpha>.9999;material.depthTest=true;material.visible=true;
   mesh.renderOrder=near>.5?30:10;
   mesh.visible=active&&source.visible&&alpha>.002;mesh.castShadow=alpha>.9999;mesh.userData.defocusWeight=source.userData.defocusWeight??0;
  }
  state={ready:true,weight,nearSide:nearPositive>=.5?'positiveY':'negativeY',nearPanelOpacity:sourceAlpha*(1-weight*.84),opaqueCoreTriangles:data.groups.core.triangles,sourceGeometryModified:false};
 }
 return {parts,update,diagnostics:()=>({...state}),dispose(){if(source)source.material.visible=true;for(const part of parts)part.removeFromParent();for(const {geometry,material} of resources){for(const name of Object.keys(geometry.attributes))geometry.deleteAttribute(name);geometry.dispose();material.dispose();}}};
}
