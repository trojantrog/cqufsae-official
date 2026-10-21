import * as T from './vendor/three.module.min.js';

// Presentation additions use the recovered native envelope and its four holes.
// These are not a RapidECU-U2 factory enclosure, connector or PCB reconstruction.
const NATIVE_HOLES=[[0,0],[.200,0],[.200,-.059],[0,-.059]];
function roundedRectangle(x,y,width,height,radius){
 const s=new T.Shape(),r=radius;
 s.moveTo(x+r,y);s.lineTo(x+width-r,y);s.quadraticCurveTo(x+width,y,x+width,y+r);
 s.lineTo(x+width,y+height-r);s.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
 s.lineTo(x+r,y+height);s.quadraticCurveTo(x,y+height,x,y+height-r);
 s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}

function nameplateTexture(){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=208;
 const c=canvas.getContext('2d');c.fillStyle='#e8ebed';c.fillRect(0,0,512,208);
 c.strokeStyle='#b8c0c6';c.lineWidth=3;c.strokeRect(3,3,506,202);
 c.fillStyle='#39434b';c.textAlign='center';c.textBaseline='middle';c.font='600 92px system-ui, sans-serif';
 c.fillText('VCU',256,108);
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
 return texture;
}

export function createA08VcuDetail(sources=[],{meshId='a08-mcu-001'}={}){
 const host=sources.find(m=>m.userData?.id===meshId),root=new T.Group();root.name='a08-vcu-display-detail';
 const baseState={ready:!!host,hostId:host?.userData.id||null,suggestedLabel:'VCU',displayOnly:true,
  factoryGeometryClaim:false,exactU2DimensionsClaim:false,connectorGeometryAdded:false,connectorPinoutClaim:false,
  pcbGeometryAdded:false,additionalIndependentParts:0,nativeHoleCentresM:NATIVE_HOLES.map(p=>[...p]),
  sourceEnvelopeMm:[214,124,35],sourceGeometryPreserved:true,originalInstallationPreserved:true};
 if(!host)return {root,host:null,suggestedLabel:'VCU',items:[],update(){root.visible=false;},syncPresentation(){},
  framingPoints:()=>[],worldFramingPoints:()=>[],anchor:()=>null,diagnostics:()=>({...baseState}),dispose(){}};

 const originalGeometry=host.geometry,originalMaterial=host.material;
 const originalMaterials=Array.isArray(originalMaterial)?originalMaterial:[originalMaterial];
 const bodyMaterials=originalMaterials.map(material=>{
  const clone=material.clone();clone.name='vcu-native-body-display-finish';
  clone.color?.setHex(0x9ca5ac);if('metalness'in clone)clone.metalness=.68;if('roughness'in clone)clone.roughness=.36;
  clone.userData={...clone.userData,presentation:'bright-alloy',preserveColor:true,illustrative:true};return clone;
 });
 host.material=Array.isArray(originalMaterial)?bodyMaterials:bodyMaterials[0];
 const coverMaterial=new T.MeshStandardMaterial({color:0xb9c0c5,metalness:.78,roughness:.33});
 const fastenerMaterial=new T.MeshStandardMaterial({color:0x9ba3a8,metalness:.85,roughness:.28});
 coverMaterial.userData={presentation:'bright-alloy',preserveColor:true,illustrative:true};
 fastenerMaterial.userData={presentation:'polished-steel',preserveColor:true,illustrative:true};
 const plateTexture=nameplateTexture();
 const plateMaterial=new T.MeshStandardMaterial({map:plateTexture,metalness:.12,roughness:.58});
 const materials=[coverMaterial,fastenerMaterial,plateMaterial],geometries=new Set(),items=[];
 root.userData={role:'vcu-exterior-display',group:'electronics',contextRole:'electronics',variant:'a08',
  partCounted:false,illustrative:true,sourceHostId:meshId,exactU2Geometry:false};
 function add(name,geometry,material,position=[0,0,0]){
  geometries.add(geometry);const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.position.fromArray(position);
  mesh.userData={...root.userData,role:name,defocusWeight:0};root.add(mesh);items.push(mesh);return mesh;
 }

 // Native main-body top is z=35 mm; the narrow cover stays inside its outline.
 const coverShape=roundedRectangle(-.0062,-.0832,.2124,.1074,.0012);
 for(const [x,y]of NATIVE_HOLES){const hole=new T.Path();hole.absarc(x,y,.00415,0,Math.PI*2,true);coverShape.holes.push(hole);}
 const coverGeometry=new T.ExtrudeGeometry(coverShape,{depth:.0006,bevelEnabled:false,curveSegments:16,steps:1});
 add('vcu-display-cover',coverGeometry,coverMaterial,[0,0,.03505]);

 const washerShape=new T.Shape();washerShape.absarc(0,0,.0057,0,Math.PI*2,false);
 const washerHole=new T.Path();washerHole.absarc(0,0,.0033,0,Math.PI*2,true);washerShape.holes.push(washerHole);
 const washerGeometry=new T.ExtrudeGeometry(washerShape,{depth:.00035,bevelEnabled:false,curveSegments:12,steps:1});
 const headGeometry=new T.CylinderGeometry(.0052,.0052,.0024,6,1,false);
 for(let i=0;i<NATIVE_HOLES.length;i++){
  const [x,y]=NATIVE_HOLES[i];add('vcu-display-washer-'+(i+1),washerGeometry,fastenerMaterial,[x,y,.03565]);
  const head=add('vcu-display-fastener-'+(i+1),headGeometry,fastenerMaterial,[x,y,.0372]);head.rotation.x=Math.PI*.5;
 }
 add('vcu-display-nameplate',new T.PlaneGeometry(.052,.021),plateMaterial,[.100,-.0295,.03582]);
 host.add(root);

 const localPoints=[];
 for(const x of [-.007,.207])for(const y of [-.099,.025])for(const z of [0,.0384])localPoints.push(new T.Vector3(x,y,z));
 const labelPoint=new T.Vector3(.100,-.0295,.0394);
 let disposed=false,opacity=1;
 function syncPresentation(){
  if(disposed)return;
  const current=Array.isArray(host.material)?host.material[0]:host.material;
  opacity=T.MathUtils.clamp(Number.isFinite(current?.opacity)?current.opacity:1,0,1);
  root.visible=host.visible&&current?.visible!==false&&opacity>.002;
  for(const material of materials){
   material.opacity=opacity;material.depthWrite=opacity>.9999&&current?.depthWrite!==false;material.depthTest=true;
   if(opacity<.9999&&!material.transparent){material.transparent=true;material.needsUpdate=true;}
  }
  for(const item of items){
   item.castShadow=!!host.castShadow&&opacity>.9999;item.receiveShadow=!!host.receiveShadow;
   item.renderOrder=host.renderOrder;item.userData.defocusWeight=host.userData.defocusWeight||0;
  }
 }
 function worldFramingPoints(){host.updateWorldMatrix(true,false);return localPoints.map(p=>p.clone().applyMatrix4(host.matrixWorld));}
 syncPresentation();
 return {root,host,suggestedLabel:'VCU',items,update:syncPresentation,syncPresentation,
  framingPoints:()=>localPoints.map(p=>p.clone()),worldFramingPoints,
  anchor(){host.updateWorldMatrix(true,false);return labelPoint.clone().applyMatrix4(host.matrixWorld);},
  diagnostics:()=>({...baseState,addedMeshes:items.length,opacity,visible:root.visible,
   geometryUnchanged:host.geometry===originalGeometry,sourceTriangleCount:originalGeometry.index?.count/3||0,
   detailFollowsNativeMesh:true,materialOverrideIsClone:bodyMaterials.every(m=>!originalMaterials.includes(m)),
   detailBoundsHostLocalM:[[-.007,-.099,0],[.207,.025,.0384]]}),
  dispose(){
   if(disposed)return;disposed=true;
   const current=Array.isArray(host.material)?host.material:[host.material];
   if(current.length===bodyMaterials.length&&current.every((m,i)=>m===bodyMaterials[i]))host.material=originalMaterial;
   root.removeFromParent();for(const geometry of geometries)geometry.dispose();
   for(const material of [...materials,...bodyMaterials])material.dispose();plateTexture.dispose();root.clear();
  }
 };
}

export default createA08VcuDetail;
