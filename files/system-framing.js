import * as T from './vendor/three.module.min.js';
import {fitPoints} from './camera-framing.js?v=751.2';

// Fit once in the installed assembly frame. Following the two camera anchors
// costs O(1) each display frame and never follows the silhouette of a spinning
// chain link, shaft, piston, or wheel.
export function createSystemFraming(rig){
 const anchors=new Map(),up=new T.Vector3(0,0,1);
 function frame(request,camera,direction,subject='system'){
  const padding=camera.userData.recruitmentFraming?{x:camera.userData.annotationPaddingX,y:camera.userData.annotationPaddingY}:{x:request.mode===request.department&&camera.userData.annotationPaddingX|| (request.mode==='engine'?.91:.94),y:request.mode===request.department?.86:.88};
  const key=[request.department,request.mode,request.variant,subject,rig.meshes.length,camera.aspect,camera.fov,camera.near,padding.x,padding.y,...direction.toArray()].join('/');
  let local=anchors.get(key);
  if(!local){
   const points=rig.localFramingPoints(request,subject);
   if(!points?.length)return null;
   local=fitPoints(points,{fov:camera.fov,aspect:camera.aspect,near:camera.near,up},direction,padding);
   anchors.set(key,local);
  }
  rig.assembly.updateWorldMatrix(true,false);
  return {position:local.position.clone().applyMatrix4(rig.assembly.matrixWorld),target:local.target.clone().applyMatrix4(rig.assembly.matrixWorld),up:up.clone().transformDirection(rig.assembly.matrixWorld),zoom:1};
 }
 return {frame,clear:()=>anchors.clear(),diagnostics:()=>({cachedAnchors:anchors.size})};
}
