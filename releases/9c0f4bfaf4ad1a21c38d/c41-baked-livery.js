import * as T from './vendor/three.module.min.js';
import {loadJSON,loadBinary,loadTexture} from './resource-loader-776.js';
import {applyC41ReferenceFinish} from './c41-reference-finish.js?v=751.2';

const root='./assets/livery-c41-750/';
const ids=['body-003-near','body-003-far','body-004','body-005','body-006'];
// Standard opacity also controls artwork contrast on ghost context. The mapped
// colour stays exact above .12, including the existing .16 near-wing cutaway.
const ghostSkin=new T.Color(0x202326).toArray().map(value=>value.toPrecision(17)).join(',');
function artworkContextShader(shader){
 shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 #ifdef USE_MAP
  diffuseColor.rgb=mix(vec3(${ghostSkin}),diffuseColor.rgb,smoothstep(.03,.12,opacity));
 #endif`);
}

// Regular UV-mapped PBR materials retain their original base-colour atlases.
// Standard opacity controls the contrast of artwork in fading context.
export function createC41Livery(renderer,{environment=()=>null}={}){
 const entries=new Map(),loader=new T.TextureLoader();let loading=null,wing=null;
 const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 const url=file=>{const value=new URL(root+file,import.meta.url);value.searchParams.set('v','752.2');return value.href;};
 const json=file=>loadJSON(url(file));
 function ready(){return loading??=Promise.all([json('uv-manifest.json'),json('rear-wing-uv-groups.json')]).then(async([manifest,groups])=>{
  wing=groups;
  const results=await Promise.allSettled(manifest.objects.map(async data=>{
   if(!ids.includes(data.id))throw new Error('Livery part identity');
   const [buffer,map]=await Promise.all([loadBinary(url(data.binary)),loadTexture(loader,url(data.id+'-base.png'))]);
   const a=data.attributes;
   const append=new Uint32Array(buffer,a.append.byteOffset,a.append.count);
   const uv=new Float32Array(buffer,a.uv.byteOffset,a.uv.count);
   const indices=new Uint32Array(buffer,a.index.byteOffset,a.index.count);
   if(uv.length!==data.vertices*2||indices.length!==data.triangles*3||append.length+data.sourceVertices!==data.vertices)throw new Error('Livery UV layout');
   map.name='C41 baked '+data.id;map.colorSpace=T.SRGBColorSpace;map.anisotropy=anisotropy;
   map.wrapS=map.wrapT=T.ClampToEdgeWrapping;
   entries.set(data.id,{data,append,uv,indices,map});
  }));
  const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
 }).catch(error=>{for(const {map} of entries.values())map.dispose();entries.clear();loading=null;throw error;});}
 function apply(material,data,geometry){
  const entry=entries.get(data.id);
  if(!entry){
   applyC41ReferenceFinish(material,data,environment());
   return false;
  }
  const {data:layout,append,uv,indices,map}=entry;
  const position=geometry.attributes.position,normal=geometry.attributes.normal,originalIndex=geometry.index.array;
  if(position.count!==layout.sourceVertices||originalIndex.length!==indices.length)throw new Error('Livery source geometry mismatch');
  for(let i=0;i<indices.length;i++){
   const index=indices[i],original=index<layout.sourceVertices?index:append[index-layout.sourceVertices];
   if(original!==originalIndex[i])throw new Error('Livery changed triangle identity');
  }
  if(append.length){
   for(const [name,attribute]of [['position',position],['normal',normal]]){
    const values=new Float32Array(layout.vertices*3);values.set(attribute.array);
    for(let i=0;i<append.length;i++)values.set(attribute.array.subarray(append[i]*3,append[i]*3+3),(layout.sourceVertices+i)*3);
    geometry.setAttribute(name,new T.BufferAttribute(values,3));
   }
  }
  geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
  geometry.setIndex(new T.BufferAttribute(layout.vertices<65535?new Uint16Array(indices):indices,1));
  material.map=map;material.color.setHex(0xffffff);material.metalness=.02;
  material.envMap=environment();material.roughness=.30;material.clearcoat=.65;
  material.clearcoatRoughness=.16;material.specularIntensity=.80;material.envMapIntensity=.80;
  // The shell already has separate inner and outer CAD faces. Cull the reverse
  // face so their near-coincident layers cannot cover each other's finish.
  if(data.id==='body-003-near'||data.id==='body-003-far')material.side=T.FrontSide;
  material.onBeforeCompile=artworkContextShader;material.customProgramCacheKey=()=> 'c41-baked-paint-754-context-1';
  material.userData.c41Livery={version:750,sourceId:data.id,coordinates:'static-uv',texture:map.name};
  material.needsUpdate=true;return true;
 }
 function partitionData(aero){
  const copy=structuredClone(aero);
  for(const object of copy.objects){const entry=entries.get(object.sourceId);if(entry)object.sourceVertices=entry.data.vertices;}
  return copy;
 }
 return {ready,apply,partitionData,wingGroups:()=>wing,sourceIds:ids,
  diagnostics:()=>({version:750,textures:entries.size,projectionShaders:0,additionalMeshes:0}),
  dispose(){for(const {map}of entries.values())map.dispose();entries.clear();}};
}
