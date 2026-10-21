import * as T from './vendor/three.module.min.js';
import {vehicleMaterial} from './presentation-materials.js?v=743';
import {c125SourceObjects,c125SourceArrays} from './c125-source-data.js?v=761';

const clamp=x=>T.MathUtils.clamp(x,0,1),smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const whole={department:'all',mode:'all',variant:'c41',weight:1};
// Saved Panal.CATPart installation, with native coordinates expressed in metres.
const panelFrame=new T.Matrix4().set(-.9193514336800616,1.623485214786305e-15,.3934373411236106,.2617166948265819,2.7018896327063476e-15,-1.0000000000000013,9.921416661615104e-15,.008000015611115414,.3934373411236107,1.0672894798100609e-14,.9193514336800618,.5910788270503743,0,0,0,1);
const controlHoles=[
 {id:'c41-panel-control-751-01',y:.068,z:-.050,radius:.011,faces:[20,21]},
 {id:'c41-panel-control-751-02',y:.102,z:-.050,radius:.00825,faces:[24,25]},
 {id:'c41-panel-control-751-03',y:.10225,z:-.022,radius:.008,faces:[22,23]},
 {id:'c41-panel-control-751-04',y:.071,z:-.0201503768868,radius:.008,faces:[34,35]}
];

export function createInstrumentCluster(sources){
 const root=new T.Group(),items=[],resources=new Set(),roots={c41:new T.Group(),a08:new T.Group()},datum=sources.find(m=>m.userData.id==='frame-029'),controls=[];
 root.name='native-instrument-cluster';roots.c41.name='c41-native-instrument';roots.a08.name='a08-native-instrument';root.add(roots.c41,roots.a08);
 for(const object of c125SourceObjects){
  const arrays=c125SourceArrays(object),geometry=new T.BufferGeometry();
  for(const key of ['position','normal','color'])geometry.setAttribute(key,new T.BufferAttribute(arrays[key],3));
  geometry.setIndex(new T.BufferAttribute(arrays.index,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=vehicleMaterial(object.role==='display'?'dark-titanium':'bright-alloy');material.color.setHex(0xffffff);material.vertexColors=true;material.metalness=object.role==='display'?.25:.75;material.roughness=.45;material.transparent=true;material.forceSinglePass=true;
  const mesh=new T.Mesh(geometry,material);mesh.name=object.id;mesh.castShadow=mesh.receiveShadow=true;
  mesh.userData={id:object.id,group:object.variant==='c41'?'engine':'instrument',mechanism:'el-dashboard',variant:object.variant,instrumentRole:object.role,nativeInstrument:true,defocusWeight:0};
  roots[object.variant].add(mesh);items.push(mesh);resources.add(geometry);resources.add(material);
 }
 // Four panel control cutouts exist in the source plate. No matching control
 // solids exist in Panal_ASM. These display bodies occupy those actual holes;
 // their actuator shape and two terminal tabs are illustrative, not OEM CAD.
 const caseMaterial=vehicleMaterial('soft-black'),bezelMaterial=vehicleMaterial('bright-alloy'),capMaterial=vehicleMaterial('soft-black'),terminalMaterial=vehicleMaterial('bright-alloy');
 caseMaterial.color.setHex(0x20282c);caseMaterial.metalness=.08;caseMaterial.roughness=.48;
 capMaterial.color.setHex(0x343e42);capMaterial.metalness=.08;capMaterial.roughness=.38;
 for(const material of [caseMaterial,bezelMaterial,capMaterial,terminalMaterial]){material.transparent=true;material.forceSinglePass=true;resources.add(material);}
 const controlDirection=new T.Vector3(-1,0,0).transformDirection(panelFrame),axisTurn=new T.Matrix4().makeRotationZ(-Math.PI/2);
 function addControlPart(control,suffix,geometry,material,centre){
  geometry.applyMatrix4(new T.Matrix4().makeTranslation(...centre).multiply(suffix==='terminal-a'||suffix==='terminal-b'?new T.Matrix4():axisTurn));
  geometry.applyMatrix4(panelFrame);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new T.Mesh(geometry,material);mesh.name=control.id+'-'+suffix;mesh.castShadow=mesh.receiveShadow=true;
  mesh.userData={id:mesh.name,controlId:control.id,label:'面板按钮',group:'engine',mechanism:'el-dashboard',variant:'c41',instrumentRole:'panel-control',illustrative:true,partCounted:false,defocusWeight:0};
  roots.c41.add(mesh);items.push(mesh);resources.add(geometry);return mesh;
 }
 for(const hole of controlHoles){
  const body=addControlPart(hole,'body',new T.CylinderGeometry(hole.radius-.0003,hole.radius-.0003,.016,24),caseMaterial,[-.0075,hole.y,hole.z]);
  addControlPart(hole,'bezel',new T.CylinderGeometry(hole.radius+.0018,hole.radius+.0018,.0028,28),bezelMaterial,[.0042,hole.y,hole.z]);
  addControlPart(hole,'cap',new T.CylinderGeometry(hole.radius*.72,hole.radius*.76,.0048,24),capMaterial,[.008,hole.y,hole.z]);
  for(const [suffix,offset]of [['terminal-a',-.0032],['terminal-b',.0032]])addControlPart(hole,suffix,new T.BoxGeometry(.008,.0013,.0025),terminalMaterial,[-.0195,hole.y+offset,hole.z]);
  controls.push({hole,mesh:body});
 }
 let state={};
 function target(request){
  if(request.variant==='e74'||request.department==='driverless'||request.department==='operations')return 0;
  if(request.department==='power'&&['power','engine'].includes(request.mode))return 1;
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
  root.updateMatrixWorld(true);state={sourceInstances:4,sourceSolids:items.filter(mesh=>mesh.userData.nativeInstrument).length,c41Opacity:c41Alpha,a08Opacity:a08Alpha,frameDatum:datum?.userData.id||'shared-assembly-datum',presentation:'fixed-original-installation',screenPresentation:'source-surface',panelControls:controls.length,controlGeometry:'display-bodies-at-native-panel-cutouts',sourceGeometryModified:false,exploded:clamp(exploded)};
 }
 function framingPoints(request=whole,assemblyMatrix=null){
  if(request.department==='operations'||request.variant==='e74')return [];
  const autonomous=request.department==='driverless';
  if(autonomous?request.mode==='algorithm':target(request)!==1)return [];
  const variant=autonomous?'a08':'c41',matrix=(assemblyMatrix||new T.Matrix4()).clone();root.updateMatrix();matrix.multiply(root.matrix);const points=[];
  for(const mesh of items){if(mesh.userData.variant!==variant)continue;const b=mesh.geometry.boundingBox;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(new T.Vector3(x,y,z).applyMatrix4(matrix));}
  return points;
 }
 function harnessAnchors(){
  const mesh=items.find(item=>item.userData.id==='c41-c125-display'),anchors=[];
  if(mesh)anchors.push({id:'c41-c125-display',mesh,point:[.2542967007320473,.12080001561111375,.5432399967172901],direction:[.9193514336800611,-2.258995218369368e-14,-.39343734112361045],role:'display',variant:'c41',sourceEvidence:{basis:'native-connector-end-face',sourceStep:'C41-C125.step',sourceSha256:'f200d3095d6eeb08bfd5321fa0633928b5d30cb9e00fc1a1c7a820660fd9b7c5',face:2,nativePointMm:[-15,-41.8,18.1]}});
  for(const {hole,mesh}of controls){
   const point=(x,offset=0)=>new T.Vector3(x,hole.y+offset,hole.z).applyMatrix4(panelFrame).toArray();
   anchors.push({id:hole.id,mesh,point:point(-.0235),direction:controlDirection.toArray(),terminals:[-.0032,.0032].map(offset=>({mesh:items.find(item=>item.userData.id===hole.id+(offset<0?'-terminal-a':'-terminal-b')),point:point(-.0235,offset),direction:controlDirection.toArray()})),role:'button',variant:'c41',sourceEvidence:{basis:'native-panel-cutout-and-illustrative-terminal',sourceStep:'C41-Panal.step',sourceSha256:'ac85368f02db25b1a02144fbd7b564307b698e2e44c1b2f85154645071cf2a7a',faces:hole.faces,nativeHoleMm:[hole.y*1000,hole.z*1000,hole.radius*1000],function:'panel-control-input',specificFunctionUnassigned:true}});
  }
  return anchors;
 }
 function labels(request={}){
  if(request.department!=='power'||request.variant==='e74'||!['power','engine'].includes(request.mode))return [];
  const mesh=items.find(item=>item.userData.id==='c41-c125-display');if(!mesh?.visible)return [];
  mesh.updateWorldMatrix(true,false);return [{text:'C125与按钮',point:mesh.geometry.boundingBox.getCenter(new T.Vector3()).add(new T.Vector3(0,0,.018)).applyMatrix4(mesh.matrixWorld)}];
 }
 update();
 return {root,items,update,diagnostics:()=>({...state}),framingPoints,harnessAnchors,labels,explosionFramingPoints:matrix=>framingPoints(whole,matrix),dispose(){resources.forEach(r=>r.dispose());root.clear();}};
}
