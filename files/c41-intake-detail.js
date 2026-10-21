import {sha256} from './asset-checksum-767.js';
import * as T from './vendor/three.module.min.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js?v=751.2';

let throttleSource;
export async function assignC41ThrottleSurfaces(geometry){
 const source=await (throttleSource??=fetch(new URL('./c41-throttle-surface-750.json?v=750.8',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Throttle surface metadata');return r.json();}));
 const {requirements:r,vertexAttribute:attribute}=source;
 if(geometry.attributes.position.count!==r.positionCount||geometry.index.count!==r.indexCount||attribute.componentType!==5121||attribute.count!==r.positionCount)throw new Error('Throttle surface source mismatch');
 const digest=sha256;
 const hashes=await Promise.all([digest(geometry.attributes.position.array),digest(geometry.attributes.normal.array),digest(geometry.index.array)]);
 if(hashes.some((hash,i)=>hash!==[r.positionSHA256,r.normalSHA256,r.indexSHA256][i]))throw new Error('Throttle surface geometry hash');
 const bytes=Uint8Array.from(atob(attribute.data),c=>c.charCodeAt(0));
 if(bytes.length!==r.positionCount||bytes.some(v=>v>3))throw new Error('Throttle surface values');
 geometry.setAttribute('c41Surface',new T.BufferAttribute(bytes,1));
 geometry.userData.c41Intake='throttle';
}

// This display refinement retains the native filter's Y axis, connection
// opening and installation matrix. Surface codes share one draw/material.
export function createC41AirFilter(){
 const pieces=[],y0=-.0615,y1=-.0045,r0=.0281,r1=.0380;
 function add(geometry,surface){
  geometry.deleteAttribute('uv');
  geometry.setAttribute('c41Surface',new T.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(surface),1));
  pieces.push(geometry);return geometry;
 }
 function lathe(profile,surface){return add(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),96),surface);}
 // The actual folds continue beneath an independent open wire cage.
 const positions=[],indices=[],segments=336,rows=12,pleats=56;
 for(let row=0;row<=rows;row++){
  const u=row/rows,y=T.MathUtils.lerp(y0,y1,u),radius=T.MathUtils.lerp(r0,r1,u);
  for(let j=0;j<=segments;j++){
   const angle=j/segments*Math.PI*2,f=(j/segments*pleats)%1;
   const fold=1-Math.abs(f*2-1),r=radius-.00045-.0019*fold;
   positions.push(r*Math.cos(angle),y,r*Math.sin(angle));
  }
 }
 for(let row=0;row<rows;row++)for(let j=0;j<segments;j++){
  const a=row*(segments+1)+j,b=a+segments+1;
  indices.push(a,b,a+1,a+1,b,b+1);
 }
 const media=new T.BufferGeometry();media.setAttribute('position',new T.Float32BufferAttribute(positions,3));media.setIndex(indices);media.computeVertexNormals();add(media,0);
 class CageWire extends T.Curve{
  constructor(phase,direction){super();this.phase=phase;this.direction=direction;}
  getPoint(u,target=new T.Vector3()){
   const radius=T.MathUtils.lerp(r0,r1,u),angle=this.phase+this.direction*(y1-y0)/(r1-r0)*Math.log(radius/r0);
   // Separate the two crossing wire families by one wire diameter.
   const r=radius+(this.direction>0?.00012:.00038);
   return target.set(r*Math.cos(angle),T.MathUtils.lerp(y0,y1,u),r*Math.sin(angle));
  }
 }
 for(const direction of [-1,1])for(let i=0;i<64;i++)add(new T.TubeGeometry(new CageWire(i/64*Math.PI*2,direction),48,.00015,6,false),1);
 // Rounded elastomer end seals; the open connection still has its 32 mm bore.
 lathe([[0,-.065],[.0255,-.065],[.0285,-.0644],[.0291,-.0632],[.0291,-.0617],[.0286,-.0607],[.0274,-.0607],[.0274,-.063],[0,-.063],[0,-.065]],2);
 lathe([[.0374,-.006],[.0386,-.0058],[.0392,-.0044],[.0392,-.0026],[.0385,-.0013],[.0358,0],[.0235,.001],[.0225,.0022],[.0225,.0135],[.022,.015],[.016,.015],[.016,-.003],[.0359,-.004],[.0374,-.006]],2);
 // Narrow retaining bands leave the media visible, with a small clamp screw.
 lathe([[.0290,-.0631],[.0293,-.0631],[.0293,-.0618],[.0290,-.0618],[.0290,-.0631]],3);
 lathe([[.0389,-.0042],[.03935,-.0042],[.03935,-.0027],[.0389,-.0027],[.0389,-.0042]],3);
 lathe([[.0224,.004],[.0230,.004],[.0230,.010],[.0224,.010],[.0224,.004]],3);
 const clamp=new T.BoxGeometry(.007,.006,.004);clamp.translate(.023,.007,0);add(clamp,3);
 const screw=new T.CylinderGeometry(.0017,.0017,.008,12);screw.rotateZ(Math.PI/2);screw.translate(.0255,.007,0);add(screw,3);
 const geometry=mergeGeometries(pieces,false);for(const piece of pieces)piece.dispose();
 geometry.computeBoundingBox();geometry.computeBoundingSphere();
 geometry.userData={c41Intake:'filter',pleats,meshWires:128,meshOpeningMetres:.0024,connectionBoreMetres:.032,sourceAxis:'Y',sourceSpace:'part-local-m'};
 return geometry;
}

export function configureC41IntakeMaterial(material,kind){
 material.color.setHex(0xffffff);material.metalness=0;material.roughness=.60;material.clearcoat=0;material.specularIntensity=.85;
 const linear=hex=>new T.Color(hex).toArray().map(v=>v.toFixed(6)).join(',');
 const palette=kind==='filter'?
  [[0x571923,.02,.76],[0x938887,.91,.34],[0x191e21,.02,.69],[0xc4cbcd,.97,.25]]:
  [[0xd9dfe1,.97,.46],[0x23282c,.02,.48],[0xbcc4c7,.98,.24],[0xa78a51,.91,.30]];
 const choose=palette.map(([color,metal,rough],i)=>`${i?'else ':''}if(vC41Finish<${(i+.5).toFixed(1)}){diffuseColor.rgb*=vec3(${linear(color)});c41Metal=${metal.toFixed(3)};c41Rough=${rough.toFixed(3)};}`).join('\n');
 material.onBeforeCompile=shader=>{
  shader.vertexShader='attribute float c41Surface; varying float vC41Finish; varying vec3 vC41FinishP;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvC41Finish=c41Surface;vC41FinishP=position;');
  shader.fragmentShader='varying float vC41Finish; varying vec3 vC41FinishP;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float c41Metal=0.,c41Rough=.60;
   ${choose}
   vec3 c41GrainP=vC41FinishP/.00065;
   float c41AA=1.-smoothstep(.35,1.4,max(max(fwidth(c41GrainP.x),fwidth(c41GrainP.y)),fwidth(c41GrainP.z)));
   float c41Grain=sin(dot(c41GrainP,vec3(1.7,2.3,.9)))*sin(dot(c41GrainP,vec3(.8,-1.1,1.9)))*c41AA;
   c41Rough+=.025*c41Grain;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(c41Rough,.04,1.);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=c41Metal;');
  if(kind==='throttle')shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   float c41Height=.000004*c41Grain*(1.-step(.5,vC41Finish));
   vec3 c41DX=dFdx(-vViewPosition),c41DY=dFdy(-vViewPosition);
   vec3 c41R1=cross(c41DY,normal),c41R2=cross(normal,c41DX);
   float c41Det=dot(c41DX,c41R1);
   vec3 c41Gradient=(c41R1*dFdx(c41Height)+c41R2*dFdy(c41Height))*sign(c41Det)/max(abs(c41Det),1.e-12);
   normal=normalize(normal-c41Gradient);`);
 };
 material.customProgramCacheKey=()=>`c41-intake-750-7-${kind}`;
 material.userData.c41Surface=kind+'-geometry';material.needsUpdate=true;
}
