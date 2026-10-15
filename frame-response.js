import * as T from './vendor/three.module.min.js';

const V=(...a)=>new T.Vector3(...a),clamp=x=>T.MathUtils.clamp(x,0,1),signed=x=>T.MathUtils.clamp(x,-1,1),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const stops=[['#2458d4',0],['#16bace',.28],['#64c778',.48],['#f0d74f',.68],['#ec8a35',.84],['#cf3933',1]];
export const FRAME_RESPONSE_LEGEND=Object.freeze({title:'相对应力 / 载荷响应',minimum:'低',maximum:'高',unit:'relative',stops:stops.map(([color,value])=>({color,value}))});
const framePart=m=>m?.isMesh&&m.geometry?.attributes.position&&m.userData.group==='frame'&&m.userData.mechanism==='fr-frame'&&!['e74','a08'].includes(m.userData.variant);
const materialList=m=>Array.isArray(m.material)?m.material:[m.material];
const isFinite=Number.isFinite;

// A continuous load-response colour field on the unchanged installed C41
// surfaces. Steering side load, braking and independent wheel travel supply
// its only varying inputs. There is no free-running colour/time oscillator.
export function createFrameResponse(sources=[]){
 const root=new T.Group();root.name='frame-load-response';root.userData={illustrativeOverlay:true,partCounted:false};root.visible=false;
 const frames=sources.filter(framePart),cloud=[],bounds=new T.Box3(),patched=[],arrows=[];
 for(const mesh of frames){const p=mesh.geometry.attributes.position,stride=Math.max(1,Math.ceil(p.count/700));for(let i=0;i<p.count;i+=stride){const point=V().fromBufferAttribute(p,i);cloud.push(point);bounds.expandByPoint(point);}}
 const size=bounds.isEmpty()?V(2,.6,.8):bounds.getSize(V()),centre=bounds.isEmpty()?V():bounds.getCenter(V());
 const tyres=sources.filter(m=>m.userData.label==='轮胎'&&!['e74','a08'].includes(m.userData.variant)).sort((a,b)=>b.userData.center[0]-a.userData.center[0]);
 const anchors=Array.from({length:4},(_,i)=>{
  const wheel=tyres[i]?.userData.center||[i<2?.7:-.95,i%2?-.5:.5,.25],target=V(wheel[0]*.9,wheel[1]*.42,.28);
  let nearest=cloud[0]?.clone()||target,best=Infinity;for(const p of cloud){const distance=(p.x-target.x)**2+1.2*(p.y-target.y)**2+(p.z-target.z)**2;if(distance<best){best=distance;nearest=p.clone();}}
  return nearest;
 });
 const uniforms={amount:{value:0},lateral:{value:0},brake:{value:0},wheel:{value:new T.Vector4()},anchors:{value:anchors},
  boundsMin:{value:bounds.isEmpty()?V(-1,-.3,.1):bounds.min.clone()},boundsSize:{value:size.clone().max(V(.01,.01,.01))}};
 const palette=stops.map(([hex])=>new T.Color(hex));
 const colorGLSL=palette.map((c,i)=>`vec3 c${i}=vec3(${c.toArray().map(v=>v.toFixed(8)).join(',')});`).join('\n');
 const shaderCommon=`
uniform float frAmount,frLateral,frBrake;
uniform vec4 frWheel;
uniform vec3 frAnchors[4],frBoundsMin,frBoundsSize;
varying vec3 vFrameResponsePosition;
float frGaussian(vec3 p,vec3 c){vec3 d=(p-c)/vec3(.43,.25,.38);return exp(-dot(d,d));}
float frValue(vec3 p){
 float g0=frGaussian(p,frAnchors[0]),g1=frGaussian(p,frAnchors[1]),g2=frGaussian(p,frAnchors[2]),g3=frGaussian(p,frAnchors[3]);
 float y=clamp((p.y-(frBoundsMin.y+.5*frBoundsSize.y))/(.5*frBoundsSize.y),-1.,1.);
 float x=clamp((p.x-frBoundsMin.x)/frBoundsSize.x,0.,1.);
 float z=clamp((p.z-frBoundsMin.z)/frBoundsSize.z,0.,1.);
 float mount=max(max(g0,g1),max(g2,g3));
 float lateral=abs(frLateral)*(.30+.70*mount)*(.76-.24*frLateral*y)*(.75+.25*z);
 float braking=frBrake*(.22+.60*max(g0,g1)+.18*x*(1.-z));
 float wheel=max(max(abs(frWheel.x)*g0,abs(frWheel.y)*g1),max(abs(frWheel.z)*g2,abs(frWheel.w)*g3));
 return clamp(1.18*sqrt(lateral*lateral+braking*braking+.72*wheel*wheel),0.,1.);
}
vec3 frColour(float value){
 ${colorGLSL}
 if(value<.28)return mix(c0,c1,value/.28);
 if(value<.48)return mix(c1,c2,(value-.28)/.20);
 if(value<.68)return mix(c2,c3,(value-.48)/.20);
 if(value<.84)return mix(c3,c4,(value-.68)/.16);
 return mix(c4,c5,(value-.84)/.16);
}
`;
 for(const mesh of frames){
  const original=mesh.material,clones=materialList(mesh).map(material=>{
   const clone=material.clone(),previousCompile=material.onBeforeCompile.bind(material),previousKey=material.customProgramCacheKey();
   clone.onBeforeCompile=(shader,renderer)=>{
    previousCompile(shader,renderer);Object.assign(shader.uniforms,{frAmount:uniforms.amount,frLateral:uniforms.lateral,frBrake:uniforms.brake,frWheel:uniforms.wheel,frAnchors:uniforms.anchors,frBoundsMin:uniforms.boundsMin,frBoundsSize:uniforms.boundsSize});
    shader.vertexShader='varying vec3 vFrameResponsePosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vFrameResponsePosition=position;');
    shader.fragmentShader=shaderCommon+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb=mix(diffuseColor.rgb,frColour(frValue(vFrameResponsePosition)),frAmount);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\n metalnessFactor=mix(metalnessFactor,.035,frAmount);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=mix(roughnessFactor,.72,frAmount);');
   };
   clone.customProgramCacheKey=()=>previousKey+'/frame-load-response-746';clone.needsUpdate=true;return clone;
  });
  mesh.material=Array.isArray(original)?clones:clones[0];patched.push({mesh,original,clones});
 }
 for(let i=0;i<4;i++){
  const arrow=new T.ArrowHelper(V(0,0,1),anchors[i],.10,0xd07039,.025,.012);arrow.name='frame-mount-load-'+i;
  arrow.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();o.userData.illustrativeOverlay=true;o.userData.partCounted=false;});root.add(arrow);arrows.push(arrow);
 }
 let state={active:false,sourceParts:frames.length,relativePeak:0,conditionTime:0,inputs:{lateral:0,brake:0,wheel:[0,0,0,0]},geometryModified:false},disposed=false;
 function valueAt(point){
  const g=anchors.map(c=>{const x=(point.x-c.x)/.43,y=(point.y-c.y)/.25,z=(point.z-c.z)/.38;return Math.exp(-x*x-y*y-z*z);});
  const y=T.MathUtils.clamp((point.y-centre.y)/(size.y*.5||1),-1,1),x=clamp((point.x-(bounds.min.x||0))/(size.x||1)),z=clamp((point.z-(bounds.min.z||0))/(size.z||1));
  const lateral=Math.abs(uniforms.lateral.value)*(.30+.70*Math.max(...g))*(.76-.24*uniforms.lateral.value*y)*(.75+.25*z);
  const braking=uniforms.brake.value*(.22+.60*Math.max(g[0],g[1])+.18*x*(1-z)),wheel=Math.max(...g.map((v,i)=>Math.abs(state.inputs.wheel[i])*v));
  return clamp(1.18*Math.hypot(lateral,braking,Math.sqrt(.72)*wheel));
 }
 function update(focus=[],motion={},exploded=0){
  if(disposed)return diagnostics();const weight=focus.reduce((n,r)=>n+(r.department==='structure'&&r.mode==='frame'?r.weight:0),0),pose=clamp(isFinite(motion.poseMotionWeight)?motion.poseMotionWeight:1);
  const steering=motion.chassis?.steering,steer=isFinite(steering?.steer)?steering.steer:(motion.steer||0)*pose;
  const lateral=signed(isFinite(motion.lateralAcceleration)?motion.lateralAcceleration*pose/6:Math.tan(steer)/Math.tan(.16));
  const brake=clamp(isFinite(steering?.brake)?steering.brake:(motion.brake||0)*pose);
  const wheel=Array.from({length:4},(_,i)=>signed((motion.corners?.[i]?.travel||0)/.03));
  uniforms.amount.value=frames.length?smooth(weight)*(1-smooth(exploded/.08)):0;uniforms.lateral.value=lateral;uniforms.brake.value=brake;uniforms.wheel.value.set(...wheel);
  state={...state,active:uniforms.amount.value>.002,conditionTime:motion.conditionTime??0,inputs:{lateral,brake,wheel},amount:uniforms.amount.value};
  state.relativePeak=frames.length?Math.max(0,...anchors.map(valueAt)):0;root.visible=state.active;
  for(let i=0;i<4;i++){const force=V(-brake*.7,-lateral*.6,wheel[i]*.65),magnitude=force.length();arrows[i].visible=magnitude>.035;if(arrows[i].visible){arrows[i].setDirection(force.normalize());arrows[i].setLength(.05+.095*clamp(magnitude),.024,.011);arrows[i].setColor(new T.Color(brake>Math.abs(lateral)&&brake>Math.abs(wheel[i])?0xcf6835:0x526fa9));}}
  return diagnostics();
 }
 function diagnostics(){return {...state,ready:frames.length>0&&!disposed,unit:'relative',peakBasis:'load-anchor samples',legend:FRAME_RESPONSE_LEGEND,anchors:anchors.map(p=>p.toArray()),sourceVehicle:'c41',deformationMeters:0};}
 return {root,items:frames,update,prepare:async()=>diagnostics(),diagnostics,valueAt,
  framingPoints(){return [];},
  labels(request={}){return state.active&&request.department==='structure'&&request.mode==='frame'?[{text:'相对应力 / 载荷响应',point:cloud.reduce((a,p)=>p.z>a.z?p:a,anchors[0]).clone().add(V(0,0,.055))}]:[];},
  dispose(){if(disposed)return;disposed=true;state.active=false;uniforms.amount.value=0;root.visible=false;for(const {mesh,original,clones}of patched){if(materialList(mesh).every(m=>clones.includes(m)))mesh.material=original;clones.forEach(m=>m.dispose());}root.traverse(o=>{o.geometry?.dispose();if(o.material)materialList(o).forEach(m=>m.dispose());});root.clear();}
 };
}
