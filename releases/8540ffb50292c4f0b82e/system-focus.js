import * as T from './vendor/three.module.min.js';
import {createVehicleTransparency} from './vehicle-transparency.js?v=748';
import {createShaderPreparation,capturePrepareState,restorePrepareState} from './shader-prepare-754.js?v=754';
import {nativeWindowShader} from './native-window-756.js';
// Artwork controls surface colour. Its alpha still controls coverage, while
// every painted fragment shares the carrying surface's context weight.
function contextMaskShader(shader){
 shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',T.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;','diffuseColor.a *= sampledDiffuseColor.a;'));
 shader.fragmentShader=shader.fragmentShader.replace('#include <map_particle_fragment>',T.ShaderChunk.map_particle_fragment.replace('diffuseColor *= texture2D( map, uv );','diffuseColor.a *= texture2D( map, uv ).a;'));
}
// Preserve the original depth ordering. A second, inexpensive material pass
// marks visible context pixels; the working mechanism keeps the sharp image.
export function createSystemFocus(renderer,{maskScale=1,onPass}={}){
 const vehicleTransparency=createVehicleTransparency(),shaderPreparation=createShaderPreparation(renderer);
 const scale=Number.isFinite(maskScale)?Math.max(.25,Math.min(1,maskScale)):1;
 const options={type:T.HalfFloatType,depthBuffer:true,stencilBuffer:false};
 const colourTarget=()=>{const target=new T.WebGLRenderTarget(1,1,{...options,samples:4});target.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);return target;};
 let source=colourTarget(),mask=new T.WebGLRenderTarget(1,1,options),standby=null;
 const captureTargets=new Set();let lastStrength=0;
 const horizontal=new T.WebGLRenderTarget(1,1,{...options,depthBuffer:false}),vertical=horizontal.clone();
 const quadScene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
 const vertexShader='varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
 const blur=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{inputMap:{value:null},stepUV:{value:new T.Vector2()}},vertexShader,fragmentShader:`
  uniform sampler2D inputMap;uniform vec2 stepUV;varying vec2 vUv;
  void main(){vec4 c=texture2D(inputMap,vUv)*.227027;
   c+=(texture2D(inputMap,vUv+stepUV*1.384615)+texture2D(inputMap,vUv-stepUV*1.384615))*.316216;
   c+=(texture2D(inputMap,vUv+stepUV*3.230769)+texture2D(inputMap,vUv-stepUV*3.230769))*.070270;
   gl_FragColor=c;}`});
 const composite=new T.ShaderMaterial({depthTest:false,depthWrite:false,premultipliedAlpha:true,uniforms:{sharp:{value:source.texture},soft:{value:vertical.texture},focusMask:{value:mask.texture},amount:{value:1},outputOpacity:{value:1}},vertexShader,fragmentShader:`
  uniform sampler2D sharp,soft,focusMask;uniform float amount,outputOpacity;varying vec2 vUv;
  void main(){vec4 c=texture2D(sharp,vUv);
   if(amount>0.){vec4 m=texture2D(focusMask,vUv);float context=smoothstep(.32,.85,m.r/max(m.a,.0001));
    c=mix(c,texture2D(soft,vUv),context*amount);}
   gl_FragColor=vec4(c.rgb/max(c.a,.0001),c.a*outputOpacity);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   #include <premultiplied_alpha_fragment>
  }`});
 const captureMaterial=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{sharp:{value:null},soft:{value:null},focusMask:{value:null},amount:{value:0}},vertexShader,fragmentShader:`
  uniform sampler2D sharp,soft,focusMask;uniform float amount;varying vec2 vUv;
  void main(){vec4 c=texture2D(sharp,vUv),m=texture2D(focusMask,vUv);float context=smoothstep(.32,.85,m.r/max(m.a,.0001));gl_FragColor=mix(c,texture2D(soft,vUv),context*amount);}`});
 const quad=new T.Mesh(new T.PlaneGeometry(2,2),blur);quad.frustumCulled=false;quadScene.add(quad);
 const cache=new WeakMap(),owned=new Set();let width=0,height=0,warming=0,disposed=false;
 const measure=(label,draw)=>typeof onPass==='function'?onPass(label,draw):draw();
 const excluded=new Set(['moving-road-surface','aerodynamic-streamlines','autonomous-perception-demonstration','operations-vis-mark']);
 function particleSurface(object){
  if(!object.isMesh||object.material?.isShadowMaterial)return false;let vehicle=false;
  for(let node=object;node;node=node.parent){if(excluded.has(node.name)||node.userData.illustrativeOverlay)return false;if(node.name==='shared-vehicle-study'||node.name==='blender-native-c41-geometry')vehicle=true;}
  return vehicle;
 }
 function pass(label,target,material){return measure(label,()=>{quad.material=material;renderer.setRenderTarget(target);renderer.clear();renderer.render(quadScene,camera);});}
 function sizeTargets(){
  const size=renderer.getDrawingBufferSize(new T.Vector2()),w=Math.max(1,size.x),h=Math.max(1,size.y);
  if(w!==width||h!==height){width=w;height=h;source.setSize(width,height);mask.setSize(Math.max(1,Math.ceil(width*scale)),Math.max(1,Math.ceil(height*scale)));horizontal.setSize(Math.ceil(width/2),Math.ceil(height/2));vertical.setSize(Math.ceil(width/2),Math.ceil(height/2));}
 }
 function maskFor(o,original=o.material){
  // Flow ribbons need the same projected width, packet alpha and moving phase
  // in the focus mask; a plain material would draw their unit quad at origin.
  if(o.userData.nativeFocusMask){const mask=o.userData.nativeFocusMask;mask.visible=original.visible;return mask;}
  let material=cache.get(original);
  if(!material){
   material=o.isPoints?new T.PointsMaterial({size:original.size,sizeAttenuation:original.sizeAttenuation}):o.isLine?new T.LineBasicMaterial():new T.MeshBasicMaterial();
   const nativeWindow=original.userData.nativeWindowUniforms,springPatch=o.userData.nativeMaskVertexPatch;
   material.onBeforeCompile=shader=>{contextMaskShader(shader);nativeWindowShader(shader,nativeWindow);springPatch?.(shader);};
   material.customProgramCacheKey=()=> 'system-focus-alpha-mask-756/'+(nativeWindow?'window':'')+'/'+(o.userData.nativeMaskVertexKey||'');cache.set(original,material);owned.add(material);
  }
  const context=o.userData.defocusWeight??(o.userData.defocus?1:0);material.color.setRGB(context,particleSurface(o)?1:0,0);
  if(material.transparent!==original.transparent){material.transparent=original.transparent;material.needsUpdate=true;}
  material.visible=original.visible;material.opacity=original.opacity;material.depthWrite=original.depthWrite;material.depthTest=original.depthTest;material.side=original.side;material.forceSinglePass=original.forceSinglePass;
  material.map=original.map||null;material.alphaMap=original.alphaMap||null;material.alphaTest=original.alphaTest;
  material.clippingPlanes=original.clippingPlanes;material.clipIntersection=original.clipIntersection;material.toneMapped=false;return material;
 }
 function renderFrame(scene,view,strength){
  lastStrength=strength;
  sizeTargets();
  measure('color',()=>{renderer.setRenderTarget(source);renderer.clear();renderer.render(scene,view);});
  const triangles=renderer.info.render.triangles,colorCalls=renderer.info.render.calls;
  if(strength<.001){composite.uniforms.amount.value=0;pass('composite',null,composite);return {triangles,colorCalls,maskTriangles:0,maskCalls:0,maskWidth:0,maskHeight:0};}
  const restore=[];
  scene.traverseVisible(o=>{
   if(!(o.isMesh||o.isLine||o.isPoints)||!o.material||Array.isArray(o.material))return;
   const original=o.material,material=maskFor(o,original);
   restore.push([o,original]);o.material=material;
  });
  const shadowAutoUpdate=renderer.shadowMap.autoUpdate,shadowNeedsUpdate=renderer.shadowMap.needsUpdate;
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
  try{measure('mask',()=>{renderer.setRenderTarget(mask);renderer.clear();renderer.render(scene,view);});}finally{restore.forEach(([o,m])=>o.material=m);renderer.shadowMap.autoUpdate=shadowAutoUpdate;renderer.shadowMap.needsUpdate=shadowNeedsUpdate;}
  const maskTriangles=renderer.info.render.triangles,maskCalls=renderer.info.render.calls;
  const pixelRadius=renderer.getPixelRatio()*strength;
  blur.uniforms.inputMap.value=source.texture;blur.uniforms.stepUV.value.set(pixelRadius/width,0);pass('blurH',horizontal,blur);
  blur.uniforms.inputMap.value=horizontal.texture;blur.uniforms.stepUV.value.set(0,pixelRadius/height);pass('blurV',vertical,blur);
  composite.uniforms.amount.value=Math.min(1,strength);pass('composite',null,composite);
  return {triangles,colorCalls,maskTriangles,maskCalls,maskWidth:mask.width,maskHeight:mask.height};
 }
 function render(scene,view,strength,outputOpacity=1){composite.uniforms.outputOpacity.value=outputOpacity;if(warming||disposed)return {warming:!!warming,triangles:0,colorCalls:0,maskTriangles:0,maskCalls:0,maskWidth:0,maskHeight:0};try{return vehicleTransparency.render(scene,()=>renderFrame(scene,view,strength));}catch(error){try{renderer.setRenderTarget(null);}catch{}throw error;}}
 function prepareCaptureBuffers(){
  if(!standby){standby={source:colourTarget(),mask:new T.WebGLRenderTarget(1,1,options),image:new T.WebGLRenderTarget(1,1,{...options,depthBuffer:false})};Object.values(standby).forEach(t=>captureTargets.add(t));}
  standby.source.setSize(width,height);standby.mask.setSize(mask.width,mask.height);standby.image.setSize(width,height);Object.values(standby).forEach(t=>renderer.initRenderTarget(t));
 }
 function captureVisible(scene,view){
  const saved=capturePrepareState(renderer),oldQuad=quad.material;prepareCaptureBuffers();
  try{
   // The overview normally skips its focus mask. Capture eligibility once,
   // preserving the actual visible alpha and excluding flow, road and labels.
   if(lastStrength<.001){const restore=[];vehicleTransparency.render(scene,()=>{
    scene.traverseVisible(o=>{if((o.isMesh||o.isLine||o.isPoints)&&o.material&&!Array.isArray(o.material)){restore.push([o,o.material]);o.material=maskFor(o,o.material);}});
    renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
    try{renderer.setRenderTarget(mask);renderer.clear();renderer.render(scene,view);}finally{restore.forEach(([o,m])=>o.material=m);}
   });}
   const u=captureMaterial.uniforms;u.sharp.value=source.texture;u.soft.value=vertical.texture;u.focusMask.value=mask.texture;u.amount.value=Math.min(1,lastStrength);pass('capture',standby.image,captureMaterial);
   const frozen={source,mask,image:standby.image},camera=view.clone();camera.matrixWorld.copy(view.matrixWorld);camera.matrixWorldInverse.copy(view.matrixWorldInverse);
   source=standby.source;mask=standby.mask;standby=null;composite.uniforms.sharp.value=source.texture;composite.uniforms.focusMask.value=mask.texture;
   let released=false;return {colour:frozen.source.texture,depth:frozen.source.depthTexture,mask:frozen.mask.texture,image:frozen.image.texture,width,height,camera,
    dispose(){if(released)return;released=true;if(!standby)standby=frozen;else Object.values(frozen).forEach(t=>{captureTargets.delete(t);t.dispose();});}};
  }finally{quad.material=oldQuad;restorePrepareState(renderer,saved);}
 }
 async function prepare(scene,view){
  if(disposed)throw new Error('System focus disposed');warming++;
  const material=quad.material;
  try{
   const state=capturePrepareState(renderer);
   try{sizeTargets();for(const target of [source,mask,horizontal,vertical])renderer.initRenderTarget(target);prepareCaptureBuffers();}finally{restorePrepareState(renderer,state);}
   const blurScene=new T.Scene(),blurQuad=new T.Mesh(quad.geometry,blur);blurQuad.frustumCulled=false;blurScene.add(blurQuad);
   const compositeScene=new T.Scene(),compositeQuad=new T.Mesh(quad.geometry,composite);compositeQuad.frustumCulled=false;compositeScene.add(compositeQuad);
   return await shaderPreparation.prepare(scene,view,{maskFor,blurScene,blurCamera:camera,blurTarget:horizontal,compositeScene,compositeCamera:camera});
  }finally{quad.material=material;warming--;}
 }
 return {render,prepare,captureVisible,get warming(){return warming>0;},dispose(){disposed=true;shaderPreparation.dispose();new Set([source,mask,horizontal,vertical,...captureTargets,...Object.values(standby||{})]).forEach(t=>t.dispose());owned.forEach(m=>m.dispose());blur.dispose();composite.dispose();captureMaterial.dispose();quad.geometry.dispose();}};
}
