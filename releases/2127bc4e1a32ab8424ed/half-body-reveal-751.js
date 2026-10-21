import * as T from './vendor/three.module.min.js';

const clamp=x=>T.MathUtils.clamp(Number.isFinite(x)?x:0,0,1);
const smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const materialList=material=>Array.isArray(material)?material:[material];
const isShell=mesh=>mesh?.isMesh&&mesh.geometry?.attributes.position&&
 mesh.userData.group==='body'&&!['e74','a08'].includes(mesh.userData.variant)&&
 (mesh.userData.mechanism==='fr-body'||mesh.userData.id==='body-006');

// The near shell and floor are clipped in the installed assembly datum.
// No source vertices, indices, visible flags, or livery coordinates are edited.
// Three's standard clipping path is also copied by the system-focus mask pass.
export function createHalfBodyReveal(sources=[],{camera=null,assembly=null}={}){
 const parts=sources.filter(isShell),entries=[],bounds=new T.Box3(),inverse=new T.Matrix4(),relative=new T.Matrix4();
 const localPlane=new T.Plane(),worldPlane=new T.Plane(),cameraLocal=new T.Vector3();
 let disposed=false,lastSide=1,state={active:false,amount:0,side:1,geometryModified:false,extraDrawCalls:0};
 assembly?.updateWorldMatrix(true,true);if(assembly)inverse.copy(assembly.matrixWorld).invert();
 for(const mesh of parts){
  mesh.geometry.computeBoundingBox();mesh.updateWorldMatrix(true,false);
  relative.copy(mesh.matrixWorld);if(assembly)relative.premultiply(inverse);
  bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(relative));
  const original=mesh.material,materials=materialList(original).map(material=>{
   const clone=material.clone();clone.onBeforeCompile=material.onBeforeCompile;clone.customProgramCacheKey=material.customProgramCacheKey;
   return {clone,basePlanes:clone.clippingPlanes,baseClipShadows:clone.clipShadows,planes:[...(clone.clippingPlanes||[]),worldPlane]};
  });
  mesh.material=Array.isArray(original)?materials.map(entry=>entry.clone):materials[0].clone;
  entries.push({mesh,original,materials,active:false});
 }
 const centre=bounds.isEmpty()?new T.Vector3():bounds.getCenter(new T.Vector3()),centreY=centre.y,sourceIds=parts.map(mesh=>mesh.userData.id);
 function apply(active){
  for(const entry of entries){
   if(entry.active===active)continue;
   for(const material of entry.materials){
    material.clone.clippingPlanes=active?material.planes:material.basePlanes;
    material.clone.clipShadows=active?true:material.baseClipShadows;
    material.clone.needsUpdate=true;
   }
   entry.active=active;
  }
 }
 function update(focus=[],exploded=0){
  if(disposed)return diagnostics();
  const weight=clamp(focus.reduce((sum,request)=>sum+(request.department==='structure'&&request.mode!=='body'&&!['e74','a08'].includes(request.variant)?request.weight:0),0));
  let amount=smooth(weight)*(1-smooth(exploded/.10)),side=lastSide;
  if(camera&&assembly&&!bounds.isEmpty()){
   assembly.updateWorldMatrix(true,false);inverse.copy(assembly.matrixWorld).invert();
   camera.getWorldPosition(cameraLocal).applyMatrix4(inverse);
   const lateral=cameraLocal.y-centreY,horizontal=Math.hypot(cameraLocal.x-centre.x,lateral);
   // Restore through a narrow front/rear corridor before exchanging sides.
   // Orbiting across the centreline therefore does not swap two half shells.
   amount*=smooth(Math.abs(lateral)/Math.max(.001,horizontal*.14));
   if(Math.abs(lateral)>1e-6)side=Math.sign(lateral);
   lastSide=side;
   const outer=side>0?bounds.max.y+.02:bounds.min.y-.02;
   const cutY=T.MathUtils.lerp(outer,centreY,amount);
   localPlane.normal.set(0,-side,0);localPlane.constant=side*cutY;
   worldPlane.copy(localPlane).applyMatrix4(assembly.matrixWorld);
   apply(amount>1e-7);
   state={...state,active:amount>1e-7,amount,side,cutY};
  }else{amount=0;apply(false);state={...state,active:false,amount:0};}
  return diagnostics();
 }
 function diagnostics(){return {...state,ready:!!camera&&!!assembly&&parts.length>0&&!disposed,sourceIds:[...sourceIds],plane:[...worldPlane.normal.toArray(),worldPlane.constant],centreY};}
 return {update,diagnostics,items:parts,
  dispose(){if(disposed)return;disposed=true;apply(false);for(const {mesh,original,materials}of entries){const clones=materials.map(entry=>entry.clone);if(materialList(mesh.material).every(material=>clones.includes(material)))mesh.material=original;clones.forEach(material=>material.dispose());}state.active=false;state.amount=0;}
 };
}
