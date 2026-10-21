import * as T from './vendor/three.module.min.js';
import {loadJSON,loadTexture} from './resource-loader-776.js';
import {nativeWindowShader} from './native-window-756.js';

const color=(v,fallback=[.5,.5,.5])=>new T.Color().fromArray(v||fallback);
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
const scalar=(x,f)=>Number.isFinite(x)?x:f;
const smoother=`float nativeSmooth(float a,float b,float x){float t=clamp((x-a)/(b-a),0.,1.);return t*t*t*(t*(t*6.-15.)+10.);}`;

// One physical shader retains the native Principled values. Procedural detail
// is evaluated at surface scale, independently of the livery image UVs.
function surfaceShader(material,definition,{geometry=null}={}){
 const recipes=definition.procedural||[],carbon=recipes.find(r=>r.kind==='c41_twill_2x2');
 const webbing=recipes.find(r=>r.kind==='c41_woven_webbing');
 const grain=recipes.find(r=>r.kind==='blender_noise_roughness');
 const portable=recipes.find(r=>r.kind==='c41_portable_surface'),aniso=material.anisotropy>0;
 const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
 const window=parse(definition.properties?.ev_window),hasWindow=!!window;
 const state=hasWindow?{centre:{value:new T.Vector3(...window.center)},u:{value:new T.Vector3(...window.u)},v:{value:new T.Vector3(...window.v)},n:{value:new T.Vector3(...window.normal)},extent:{value:new T.Vector3(...window.halfExtents).addScalar(1e-7)},alpha:{value:window.opacity??.14},amount:{value:0}}:null;
 if(state){material.userData.nativeWindowUniforms=state;material.userData.nativeWindow=window;}
 const faces=!!geometry?.getAttribute('nativeFacePbr');
 const hasTexture=!!material.map;
 const portableAttribute=portable&&geometry?.hasAttribute('c41_shader_position');
 const declaration=[carbon?'attribute vec2 Carbon_Weave; varying vec2 vNativeWeave;':'',webbing?'varying vec2 vNativeFabric;':'',grain||hasWindow||portable?'varying vec3 vNativePosition;':'',portableAttribute?'attribute vec3 c41_shader_position;':'',faces?'attribute vec4 nativeFacePbr; varying vec4 vNativeFacePbr; attribute float nativeCoatRoughness; varying float vNativeCoatRoughness;':''].join('\n');
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  shader.vertexShader=declaration+'\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   ${carbon?'vNativeWeave=Carbon_Weave;':''}
   ${webbing?'vNativeFabric=uv;':''}
   ${grain||hasWindow||portable?`vNativePosition=${portableAttribute?'c41_shader_position':'position'};`:''}
   ${faces?'vNativeFacePbr=nativeFacePbr;vNativeCoatRoughness=nativeCoatRoughness;':''}`);
  let pars=smoother+'\n';
  if(carbon)pars+='varying vec2 vNativeWeave;\n';
  if(webbing)pars+='varying vec2 vNativeFabric;\n';
  if(grain||hasWindow||portable)pars+='varying vec3 vNativePosition;\n';
  if(faces)pars+='varying vec4 vNativeFacePbr;varying float vNativeCoatRoughness;\n';
  if(grain)pars+=`float nativeHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float nativeNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(nativeHash(i),nativeHash(i+vec3(1,0,0)),f.x),mix(nativeHash(i+vec3(0,1,0)),nativeHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(nativeHash(i+vec3(0,0,1)),nativeHash(i+vec3(1,0,1)),f.x),mix(nativeHash(i+vec3(0,1,1)),nativeHash(i+vec3(1,1,1)),f.x),f.y),f.z);}\n`;
  shader.fragmentShader=pars+shader.fragmentShader;
  let surface='',rough='',bump='';
  if(carbon){
   const tow=carbon.towWidthMetres||.0022,low=carbon.ramp[0].color.slice(0,3).join(','),high=carbon.ramp[1].color.slice(0,3).join(',');
   surface+=`vec2 nc=vNativeWeave/${tow.toFixed(10)};
vec2 ncCell=floor(nc),ncFrac=fract(nc);float ncWarp=1.-step(2.,mod(ncCell.x-ncCell.y,4.));
float ncCrossX=pow(max(sin(ncFrac.x*3.14159265),0.),.7),ncCrossY=pow(max(sin(ncFrac.y*3.14159265),0.),.7);
float ncPhaseX=mod(nc.y-ncCell.x+1.,4.)*1.570796327,ncPhaseY=mod(nc.x-ncCell.y-2.,4.)*1.570796327;
float ncHeight=mix(ncCrossY*(.78+.22*sin(ncPhaseY)),ncCrossX*(.78+.22*sin(ncPhaseX)),ncWarp);
float ncVisibility=1.-smoothstep(.30,1.15,max(fwidth(nc.x),fwidth(nc.y)));ncHeight=mix(.50,ncHeight,ncVisibility);
float ncMax=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b)),ncMin=min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b));
float ncMask=${hasTexture?'(1.-nativeSmooth(.008,.045,ncMax))*(1.-nativeSmooth(.10,.40,(ncMax-ncMin)/max(ncMax,.0001)))':'1.'};
vec3 ncColour=mix(vec3(${low}),vec3(${high}),clamp((ncHeight-.06)/.90,0.,1.));
diffuseColor.rgb=mix(diffuseColor.rgb,ncColour,ncMask);
float ncBump=ncHeight*ncMask*.0000077;
`;
   rough+='roughnessFactor=mix(.28,.34+.08*(1.-ncHeight),ncMask);\n';
   bump=`vec3 nbDX=dFdx(-vViewPosition),nbDY=dFdy(-vViewPosition),nbR1=cross(nbDY,normal),nbR2=cross(normal,nbDX);float nbDet=dot(nbDX,nbR1);normal=normalize(normal-(nbR1*dFdx(ncBump)+nbR2*dFdy(ncBump))*sign(nbDet)/max(abs(nbDet),1.e-12));\n`;
   // Coating remains smooth while the fabric below retains its micro normal.
  }
  if(webbing){surface+=`vec2 nf=vNativeFabric*vec2(86.,940.);float nfFade=1.-smoothstep(.3,1.,max(fwidth(nf.x),fwidth(nf.y)));float nfWeave=sin(nf.x*6.2831853)*sin(nf.y*6.2831853)*nfFade;diffuseColor.rgb*=1.+.045*nfWeave;\n`;}
  if(portable){const p=portable.definition;surface+=`vec3 np=vNativePosition/${p.grainLengthMetres||.00065};float npFade=1.-smoothstep(.3,1.2,max(max(fwidth(np.x),fwidth(np.y)),fwidth(np.z)));float npGrain=sin(dot(np,vec3(1.7,2.3,.9)))*sin(dot(np,vec3(.8,-1.1,1.9)))*npFade;\n`;rough+=`roughnessFactor=clamp(roughnessFactor+npGrain*${p.grainRoughnessAmplitude||.02},.04,1.);\n`;}
  if(grain){
   const scale=grain.inputs?.Scale||1300,range=grain.ranges?.[0]?.to;
   surface+=`vec3 ng=vNativePosition*${Number(scale).toFixed(4)};float ngFade=1.-smoothstep(.4,1.5,max(max(fwidth(ng.x),fwidth(ng.y)),fwidth(ng.z)));float ngNoise=mix(.5,nativeNoise(ng)*.75+nativeNoise(ng*2.)*.25,ngFade);\n`;
   rough+=range?(faces?`roughnessFactor=clamp(roughnessFactor+(ngNoise-.5)*${range[1]-range[0]},.04,1.);\n`:`roughnessFactor=mix(${range[0]},${range[1]},ngNoise);\n`):'roughnessFactor=clamp(roughnessFactor+(ngNoise-.5)*.07,.04,1.);\n';
  }
  if(hasTexture&&carbon)surface+='diffuseColor.rgb=mix(vec3(.014,.016,.018),diffuseColor.rgb,smoothstep(.03,.12,opacity));\n';
  if(faces){surface+='diffuseColor.a*=vNativeFacePbr.z;\n';rough='roughnessFactor=vNativeFacePbr.y;\n'+rough;shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=vNativeFacePbr.x;');shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',T.ShaderChunk.lights_physical_fragment.replace('material.clearcoat = clearcoat;','material.clearcoat = vNativeFacePbr.w;').replace('material.clearcoatRoughness = clearcoatRoughness;','material.clearcoatRoughness = vNativeCoatRoughness;'));}
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+surface);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n'+rough);
  if(bump)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+bump);
  if(aniso){
   const fallback='mat3(normalize(cross(abs(normal.z)<.9?vec3(0,0,1):vec3(0,1,0),normal)),normalize(cross(normal,normalize(cross(abs(normal.z)<.9?vec3(0,0,1):vec3(0,1,0),normal)))),normal)';
   const frame=carbon?'getTangentFrame(-vViewPosition,normal,vNativeWeave)':fallback;
   // Narrow CAD caps can have collapsed weave UVs. A zero tangent reaches
   // the anisotropic IBL normal calculation even when the body is ghosted,
   // contaminating the composite with NaNs. Keep a finite orthogonal frame.
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n#ifdef USE_ANISOTROPY\ntbn='+frame+';\nif(!(dot(tbn[0],tbn[0])>1.e-8)||!(dot(tbn[1],tbn[1])>1.e-8))tbn='+fallback+';\n#endif');
   let physical=T.ShaderChunk.lights_physical_fragment;
   if(carbon)physical=physical.replace('material.anisotropy = length( anisotropyV );','anisotropyV=.35*ncMask*ncVisibility*ncVisibility*vec2(cos(ncWarp*1.570796327),sin(ncWarp*1.570796327));\nmaterial.anisotropy = length( anisotropyV );');
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',physical);
  }
  nativeWindowShader(shader,state);
 };
 material.customProgramCacheKey=()=>`blender-native-756/${previousKey}/${carbon?'carbon'+(hasTexture?'-paint':''):''}/${webbing?'woven':''}/${grain?JSON.stringify([grain.inputs?.Scale,grain.ranges]):''}/${portable?JSON.stringify([portable.definition,portableAttribute]):''}/${aniso?'aniso':''}/${state?'window':''}/${faces?'facets':''}`;
}

export function createBlenderMaterials(renderer,{root='./assets/native-blender-756/',environment=()=>null}={}){
 const url=name=>new URL(root+name,import.meta.url).href;
 let report,loading;const images=new Map(),byId=new Map(),byName=new Map(),owned=new Set(),facetCache=new Map();
 const loader=new T.TextureLoader();
 const ready=()=>loading??=loadJSON(url('runtime-materials.json')).then(async data=>{
  report=data;for(const object of data.objects){byId.set(`${object.sourceKey}:${object.sourceId}`,object);byName.set(`${object.sourceKey}:${object.objectName}`,object);}
  const results=await Promise.allSettled(Object.entries(data.textures).map(async([id,definition])=>{const texture=await loadTexture(loader,url(definition.path));texture.name=definition.name;texture.colorSpace=definition.colorSpace==='sRGB'?T.SRGBColorSpace:T.NoColorSpace;texture.flipY=true;texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;images.set(id,texture);}));
  const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;return report;
 }).catch(error=>{for(const texture of images.values())texture.dispose();images.clear();byId.clear();byName.clear();report=null;loading=null;throw error;});
 function make(id,options={}){
  const d=report?.materials[id];if(!d)throw new Error(`Native material missing: ${id}`);
  const p=d.principled[0]?.parameters||{},channels=d.principled[0]?.channels||{},source=d.source_pbr;
  const imageId=channels.baseColor?.textureIds?.[0]||d.textureBindings?.[0]?.textureId;
  const map=imageId?images.get(imageId):null;
  const m=new T.MeshPhysicalMaterial({name:d.name,color:map?new T.Color(1,1,1):color(p.baseColor,d.diffuseColorLinear),metalness:scalar(p.metalness,.0),roughness:scalar(p.roughness,.4),ior:scalar(p.ior,1.5),clearcoat:scalar(p.coatWeight,0),clearcoatRoughness:scalar(p.coatRoughness,.3),specularIntensity:scalar(p.specularIorLevel,.5)*2,specularColor:color(p.specularTint,[1,1,1]),emissive:color(p.emissionColor,[0,0,0]),emissiveIntensity:scalar(p.emissionStrength,0),opacity:scalar(p.alpha,1),transparent:true,side:d.backfaceCulling?T.FrontSide:(source?.side??T.DoubleSide),map,envMap:environment(),envMapIntensity:source?.envMapIntensity??.85});
  m.forceSinglePass=true;
  m.anisotropy=scalar(p.anisotropy,0);m.anisotropyRotation=scalar(p.anisotropyRotation,0)*Math.PI*2;
  if(map&&(d.properties?.brand_asset)){m.alphaTest=.025;m.depthWrite=false;}
  m.userData={...(source?.userData||{}),blenderNativeMaterial:id,blenderMaterialName:d.name};
  if(d.procedural?.some(r=>r.kind==='c41_twill_2x2')){m.userData.c41Livery={version:756,source:'Blender',coordinates:'native-uv'};if(map)m.side=T.FrontSide;}
  if(options.geometry?.getAttribute('color'))m.vertexColors=true;
  surfaceShader(m,d,options);owned.add(m);return m;
 }
 function binding(mesh,sourceKey){const id=mesh.userData.id||mesh.userData.sourceId||mesh.name;return byId.get(`${sourceKey}:${id}`)||byName.get(`${sourceKey}:${mesh.name}`);}
 function apply(mesh,sourceKey='c41'){
  const object=binding(mesh,sourceKey);if(!object?.materialSlots.length)return false;
  const slots=object.materialSlots;let geometry=mesh.geometry,material;
  if(slots.length>1&&object.triangleRanges?.length){
   // Native face finishes use one draw; per-corner attributes preserve sharp
   // material boundaries and avoid hundreds of additional cell draw calls.
   const key=geometry.uuid+'/'+slots.map(s=>s.materialId).join('/')+'/'+JSON.stringify(object.triangleRanges);
   let shaded=facetCache.get(key);
   if(!shaded){
    shaded=geometry.index?geometry.toNonIndexed():geometry.clone();const n=shaded.attributes.position.count;
    const colours=new Float32Array(n*3),pbr=new Float32Array(n*4),coatRoughness=new Float32Array(n);
    for(const [first,count,slot]of object.triangleRanges){const mid=slots.find(s=>s.slotIndex===slot)?.materialId||slots[0].materialId,d=report.materials[mid],p=d.principled[0]?.parameters||{},c=p.baseColor||d.diffuseColorLinear;
     for(let v=first*3;v<(first+count)*3&&v<n;v++){colours.set(c.slice(0,3),v*3);pbr.set([p.metalness??0,p.roughness??.4,p.alpha??1,p.coatWeight??0],v*4);coatRoughness[v]=p.coatRoughness??.3;}
    }
    shaded.setAttribute('color',new T.BufferAttribute(colours,3));shaded.setAttribute('nativeFacePbr',new T.BufferAttribute(pbr,4));shaded.setAttribute('nativeCoatRoughness',new T.BufferAttribute(coatRoughness,1));shaded.clearGroups();facetCache.set(key,shaded);
   }
   mesh.geometry=geometry=shaded;material=make(slots[0].materialId,{geometry});material.color.setRGB(1,1,1);material.vertexColors=true;material.clearcoat=Math.max(...slots.map(s=>report.materials[s.materialId].principled[0]?.parameters.coatWeight||0));
  }else material=make(slots[0].materialId,{geometry});
  mesh.material=material;
  const data=mesh.userData;data.blenderNativeMaterial=true;data.baseColor=material.color.clone();data.contextColor=material.color.clone().lerp(new T.Color('#85877f'),.58);data.baseMetal=material.metalness;data.baseRoughness=material.roughness;
  if(material.userData.nativeWindowUniforms){data.nativeWindowUniforms=material.userData.nativeWindowUniforms;data.window=material.userData.nativeWindow;mesh.renderOrder=4;}
  return true;
 }
 return {ready,make,apply,binding,get report(){return report;},dispose(){owned.forEach(m=>m.dispose());images.forEach(t=>t.dispose());facetCache.forEach(g=>g.dispose());}};
}
