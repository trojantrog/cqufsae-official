import * as T from './vendor/three.module.min.js';
import {ANNOTATION_CATALOG} from './recruitment-content-770.js?v=773';

// Part-local anchors handle assembly-space CAD and installed Blender geometry.
export function createSystemAnnotations({meshes,assembly,getAutonomous=()=>[]}){
 const bindings=new Map();let revision=-1;const point=new T.Vector3();
 function resolve(card){
  const autonomous=getAutonomous(),count=meshes.length+autonomous.length;
  if(count!==revision){revision=count;bindings.clear();}
  if(bindings.has(card.key))return bindings.get(card.key);
  const sources=[...meshes,...autonomous];
  const query=card.anchor||{};
  let mesh=(query.ids||[]).map(id=>sources.find(m=>m.userData.id===id||m.userData.sourceId===id)).find(Boolean);
  mesh??=sources.find(m=>(query.roles||[]).includes(m.userData.role));
  mesh??=sources.find(m=>(query.mechanisms||[]).includes(m.userData.mechanism));
  let local=null;
  if(mesh){if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();local=mesh.geometry.boundingBox.getCenter(new T.Vector3());}
  const binding={mesh,local,fallback:query.point?new T.Vector3(...query.point):null};bindings.set(card.key,binding);return binding;
 }
 function labels(request){
  if(request.mode!==request.department)return [];
  const theme=request.variant==='e74'&&request.mode==='power'?'e74-power':request.mode;
  return (ANNOTATION_CATALOG[theme]||ANNOTATION_CATALOG[request.department]||[]).flatMap(card=>{
   if(card.unlinked)return [{...card,id:card.key,text:card.title,point:new T.Vector3(),viewKey:theme}];
   const binding=resolve(card);
   if(binding.mesh){binding.mesh.updateWorldMatrix(true,false);point.copy(binding.local).applyMatrix4(binding.mesh.matrixWorld);}
   else if(binding.fallback)point.copy(binding.fallback).applyMatrix4(assembly.matrixWorld);else return [];
   return [{...card,id:card.key,text:card.title,point:point.clone(),anchorSource:binding.mesh?.userData.id||null,viewKey:theme}];
  });
 }
 return {labels,diagnostics:()=>({bindings:bindings.size,unresolved:[...bindings].filter(([,b])=>!b.mesh).map(([id])=>id)}),clear:()=>bindings.clear()};
}
