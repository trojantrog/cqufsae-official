import * as T from './vendor/three.module.min.js';
import {vehicleMaterial} from './presentation-materials.js?v=743';
import {bottleSourceObjects,bottleSourceArrays} from './bottle-source-data.js?v=761';

export function createBottleSource(sources){
 const root=new T.Group(),items=[],resources=new Set(),source=sources.find(m=>m.userData.id==='engine-030'),sourceWasVisible=source?.visible;
 root.name='overflow-bottle';root.visible=false;
 const replaced=new Set(source?.userData.replacesBottleSourceIds||[]),transforms=new Map((source?.userData.bottleSourceTransforms||[]).map(item=>[item.id,item.matrix]));
 // Both native parts retain their separately measured installation matrices
 // in their vertices. The cooling pair withdraws as one rigid display assembly.
 // engine-030 is the already loaded second body of the first native bottle.
 for(const object of bottleSourceObjects){
  if(replaced.has(object.id))continue;
  const arrays=bottleSourceArrays(object),geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(arrays.position,3));geometry.setAttribute('normal',new T.BufferAttribute(arrays.normal,3));geometry.setIndex(new T.BufferAttribute(arrays.index,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=vehicleMaterial('bright-alloy');material.color.setHex(0x969b9d);material.roughness=.43;material.metalness=.72;material.clearcoat=.12;material.transparent=true;material.forceSinglePass=true;
  const mesh=new T.Mesh(geometry,material);mesh.name=object.id;mesh.castShadow=mesh.receiveShadow=true;mesh.userData={id:object.id,group:'engine',mechanism:'mo-cooling',completionSourceId:object.completionSourceId,sourceInstance:object.sourceInstance,defocusWeight:0};
  if(transforms.has(object.id))new T.Matrix4().fromArray(transforms.get(object.id)).decompose(mesh.position,mesh.quaternion,mesh.scale);
  root.add(mesh);items.push(mesh);resources.add(geometry);resources.add(material);
 }
 let state={};
 function update(){
  const alpha=source?.material.opacity??0;
  if(source){root.position.copy(source.position);root.quaternion.copy(source.quaternion);root.scale.copy(source.scale);}
  root.visible=alpha>.002;
  for(const mesh of items){mesh.material.opacity=alpha;mesh.material.depthWrite=alpha>.9999;mesh.visible=alpha>.002;mesh.castShadow=alpha>.08;mesh.userData.defocusWeight=source?.userData.defocusWeight??0;}
  // The new data includes the exact pipe already present as engine-030. Keep
  // its original geometry and kinematics, and draw its complete source once.
  if(source)source.visible=false;
  state={bottleAttachedTo:source?.userData.id,bottleSourceInstances:2,bottleSourceMeshes:items.length,bottleSourceRepresentation:'original-cad-surfaces',bottleOriginalBodySuppressed:source?.userData.id,bottleDisplayOffset:[0,0,0],replacedSourceBodies:[...replaced],updatedSourcePlacements:[...transforms.keys()]};
 }
 return {root,items,update,diagnostics:()=>state,dispose(){if(source)source.visible=sourceWasVisible;resources.forEach(r=>r.dispose());root.clear();}};
}
