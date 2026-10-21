import {sha256} from './asset-checksum-767.js';
import * as T from './vendor/three.module.min.js';

const surfaceSources=new Map();
export async function assignC41SwitchSurfaces(geometry,id){
 const filename=id==='c41-engine-update-190'?'c41-inertial-switch-surface-751.json?v=751':'c41-safety-switch-surface-750.json?v=750.9';
 if(!surfaceSources.has(filename))surfaceSources.set(filename,fetch(new URL('./'+filename,import.meta.url)).then(r=>{if(!r.ok)throw new Error('Switch surface metadata');return r.json();}));
 const source=await surfaceSources.get(filename);
 const entry=source.geometries.find(g=>g.ids.includes(id));
 if(!entry)throw new Error('Switch surface identity');
 const {requirements:r,vertexAttribute:attribute}=entry;
 if(geometry.attributes.position.count!==r.positionCount||geometry.index.count!==r.indexCount||attribute.componentType!==5121||attribute.count!==r.positionCount)throw new Error('Switch surface source mismatch');
 const digest=sha256;
 const hashes=await Promise.all([digest(geometry.attributes.position.array),digest(geometry.attributes.normal.array),digest(geometry.index.array)]);
 if(hashes.some((hash,i)=>hash!==[r.positionSHA256,r.normalSHA256,r.indexSHA256][i]))throw new Error('Switch surface geometry hash');
 const bytes=Uint8Array.from(atob(attribute.data),c=>c.charCodeAt(0));
 if(bytes.length!==r.positionCount||bytes.some(v=>v>2))throw new Error('Switch surface values');
 geometry.setAttribute('c41SwitchSurface',new T.BufferAttribute(bytes,1));
 if(id==='c41-engine-update-190')geometry.userData.c41InertialSwitch=entry.geometryId;
 else geometry.userData.c41SafetySwitch=entry.geometryId;
}

// Preserve the CAD surfaces and installation. The red cap uses the requested
// rubber presentation; the black moulding and terminals have separate finishes.
export function configureC41SwitchMaterial(material,{inertial=false}={}){
 material.color.setHex(0xffffff);material.metalness=0;material.roughness=.64;
 material.clearcoat=0;material.specularIntensity=.55;
 const linear=hex=>new T.Color(hex).toArray().map(v=>v.toFixed(6)).join(',');
 material.onBeforeCompile=shader=>{
  shader.vertexShader='attribute float c41SwitchSurface; varying float vC41SwitchSurface; varying vec3 vC41SwitchP;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvC41SwitchSurface=c41SwitchSurface;vC41SwitchP=position;');
  shader.fragmentShader='varying float vC41SwitchSurface; varying vec3 vC41SwitchP;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float c41SwitchMetal=0.,c41SwitchRough=.67;
   if(vC41SwitchSurface<.5){diffuseColor.rgb*=vec3(${linear(0x9e2b31)});}
   else if(vC41SwitchSurface<1.5){diffuseColor.rgb*=vec3(${linear(0x292e32)});c41SwitchRough=.43;}
   else{diffuseColor.rgb*=vec3(${linear(0xbec6ca)});c41SwitchMetal=.97;c41SwitchRough=.28;}
   vec3 c41SwitchGrainP=vC41SwitchP/.00020;
   float c41SwitchAA=1.-smoothstep(.35,1.4,max(max(fwidth(c41SwitchGrainP.x),fwidth(c41SwitchGrainP.y)),fwidth(c41SwitchGrainP.z)));
   float c41SwitchGrain=sin(dot(c41SwitchGrainP,vec3(1.7,2.3,.9)))*sin(dot(c41SwitchGrainP,vec3(.8,-1.1,1.9)))*c41SwitchAA;
   float c41SwitchPolymer=1.-step(1.5,vC41SwitchSurface);
   c41SwitchRough+=.025*c41SwitchGrain*c41SwitchPolymer;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(c41SwitchRough,.04,1.);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=c41SwitchMetal;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   float c41SwitchHeight=.0000015*c41SwitchGrain*c41SwitchPolymer;
   vec3 c41SwitchDX=dFdx(-vViewPosition),c41SwitchDY=dFdy(-vViewPosition);
   vec3 c41SwitchR1=cross(c41SwitchDY,normal),c41SwitchR2=cross(normal,c41SwitchDX);
   float c41SwitchDet=dot(c41SwitchDX,c41SwitchR1);
   vec3 c41SwitchGradient=(c41SwitchR1*dFdx(c41SwitchHeight)+c41SwitchR2*dFdy(c41SwitchHeight))*sign(c41SwitchDet)/max(abs(c41SwitchDet),1.e-12);
   normal=normalize(normal-c41SwitchGradient);`);
 };
 material.customProgramCacheKey=()=> inertial?'c41-inertial-switch-751-balanced':'c41-safety-switch-751-balanced';
 material.userData.c41Surface=inertial?'inertial-switch-reset-polymer-metal':'safety-switch-rubber-polymer-metal';material.needsUpdate=true;
}
