import * as T from './vendor/three.module.min.js';
import {vehicleMaterial} from './presentation-materials.js?v=742';
import {explosionPosition} from './explosion-layout.js?v=742';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
// Layer order follows the cost report. The user approved a presentation outline
// fitted to this cockpit: thickness, holes and outline are not manufacturing data.
const stations=[{z:.112,x:-.305,w:.208},{z:.20,x:-.327,w:.231},{z:.285,x:-.354,w:.268},{z:.40,x:-.395,w:.285},{z:.62,x:-.441,w:.262},{z:.86,x:-.455,w:.165}];
const relief=()=>0;
const holes=[[-.208,.23],[.208,.23],[-.205,.65],[.205,.65]];
function at(z,key){let i=0;while(i<stations.length-2&&z>stations[i+1].z)i++;const a=stations[i],b=stations[i+1];return T.MathUtils.lerp(a[key],b[key],clamp((z-a.z)/(b.z-a.z)));}
function plate(thickness){
 const shape=new T.Shape();shape.moveTo(-.145,stations[0].z);shape.lineTo(-.145,.25);shape.lineTo(-at(.25,'w'),.25);for(const s of stations.filter(s=>s.z>.25))shape.lineTo(-s.w,s.z);for(const s of [...stations].reverse())shape.lineTo(s.w,s.z);shape.closePath();
 for(const y of [-.099,.099]){const slot=new T.Path();slot.moveTo(y-.031,.558);slot.lineTo(y+.031,.558);slot.lineTo(y+.031,.612);slot.lineTo(y-.031,.612);slot.closePath();shape.holes.push(slot);}
 for(const [y,z]of holes){const hole=new T.Path();hole.absarc(y,z,.00275,0,Math.PI*2,true);shape.holes.push(hole);}
 const flat=new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,steps:1,curveSegments:16});
 // Triangulate each longitudinal interval so the folded sheet follows the
 // seat-back clearance without spanning the change in slope with one triangle.
 const pos=flat.attributes.position,triangles=[];
 for(let i=0;i<pos.count;i+=3){let polys=[[0,1,2].map(j=>V().fromBufferAttribute(pos,i+j))];
  for(const cut of [...stations.slice(1,-1).map(s=>({axis:'y',value:s.z})),...[-.242,-.23,-.223,-.195,-.18,-.156,-.146,-.138].map(value=>({axis:'x',value})),...[.244,.26,.28,.29].map(value=>({axis:'y',value}))]){const next=[];for(const poly of polys){for(const sign of [-1,1]){const clipped=[];for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length],da=(a[cut.axis]-cut.value)*sign,db=(b[cut.axis]-cut.value)*sign;if(da>=-1e-10)clipped.push(a.clone());if(da*db<0)clipped.push(a.clone().lerp(b,da/(da-db)));}if(clipped.length>=3)next.push(clipped);} }polys=next;}
  for(const p of polys)for(let j=1;j<p.length-1;j++)for(const v of [p[0],p[j],p[j+1]])triangles.push(at(v.y,'x')-relief(v.x,v.y)+v.z,v.x,v.y);
 }
 flat.dispose();const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(triangles,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function boxPoints(mesh,matrix){const b=mesh.geometry.boundingBox,out=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const p=V(x,y,z).applyMatrix4(mesh.matrix);out.push(matrix?p.applyMatrix4(matrix):p);}return out;}
export function createCockpitFirewall(cockpit){
 const root=new T.Group();root.name='cockpit-four-layer-firewall';const items=[],resources=new Set(),own=o=>(resources.add(o),o);
 const aluminium=own(vehicleMaterial('bright-alloy'));aluminium.roughness=.44;aluminium.metalness=.87;const inherited=aluminium.onBeforeCompile;
 aluminium.onBeforeCompile=shader=>{inherited?.call(aluminium,shader);shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nvec2 emboss=vec2(vPartP.y+vPartP.z,vPartP.y-vPartP.z)/.010;float embossAA=1.-smoothstep(.18,.8,max(fwidth(emboss.x),fwidth(emboss.y)));float embossRelief=cos(emboss.x*6.2831853)*cos(emboss.y*6.2831853)*embossAA;roughnessFactor=clamp(roughnessFactor+.10*embossRelief,.23,.66);');};aluminium.customProgramCacheKey=()=> 'cockpit-embossed-aluminium-742';
 const insulation=own(vehicleMaterial('soft-black'));insulation.color.setHex(0x343637);insulation.roughness=.87;
 const fastener=own(vehicleMaterial('bright-alloy'));
 for(const material of [aluminium,insulation,fastener]){material.transparent=true;material.forceSinglePass=true;}
 function add(geometry,material,name,layer){geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new T.Mesh(own(geometry),material);mesh.name=name;mesh.userData={id:name,group:'frame',cockpitRole:'firewall',presentationOnly:true,layer,defocusWeight:0};mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);items.push(mesh);return mesh;}
 let offset=0;const layers=[];for(const [i,material,thickness]of [[0,aluminium,.0007],[1,insulation,.0005],[2,aluminium,.0007],[3,insulation,.0005]]){const mesh=add(plate(thickness),material,`firewall-layer-${i+1}`,i);mesh.userData.installedOffset=offset;mesh.position.x=offset;layers.push(mesh);offset+=thickness+.00012;}
 for(const [i,[y,z]]of holes.entries()){const g=new T.CylinderGeometry(.0044,.0044,.003,6);g.rotateZ(Math.PI/2);g.translate(at(z,'x')+offset+.0015,y,z);add(g,fastener,`firewall-fastener-${i+1}`,3);}
 const path={presentationPath:[[0,0,0],[0,0,1.15],[0,-1.15,1.36],[-.16,-1.55,1.36]]};
 let state={opacity:1,exploded:0};
 function weight(r){return r.mode==='all'||r.department==='structure'?1:r.department==='driverless'?0:.023;}
 function update(motion={},focus=[{department:'all',mode:'all',weight:1}],p=0){const alpha=clamp(focus.reduce((v,r)=>v+weight(r)*r.weight,0))*(motion.variants?.assemblyAlpha??1),sharp=clamp(focus.reduce((v,r)=>v+(weight(r)===1?r.weight:0),0)),translation=explosionPosition(path,clamp(p)),separate=.085*smooth((p-.78)/.22);if(cockpit){root.position.copy(cockpit.root.position).add(V(-.24*smooth((p-.52)/.09),0,0).applyQuaternion(cockpit.root.quaternion)).add(V(0,-3.2*smooth((p-.64)/.36),0));root.quaternion.copy(cockpit.root.quaternion);}else root.position.copy(translation);root.visible=alpha>.001;
  for(const mesh of items){mesh.position.x=(mesh.userData.installedOffset||0)+mesh.userData.layer*separate;mesh.material.opacity=alpha;mesh.material.depthWrite=alpha>.9999;mesh.visible=alpha>.001;mesh.userData.defocusWeight=1-sharp;mesh.castShadow=alpha>.08;mesh.updateMatrix();}root.updateMatrixWorld(true);state={opacity:alpha,exploded:p,layerSeparation:separate};}
 update();const installed=items.flatMap(m=>boxPoints(m));
 return {root,items,update,framingPoints:()=>installed.map(p=>p.clone()),explosionFramingPoints:matrix=>{if(cockpit){const out=[];for(const p of cockpit.explosionFramingPoints())for(const y of [0,-3.2])for(const d of [V(.30,.30,.30),V(-.30,-.30,-.30)]){const v=p.clone().add(d).add(V(0,y,0));out.push(matrix?v.applyMatrix4(matrix):v);}return out;}const out=[];for(const offset of path.presentationPath)for(const p of installed)for(const spread of [0,.255]){const v=p.clone().add(V(...offset)).add(V(spread,0,0));out.push(matrix?v.applyMatrix4(matrix):v);}return out;},diagnostics:()=>({layers:4,order:['embossed-aluminium','Formex','embossed-aluminium','Formex'],outlineBasis:'User-approved display outline fitted to the current cockpit',manufacturingDimensionsVerified:false,sourceCADAvailable:false,...state}),dispose(){resources.forEach(x=>x.dispose());root.clear();}};
}
