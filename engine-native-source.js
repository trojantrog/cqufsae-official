import * as T from './vendor/three.module.min.js';
import {vehicleMaterial} from './presentation-materials.js?v=742';
import {sampleGeometry} from './camera-framing.js?v=742';
import {explosionLayout} from './explosion-layout.js?v=742';
import {createModelGeometry} from './model-geometry.js?v=749';

// The source buffers remain in native part coordinates. Installation is a
// rigid matrix, shared by the operating pose, exploded view and focus camera.
export function createEngineSourceParts(meta,buffer){
 const parts=[],geometries=new Map();
 try{
  for(const object of meta.objects){
   const data={...object,variant:'c41',sourceVariant:'c41',sourceNative:true,nativeEngine:true};
   if(!Array.isArray(data.installationMatrix)||data.installationMatrix.length!==16||!data.installationMatrix.every(Number.isFinite))throw new Error('Engine installation matrix is missing');
   const key=[data.position.byteOffset,data.position.count,data.normal?.byteOffset,data.index.byteOffset,data.index.count].join('/');
   let geometry=geometries.get(key);
   if(!geometry){
    geometry=createModelGeometry(data,buffer);geometries.set(key,geometry);
   }
   const rest=new T.Matrix4().fromArray(data.installationMatrix),material=vehicleMaterial(data),mesh=new T.Mesh(geometry,material);
   if(data.cadColor&&data.cadColor.toLowerCase()!=='#ffffff')material.color.set(data.cadColor);
   rest.decompose(mesh.position,mesh.quaternion,mesh.scale);mesh.updateMatrix();mesh.castShadow=mesh.receiveShadow=true;
   mesh.userData={...data,nativeRestMatrix:rest.toArray(),baseColor:material.color.clone(),contextColor:material.color.clone().lerp(new T.Color('#85877f'),.58),baseMetal:material.metalness,baseRoughness:material.roughness,
    framingPoints:sampleGeometry(geometry).map(p=>p.applyMatrix4(rest)),explode:new T.Vector3(...(data.explode||[0,0,0])),assemblyOffset:new T.Vector3(...(data.assemblyOffset||data.explode||[0,0,0])),detailOffset:new T.Vector3(...(data.detailOffset||[0,0,0])),selected:false,layout:explosionLayout(data),edge:null};
   parts.push(mesh);
  }
  return parts;
 }catch(error){for(const mesh of parts)mesh.material.dispose();for(const geometry of geometries.values())geometry.dispose();throw error;}
}
