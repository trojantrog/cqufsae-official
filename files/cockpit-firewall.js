import * as T from './vendor/three.module.min.js';
import {vehicleMaterial} from './presentation-materials.js?v=742';
import {explosionPosition} from './explosion-layout.js?v=751.2';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
// Layer order follows the cost report. The user approved a presentation outline
// fitted to this cockpit: thickness, holes and outline are not manufacturing data.
const relief=()=>0;
function sampleStation(stations,z,key){let i=0;while(i<stations.length-2&&z>stations[i+1].z)i++;const a=stations[i],b=stations[i+1];return T.MathUtils.lerp(a[key],b[key],clamp((z-a.z)/(b.z-a.z)));}
// The sloping shoulder route reaches this rear sheet above the seat slots.
// Intersect the installed webbing with both stack faces, then add 6 mm clearance.
function shoulderOpenings(cockpit,stations,stackDepth,fallbackZ){
 const at=z=>sampleStation(stations,z,'x'),top=stations.at(-1).z,openings=[];
 for(const mesh of cockpit?.items.filter(m=>m.userData.harnessStrap?.startsWith('shoulder'))||[]){
  const bounds=new T.Box2(),positions=mesh.geometry.attributes.position,index=mesh.geometry.index?.array,edges=new Set();mesh.updateMatrix();
  for(let i=0;i<(index?.length??positions.count);i+=3)for(let edge=0;edge<3;edge++){
   const aIndex=index?index[i+edge]:i+edge,bIndex=index?index[i+(edge+1)%3]:i+(edge+1)%3,key=aIndex<bIndex?aIndex+':'+bIndex:bIndex+':'+aIndex;if(edges.has(key))continue;edges.add(key);
   const a=V().fromBufferAttribute(positions,aIndex).applyMatrix4(mesh.matrix),b=V().fromBufferAttribute(positions,bIndex).applyMatrix4(mesh.matrix),dz=b.z-a.z,cuts=[0,1];
   if(Math.abs(dz)>1e-10)for(const station of stations){const t=(station.z-a.z)/dz;if(t>0&&t<1)cuts.push(t);}cuts.sort((a,b)=>a-b);
   for(let j=0;j<cuts.length-1;j++)for(const depth of [0,stackDepth]){
    const p=a.clone().lerp(b,cuts[j]),q=a.clone().lerp(b,cuts[j+1]);if((p.z+q.z)/2<stations[0].z||(p.z+q.z)/2>top)continue;
    const dp=p.x-at(p.z)-depth,dq=q.x-at(q.z)-depth;if(dp*dq>0||Math.abs(dp-dq)<1e-10)continue;
    const point=p.lerp(q,dp/(dp-dq));bounds.expandByPoint(new T.Vector2(point.y,point.z));
   }
  }
  if(!bounds.isEmpty())openings.push({name:mesh.name,minY:bounds.min.x-.006,maxY:bounds.max.x+.006,minZ:bounds.min.y-.006,maxZ:bounds.max.y+.006,basis:'webbing-surface-intersection'});
 }
 return openings.length?openings:[-.099,.099].map(y=>({minY:y-.031,maxY:y+.031,minZ:fallbackZ-.024,maxZ:Math.min(fallbackZ+.024,top-.004),basis:'seat-slot-fallback'}));
}
function plate(thickness,{stations,holes,shoulderSlots}){
 const at=(z,key)=>sampleStation(stations,z,key);
 const shape=new T.Shape();shape.moveTo(-.145,stations[0].z);shape.lineTo(-.145,.25);shape.lineTo(-at(.25,'w'),.25);for(const s of stations.filter(s=>s.z>.25))shape.lineTo(-s.w,s.z);for(const s of [...stations].reverse())shape.lineTo(s.w,s.z);shape.closePath();
 for(const {minY,maxY,minZ,maxZ}of shoulderSlots){const slot=new T.Path();slot.moveTo(minY,minZ);slot.lineTo(maxY,minZ);slot.lineTo(maxY,maxZ);slot.lineTo(minY,maxZ);slot.closePath();shape.holes.push(slot);}
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
 const headrestLowerZ=cockpit?.sizing?.headrestLowerZ??.611,topZ=headrestLowerZ-.014;
 const shoulderSlotZ=cockpit?.sizing?.shoulderSlotZ??.530;
 const stations=[{z:.112,x:-.305,w:.208},{z:.20,x:-.327,w:.231},{z:.285,x:-.354,w:.268},{z:.40,x:-.395,w:.285},{z:topZ-.077,x:-.441,w:.262},{z:topZ,x:-.455,w:.165}];
 const holes=[[-.208,.23],[.208,.23],[-.170,topZ-.047],[.170,topZ-.047]];
 const layerThicknesses=[.0007,.0005,.0007,.0005],layerGap=.00012,stackDepth=layerThicknesses.reduce((sum,t)=>sum+t,0)+layerGap*(layerThicknesses.length-1);
 const shoulderSlots=shoulderOpenings(cockpit,stations,stackDepth,shoulderSlotZ+.042),outline={stations,holes,shoulderSlots},at=(z,key)=>sampleStation(stations,z,key);
 const aluminium=own(vehicleMaterial('bright-alloy'));aluminium.roughness=.44;aluminium.metalness=.87;const inherited=aluminium.onBeforeCompile;
 aluminium.onBeforeCompile=shader=>{inherited?.call(aluminium,shader);shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nvec2 emboss=vec2(vPartP.y+vPartP.z,vPartP.y-vPartP.z)/.010;float embossAA=1.-smoothstep(.18,.8,max(fwidth(emboss.x),fwidth(emboss.y)));float embossRelief=cos(emboss.x*6.2831853)*cos(emboss.y*6.2831853)*embossAA;roughnessFactor=clamp(roughnessFactor+.10*embossRelief,.23,.66);');};aluminium.customProgramCacheKey=()=> 'cockpit-embossed-aluminium-742';
 const insulation=own(vehicleMaterial('soft-black'));insulation.color.setHex(0x343637);insulation.roughness=.87;
 const fastener=own(vehicleMaterial('bright-alloy'));
 for(const material of [aluminium,insulation,fastener]){material.transparent=true;material.forceSinglePass=true;}
 function add(geometry,material,name,layer){geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new T.Mesh(own(geometry),material);mesh.name=name;mesh.userData={id:name,group:'frame',cockpitRole:'firewall',presentationOnly:true,layer,defocusWeight:0};mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);items.push(mesh);return mesh;}
 let offset=0;const layers=[];for(const [i,thickness]of layerThicknesses.entries()){const material=i%2?insulation:aluminium,mesh=add(plate(thickness,outline),material,`firewall-layer-${i+1}`,i);mesh.userData.installedOffset=offset;mesh.position.x=offset;layers.push(mesh);offset+=thickness+layerGap;}
 for(const [i,[y,z]]of holes.entries()){const g=new T.CylinderGeometry(.0044,.0044,.003,6);g.rotateZ(Math.PI/2);g.translate(at(z,'x')+offset+.0015,y,z);add(g,fastener,`firewall-fastener-${i+1}`,3);}
 const path={presentationPath:[[0,0,0],[-.26,-1.10,.63]],presentationBezier:[[0,0,0],[-.04,0,.96],[-.26,-1.10,.94],[-.26,-1.10,.63]]};
 const pivot=V(...(cockpit?.diagnostics().extractionPivot||[-.24,0,.35]));
 function pose(p){const offset=explosionPosition(path,p),out=smooth(clamp((-offset.y-.12)/.83)),rotation=new T.Quaternion().setFromAxisAngle(V(0,0,1),T.MathUtils.degToRad(-18)*out);return {offset,rotation};}
 let state={opacity:1,exploded:0};
 function weight(r){return r.mode==='all'||r.department==='structure'?1:r.department==='driverless'?0:.023;}
 function update(motion={},focus=[{department:'all',mode:'all',weight:1}],p=0){const alpha=clamp(focus.reduce((v,r)=>v+weight(r)*r.weight,0))*(motion.variants?.assemblyAlpha??1),sharp=clamp(focus.reduce((v,r)=>v+(weight(r)===1?r.weight:0),0)),{offset,rotation}=pose(clamp(p)),separate=.038*smooth(p);root.position.copy(offset).add(pivot).sub(pivot.clone().applyQuaternion(rotation));root.quaternion.copy(rotation);root.visible=alpha>.001;
  for(const mesh of items){mesh.position.x=(mesh.userData.installedOffset||0)+mesh.userData.layer*separate;mesh.material.opacity=alpha;mesh.material.depthWrite=alpha>.9999;mesh.visible=alpha>.001;mesh.userData.defocusWeight=1-sharp;mesh.castShadow=alpha>.08;mesh.updateMatrix();}root.updateMatrixWorld(true);state={opacity:alpha,exploded:p,layerSeparation:separate};}
 update();const installed=items.flatMap(m=>boxPoints(m));
 return {root,items,update,framingPoints:()=>installed.map(p=>p.clone()),explosionFramingPoints:matrix=>{const out=[];for(let i=0;i<=128;i++){const {offset,rotation}=pose(i/128);for(const p of installed)for(const spread of [0,.114]){const v=p.clone().add(V(spread,0,0)).sub(pivot).applyQuaternion(rotation).add(pivot).add(offset);out.push(matrix?v.applyMatrix4(matrix):v);}}return out;},diagnostics:()=>({layers:4,order:['embossed-aluminium','Formex','embossed-aluminium','Formex'],headrestLowerZ,topZ,shoulderSlots,extractionCurve:path.presentationBezier,presentationLane:'far-side-cockpit',outlineBasis:'User-approved display outline fitted to the current cockpit',manufacturingDimensionsVerified:false,sourceCADAvailable:false,...state}),dispose(){resources.forEach(x=>x.dispose());root.clear();}};
}
