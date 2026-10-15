import * as T from './vendor/three.module.min.js';
import {vehicleMaterial} from './presentation-materials.js?v=743';
import {c125SourceObjects,c125SourceArrays} from './c125-source-data.js?v=743';

const clamp=x=>T.MathUtils.clamp(x,0,1),smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const whole={department:'all',mode:'all',variant:'c41',weight:1};

export function createInstrumentCluster(sources){
 const root=new T.Group(),items=[],resources=new Set(),roots={c41:new T.Group(),a08:new T.Group()},datum=sources.find(m=>m.userData.id==='frame-029');
 root.name='native-instrument-cluster';roots.c41.name='c41-native-instrument';roots.a08.name='a08-native-instrument';root.add(roots.c41,roots.a08);
 for(const object of c125SourceObjects){
  const arrays=c125SourceArrays(object),geometry=new T.BufferGeometry();
  for(const key of ['position','normal','color'])geometry.setAttribute(key,new T.BufferAttribute(arrays[key],3));
  geometry.setIndex(new T.BufferAttribute(arrays.index,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=vehicleMaterial(object.role==='display'?'dark-titanium':'bright-alloy');material.color.setHex(0xffffff);material.vertexColors=true;material.metalness=object.role==='display'?.25:.75;material.roughness=.45;material.transparent=true;material.forceSinglePass=true;
  const mesh=new T.Mesh(geometry,material);mesh.name=object.id;mesh.castShadow=mesh.receiveShadow=true;
  mesh.userData={id:object.id,group:'instrument',mechanism:'el-dashboard',variant:object.variant,instrumentRole:object.role,defocusWeight:0};
  roots[object.variant].add(mesh);items.push(mesh);resources.add(geometry);resources.add(material);
 }
 let state={};
 function target(request){
  if(request.variant==='e74'||request.department==='driverless'||request.department==='operations')return 0;
  if(request.mode==='all'||request.department==='structure'||request.department==='chassis'&&['chassis','steering'].includes(request.mode))return 1;
  return .027;
 }
 function update(motion={},focus=[whole],exploded=0){
  // Panal_ASM is fixed in the original assembly. The welded frame remains the
  // same reference throughout the existing explosion route; no removal axis
  // or direction of steering rotation is inferred for the dashboard.
  if(datum){root.position.copy(datum.position);root.quaternion.copy(datum.quaternion);root.scale.copy(datum.scale);}
  const assemblyAlpha=motion.variants?.assemblyAlpha??motion.assemblyAlpha??1;
  const av=clamp(focus.reduce((n,r)=>n+(r.department==='driverless'?r.weight:0),0));
  const avSharp=av>1e-10?clamp(focus.reduce((n,r)=>n+(r.department==='driverless'&&r.mode!=='algorithm'?r.weight:0),0)/av):0;
  const c41Alpha=clamp(focus.reduce((n,r)=>n+target(r)*r.weight,0))*assemblyAlpha*(1-smooth(av/.88)),a08Alpha=smooth(av)*(.028+.972*avSharp)*assemblyAlpha;
  const c41Sharp=clamp(focus.reduce((n,r)=>n+(target(r)===1?r.weight:0),0));
  for(const mesh of items){const alpha=mesh.userData.variant==='a08'?a08Alpha:c41Alpha,sharp=mesh.userData.variant==='a08'?avSharp:c41Sharp;mesh.material.opacity=alpha;mesh.material.depthWrite=alpha>.9999;mesh.visible=alpha>.002;mesh.castShadow=alpha>.08;mesh.userData.defocusWeight=1-sharp;}
  roots.c41.visible=c41Alpha>.002;roots.a08.visible=a08Alpha>.002;root.visible=roots.c41.visible||roots.a08.visible;
  root.updateMatrixWorld(true);state={sourceInstances:4,sourceSolids:items.length,c41Opacity:c41Alpha,a08Opacity:a08Alpha,frameDatum:datum?.userData.id||'shared-assembly-datum',presentation:'fixed-original-installation',screenPresentation:'source-surface',exploded:clamp(exploded)};
 }
 function framingPoints(request=whole,assemblyMatrix=null){
  if(request.department==='operations'||request.variant==='e74')return [];
  const autonomous=request.department==='driverless';
  if(autonomous?request.mode==='algorithm':target(request)!==1)return [];
  const variant=autonomous?'a08':'c41',matrix=(assemblyMatrix||new T.Matrix4()).clone();root.updateMatrix();matrix.multiply(root.matrix);const points=[];
  for(const mesh of items){if(mesh.userData.variant!==variant)continue;const b=mesh.geometry.boundingBox;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(new T.Vector3(x,y,z).applyMatrix4(matrix));}
  return points;
 }
 update();
 return {root,items,update,diagnostics:()=>({...state}),framingPoints,explosionFramingPoints:matrix=>framingPoints(whole,matrix),dispose(){resources.forEach(r=>r.dispose());root.clear();}};
}
