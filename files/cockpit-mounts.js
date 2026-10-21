import * as T from './vendor/three.module.min.js';
import {vehicleMaterial} from './presentation-materials.js?v=742';
import {seatMountData} from './cockpit-seat-mount-data.js?v=761';

// These four native ears have a verified frame datum. The separate seat shell
// and harness eye parts do not yet have a verified installed occurrence pose.
export function createCockpitMounts(){
 const root=new T.Group();root.name='frame-fixed-seat-mounts';
 const material=vehicleMaterial('dark-titanium');material.transparent=true;material.forceSinglePass=true;
 const items=seatMountData.map(d=>{
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(d.positions,3));geometry.setIndex(d.indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new T.Mesh(geometry,material);mesh.name='native-'+d.id;mesh.castShadow=mesh.receiveShadow=true;
  mesh.userData={id:'cockpit-'+d.id,group:'frame',cockpitRole:'seat-mount',sourceDerived:true,presentationOnly:false,attachmentTo:d.frameId,detailOpacity:1,defocusWeight:0};root.add(mesh);return mesh;
 });
 const points=items.flatMap(m=>{const b=m.geometry.boundingBox,p=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])p.push(new T.Vector3(x,y,z));return p;});
 return {root,items,framingPoints:matrix=>points.map(p=>matrix?p.clone().applyMatrix4(matrix):p.clone()),diagnostics:()=>({count:items.length,fixedToFrame:true,installedPose:'Native frame datum; no fitted offsets',seatPoseConfirmed:false,harnessMountPosesConfirmed:false,parts:items.map(m=>({name:m.name,frameId:m.userData.attachmentTo,triangles:m.geometry.index.count/3,bounds:[m.geometry.boundingBox.min.toArray(),m.geometry.boundingBox.max.toArray()]}))}),dispose(){for(const m of items)m.geometry.dispose();material.dispose();root.clear();}};
}
