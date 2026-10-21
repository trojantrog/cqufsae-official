import * as T from './vendor/three.module.min.js';
import {createFuelLiquid} from './fuel-liquid-769.js?v=769.4';
import {createExhaustVolume} from './exhaust-volume-769.js?v=774';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
const smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const materials=m=>Array.isArray(m)?m:[m];
const id=n=>'c41-engine-update-'+String(n).padStart(3,'0');
const tankShellIds=[170,172],tankBaffleIds=[171,179,181,185],silencerIds=[3,4,5,6];

// All dimensions below are in the original part-local metre coordinates.
// The tank's low liquid volume lies inside the two real folded metal shells.
// The connected free surface lies over the four existing perforated plates.
const tank={x0:-.0825,x1:.0825,z0:.0035,z1:.1765,bottom:-.0583,level:-.030,
 left:-.05425,right:.05425,front:.0534394,rear:.1265606};
function sourceRest(mesh){return new T.Matrix4().fromArray(mesh.userData.nativeRestMatrix||mesh.userData.installationMatrix||mesh.matrix.toArray());}
function cloneFinish(source){
 const clone=source.clone();clone.onBeforeCompile=source.onBeforeCompile;clone.customProgramCacheKey=source.customProgramCacheKey;return clone;
}
function halfWindowGLSL(n,centre,bounds,radius){
 const c='vec3('+centre.toArray().map(x=>x.toFixed(7)).join(',')+')';
 const b0='vec3('+bounds.min.toArray().map(x=>x.toFixed(7)).join(',')+')',b1='vec3('+bounds.max.toArray().map(x=>x.toFixed(7)).join(',')+')';
 const cylindrical=n===3||n===4||n===5;
 return `uniform float powertrainReveal;uniform float fuelImpactTime;uniform vec3 powertrainCameraLocal;varying vec3 vPowertrainLocal;
 float powertrainWindow(vec3 powertrainNormal,vec3 powertrainView){
  vec3 powertrainCentre=${c},powertrainDirection=powertrainCameraLocal-powertrainCentre;
  ${cylindrical?'powertrainDirection.x=0.;':'powertrainDirection.y=0.;'}
  powertrainDirection=normalize(powertrainDirection+vec3(.0000001));
  float powertrainSide=dot(vPowertrainLocal-powertrainCentre,powertrainDirection)/${radius.toFixed(7)};
  float powertrainNear=smoothstep(0.,.090,powertrainSide);
  float powertrainRim=1.-smoothstep(.14,.40,abs(dot(powertrainNormal,normalize(powertrainView))));
  ${cylindrical?`float powertrainEnds=1.-smoothstep(.004,.012,min(vPowertrainLocal.x-(${bounds.min.x.toFixed(7)}),(${bounds.max.x.toFixed(7)})-vPowertrainLocal.x));
  ${n===3?'float powertrainSupport=step(.0615,length(vPowertrainLocal.yz));':'float powertrainSupport=0.;'}
  return powertrainNear*(1.-max(powertrainRim,max(powertrainEnds,powertrainSupport)));`:
  `vec3 powertrainEdge=min(abs(vPowertrainLocal-${b0}),abs(${b1}-vPowertrainLocal));
  float powertrainSecond=max(min(powertrainEdge.x,powertrainEdge.y),min(max(powertrainEdge.x,powertrainEdge.y),powertrainEdge.z));
  float powertrainCorners=1.-smoothstep(.0012,.0035,powertrainSecond);
  return powertrainNear*(1.-max(powertrainRim,powertrainCorners));`}
 }
 `;
}

export function createPowertrainCutaway(meshes=[],{assembly=null,camera=null}={}){
 const byId=new Map(meshes.map(mesh=>[mesh.userData.id,mesh])),tankHost=byId.get(id(172)),mufflerHost=byId.get(id(3));
 const root=new T.Group();root.name='powertrain-cutaway-working';root.userData.illustrativeOverlay=true;root.visible=false;
 const resources=new Set(),own=x=>(resources.add(x),x),tankRoot=new T.Group(),exhaustRoot=new T.Group();root.add(tankRoot,exhaustRoot);
 const ready=!!tankHost&&!!mufflerHost&&[...tankShellIds,...tankBaffleIds,...silencerIds].every(n=>byId.has(id(n)));
 const scratch={matrix:new T.Matrix4(),inverse:new T.Matrix4(),object:new T.Object3D(),point:V(),axis:V(),quaternion:new T.Quaternion(),color:new T.Color()};
 const tankRest=tankHost?sourceRest(tankHost):new T.Matrix4(),tankInverse=tankRest.clone().invert();
 const entries=[],uniforms={time:{value:0},amount:{value:0}};
 const contextDepthEntries=meshes.filter(mesh=>['body','frame'].includes(mesh.userData.group)).map(source=>({source,active:false,present:Object.hasOwn(source.userData,'detailOpacity'),value:source.userData.detailOpacity}));
 let disposed=false,amount=0,state={active:false,amount:0,time:0},lastTime=null;
 const holes=[];
 for(const n of [171,179])for(const x of [0,-.0295,.0255,-.0685,.0645]){
  const source=byId.get(id(n));if(!source)continue;
  const relative=tankInverse.clone().multiply(sourceRest(source)),point=V(x,.0025,-.00075).applyMatrix4(relative),axis=V(0,0,1).transformDirection(relative);
  holes.push({point,axis,phase:holes.length*.83});
 }
 for(const n of [181,185])for(const z of [-.015,.015]){
  const source=byId.get(id(n));if(!source)continue;
  const relative=tankInverse.clone().multiply(sourceRest(source)),point=V(-.00075,.005,z).applyMatrix4(relative);holes.push({point,axis:V(1,0,0).transformDirection(relative),phase:holes.length*.83});
 }
 const tankFinish=tankHost?materials(tankHost.material)[0]:null;
 const fuel=createFuelLiquid({tank,holes,environment:tankFinish?.envMap,environmentRotation:tankFinish?.envMapRotation}),gas=createExhaustVolume({camera});
 tankRoot.add(fuel.root);exhaustRoot.add(gas.root);
 const items=[...fuel.items,...gas.items];

 // A private material retains the original texture, grain and studio response.
 // Removing this view restores the exact original material object and metadata.
 for(const [numbers,nearAlpha]of [[tankShellIds,.10],[[3],.08],[[4,5],.12]])for(const n of numbers){
  const source=byId.get(id(n));if(!source)continue;
  source.geometry.computeBoundingBox();
  const centre=n===3?V(.2,0,0):source.geometry.boundingBox.getCenter(V());
  const view={value:V()},reveal={value:0},radius=Math.max(.02,source.geometry.boundingBox.getSize(V()).length()*.5);
  const original=source.material,windowClones=[];
  const clones=materials(original).map(material=>{
   const baseCompile=material.onBeforeCompile,baseKey=material.customProgramCacheKey.bind(material);
   function configured(window){
    const clone=own(cloneFinish(material));
    clone.onBeforeCompile=(shader,renderer)=>{
     baseCompile.call(clone,shader,renderer);shader.uniforms.powertrainReveal=reveal;shader.uniforms.powertrainCameraLocal=view;shader.uniforms.fuelImpactTime=uniforms.time;
     shader.vertexShader='varying vec3 vPowertrainLocal;\n'+shader.vertexShader;
     shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPowertrainLocal=position;');
     shader.fragmentShader=halfWindowGLSL(n,centre,source.geometry.boundingBox,radius)+shader.fragmentShader;
     shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float powertrainOpen=powertrainWindow(normal,vViewPosition);
      ${window?`if(powertrainOpen<=.0001)discard;diffuseColor.a*=mix(1.,${nearAlpha.toFixed(3)},powertrainReveal*powertrainOpen);`:'if(powertrainOpen>.0001)discard;'}
      #include <opaque_fragment>`);
    };
    clone.customProgramCacheKey=()=>baseKey()+'-powertrain-half-768-3.1-'+n+'-'+window;return clone;
   }
   windowClones.push(configured(true));return configured(false);
  });
  const window=new T.Mesh(source.geometry,Array.isArray(original)?windowClones:windowClones[0]);window.name='powertrain-half-window-'+id(n);window.visible=false;window.castShadow=false;window.receiveShadow=true;window.renderOrder=6;window.userData.windowSource=source;root.add(window);
  entries.push({source,window,windowClones,original,clones,reveal,view,centre,nearAlpha,active:false,renderOrder:source.renderOrder,detailPresent:Object.hasOwn(source.userData,'detailOpacity'),detailOpacity:source.userData.detailOpacity,preReveal:[],preShadow:source.castShadow});
 }
 function restore(entry,livePresentation=true){
  if(!entry.active)return;
  for(let i=0;i<entry.clones.length;i++){
   const clone=entry.clones[i],original=materials(entry.original)[i];
   // These values have just been set by the parent presentation for this frame.
   const incoming=livePresentation?clone:entry.preReveal[i];
   original.opacity=incoming.opacity;original.transparent=incoming.transparent;original.depthWrite=incoming.depthWrite;
   original.color?.copy(clone.color);original.emissive?.copy(clone.emissive);original.emissiveIntensity=clone.emissiveIntensity;
   original.metalness=clone.metalness;original.roughness=clone.roughness;original.clippingPlanes=clone.clippingPlanes;original.clipIntersection=clone.clipIntersection;
   original.needsUpdate=true;
  }
  entry.source.material=entry.original;entry.source.renderOrder=entry.renderOrder;
  entry.window.visible=false;
  if(!livePresentation)entry.source.castShadow=entry.preShadow;
  if(entry.detailPresent)entry.source.userData.detailOpacity=entry.detailOpacity;else delete entry.source.userData.detailOpacity;
  entry.active=false;
 }
 function revealSources(value){
  for(const entry of entries){
   if(value<=1e-7){restore(entry);continue;}
   if(!entry.active){
    materials(entry.original).forEach((material,i)=>{entry.clones[i].copy(material);entry.windowClones[i].copy(material);});
    entry.source.material=Array.isArray(entry.original)?entry.clones:entry.clones[0];entry.active=true;
   }
   entry.reveal.value=value;
   if(camera){entry.source.updateWorldMatrix(true,false);camera.getWorldPosition(entry.view.value).applyMatrix4(scratch.inverse.copy(entry.source.matrixWorld).invert());}
   else entry.view.value.copy(entry.centre).add(V(0,.5,.5));
   entry.preShadow=entry.source.castShadow;
   for(let i=0;i<entry.clones.length;i++){
    const clone=entry.clones[i],window=entry.windowClones[i];entry.preReveal[i]={opacity:clone.opacity,transparent:clone.transparent,depthWrite:clone.depthWrite};
    window.opacity=clone.opacity;window.color.copy(clone.color);window.emissive.copy(clone.emissive);window.emissiveIntensity=clone.emissiveIntensity;window.metalness=clone.metalness;window.roughness=clone.roughness;window.clippingPlanes=clone.clippingPlanes;window.clipIntersection=clone.clipIntersection;
    clone.transparent=true;clone.depthWrite=true;clone.forceSinglePass=true;window.transparent=true;window.depthWrite=false;window.forceSinglePass=true;
   }
   entry.window.visible=entry.source.visible&&entry.clones[0].visible&&entry.clones[0].opacity>.002;entry.window.userData.defocusWeight=entry.source.userData.defocusWeight??0;
   entry.source.castShadow=false;entry.source.renderOrder=entry.renderOrder;entry.source.userData.detailOpacity=.25;
  }
 }
 function contextDepth(active){
  for(const entry of contextDepthEntries){
   const source=entry.source,material=materials(source.material)[0],bypass=active&&material?.opacity<.06;
   if(bypass){source.userData.detailOpacity=.05;entry.active=true;}
   else if(entry.active){if(entry.present)source.userData.detailOpacity=entry.value;else delete source.userData.detailOpacity;entry.active=false;}
  }
 }
 function followSource(target,source){
  if(!source)return;source.updateWorldMatrix(true,false);root.updateWorldMatrix(true,false);
  scratch.inverse.copy(root.matrixWorld).invert();scratch.matrix.copy(scratch.inverse).multiply(source.matrixWorld);scratch.matrix.decompose(target.position,target.quaternion,target.scale);
 }
 function update(motion={},focus=[],exploded=0){
  if(disposed)return diagnostics();
  const time=Number.isFinite(motion.conditionTime)?motion.conditionTime:Number.isFinite(motion.time)?motion.time:0;
  const weight=clamp(focus.reduce((sum,r)=>sum+(r.department==='power'&&!['e74','a08'].includes(r.variant)&&['power','engine'].includes(r.mode)?(r.mode==='engine'?1:.84)*(r.weight??1):0),0));
  const assemblyAlpha=clamp(motion.variants?.assemblyAlpha??1),target=ready?smooth(weight)*(1-smooth(exploded/.075))*assemblyAlpha:0;
  // The director already blends focus weights. A short local response smooths
  // direct mode changes while immediate exclusions restore all source surfaces.
  const dt=lastTime===null||time<lastTime?1/60:Math.min(.10,Math.max(0,time-lastTime));lastTime=time;
  const excluded=exploded>=.075||weight===0||!ready;
  amount=excluded?0:T.MathUtils.lerp(amount,target,1-Math.exp(-Math.max(dt,1/240)*11));
  if(Math.abs(amount-target)<.00005)amount=target;
  uniforms.amount.value=amount;uniforms.time.value=time;root.visible=amount>.0001;revealSources(root.visible?amount:0);contextDepth(root.visible);
  if(!root.visible){fuel.root.visible=false;gas.root.visible=false;for(const item of items)item.material.opacity=0;state={active:false,amount:0,time};return diagnostics();}
  followSource(tankRoot,tankHost);followSource(exhaustRoot,mufflerHost);
  for(const entry of entries)if(entry.active)followSource(entry.window,entry.source);
  const fuelAlpha=amount*clamp(tankHost.visible&&materials(tankHost.material)[0].visible!==false?materials(tankHost.material)[0].opacity:0);
  const exhaustAlpha=amount*clamp(mufflerHost.visible&&materials(mufflerHost.material)[0].visible!==false?materials(mufflerHost.material)[0].opacity:0);
  fuel.update(motion,{alpha:fuelAlpha,defocusWeight:tankHost.userData.defocusWeight??0});
  gas.update(motion,{alpha:exhaustAlpha,defocusWeight:mufflerHost.userData.defocusWeight??0});
  root.updateMatrixWorld(true);state={active:true,amount,time,liquidSurface:fuel.diagnostics().liquidSurface,poseWeight:clamp(motion.poseMotionWeight??1)};return diagnostics();
 }
 const anchors={tank:V(0,-.024,.090),baffles:V(.05425,-.022,.090),silencer:V(.214,0,0),outlet:V(.415,-.015,.026)};
 function labels(request={}){
  if(!state.active||amount<.08||request.department&&request.department!=='power'||['e74','a08'].includes(request.variant)||request.mode&&!['power','engine'].includes(request.mode))return [];
  tankRoot.updateWorldMatrix(true,false);exhaustRoot.updateWorldMatrix(true,false);
  return [{id:'fuel-baffles-768',text:'防荡板减小燃油晃动',point:anchors.baffles.clone().applyMatrix4(tankRoot.matrixWorld),opacity:amount},
   {id:'muffler-chambers-768',text:'穿孔管与消声腔',point:anchors.silencer.clone().applyMatrix4(exhaustRoot.matrixWorld),opacity:amount}];
 }
 function diagnostics(){const f=fuel.diagnostics(),g=gas.diagnostics();return {...state,appearanceRevision:769,ready:ready&&!disposed,windowPolicy:'camera-facing-half; opaque-far-half; complete-ends-and-contour',gasColourMode:'automatic-thermal-gradient',tankShells:tankShellIds.map(id),tankBaffles:tankBaffleIds.map(id),silencer:silencerIds.map(id),liquidRegions:f.liquidRegions,baffleInfluenceCount:f.baffleInfluenceCount,exchangeHoles:holes.length,forceVectors:0,extraDrawCalls:4+entries.length,sourceGeometryModified:false,originalMaterialsRestored:entries.every(entry=>!entry.active&&entry.source.material===entry.original)&&contextDepthEntries.every(entry=>!entry.active),sourceMaterialWindows:entries.filter(entry=>entry.active).length,transparentContextDepthBypassed:contextDepthEntries.filter(entry=>entry.active).length,liquidLevelLocal:f.liquidLevelLocal,liquidBottomLocal:f.liquidBottomLocal,displayOpacity:{liquid:fuel.items[1].material.opacity,gas:gas.items[0].material.opacity},fuel:f,gas:g,cameraSupplied:!!camera};}
 return {root,update,labels,anchors,diagnostics,items,
  dispose(){if(disposed)return;disposed=true;fuel.dispose();gas.dispose();for(const entry of entries)restore(entry,false);contextDepth(false);for(const resource of resources)resource.dispose();resources.clear();root.clear();root.removeFromParent();state.active=false;state.amount=0;}
 };
}
