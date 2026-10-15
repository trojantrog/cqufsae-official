import * as T from './vendor/three.module.min.js';
import {createVehicleTransparency} from './vehicle-transparency.js?v=748';
// Preserve the original depth ordering. A second, inexpensive material pass
// marks visible context pixels; the working mechanism keeps the sharp image.
export function createSystemFocus(renderer,{maskScale=1,onPass}={}){
 const vehicleTransparency=createVehicleTransparency();
 const scale=Number.isFinite(maskScale)?Math.max(.25,Math.min(1,maskScale)):1;
 const options={type:T.HalfFloatType,depthBuffer:true,stencilBuffer:false};
 const source=new T.WebGLRenderTarget(1,1,{...options,samples:4}),mask=new T.WebGLRenderTarget(1,1,options);
 const horizontal=new T.WebGLRenderTarget(1,1,{...options,depthBuffer:false}),vertical=horizontal.clone();
 const quadScene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
 const vertexShader='varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
 const blur=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{inputMap:{value:null},stepUV:{value:new T.Vector2()}},vertexShader,fragmentShader:`
  uniform sampler2D inputMap;uniform vec2 stepUV;varying vec2 vUv;
  void main(){vec4 c=texture2D(inputMap,vUv)*.227027;
   c+=(texture2D(inputMap,vUv+stepUV*1.384615)+texture2D(inputMap,vUv-stepUV*1.384615))*.316216;
   c+=(texture2D(inputMap,vUv+stepUV*3.230769)+texture2D(inputMap,vUv-stepUV*3.230769))*.070270;
   gl_FragColor=c;}`});
 const composite=new T.ShaderMaterial({depthTest:false,depthWrite:false,premultipliedAlpha:true,uniforms:{sharp:{value:source.texture},soft:{value:vertical.texture},focusMask:{value:mask.texture},amount:{value:1}},vertexShader,fragmentShader:`
  uniform sampler2D sharp,soft,focusMask;uniform float amount;varying vec2 vUv;
  void main(){vec4 m=texture2D(focusMask,vUv);float context=smoothstep(.32,.85,m.r/max(m.a,.0001));
   vec4 c=mix(texture2D(sharp,vUv),texture2D(soft,vUv),context*amount);
   gl_FragColor=vec4(c.rgb/max(c.a,.0001),c.a);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   #include <premultiplied_alpha_fragment>
  }`});
 const quad=new T.Mesh(new T.PlaneGeometry(2,2),blur);quad.frustumCulled=false;quadScene.add(quad);
 const cache=new WeakMap(),owned=new Set();let width=0,height=0;
 const measure=(label,draw)=>typeof onPass==='function'?onPass(label,draw):draw();
 function pass(label,target,material){return measure(label,()=>{quad.material=material;renderer.setRenderTarget(target);renderer.clear();renderer.render(quadScene,camera);});}
 function renderFrame(scene,view,strength){
  if(strength<.001){measure('color',()=>{renderer.setRenderTarget(null);renderer.render(scene,view);});return {triangles:renderer.info.render.triangles,colorCalls:renderer.info.render.calls,maskTriangles:0,maskCalls:0,maskWidth:0,maskHeight:0};}
  const size=renderer.getDrawingBufferSize(new T.Vector2());
  if(size.x!==width||size.y!==height){width=size.x;height=size.y;source.setSize(width,height);mask.setSize(Math.max(1,Math.ceil(width*scale)),Math.max(1,Math.ceil(height*scale)));horizontal.setSize(Math.ceil(width/2),Math.ceil(height/2));vertical.setSize(Math.ceil(width/2),Math.ceil(height/2));}
  measure('color',()=>{renderer.setRenderTarget(source);renderer.clear();renderer.render(scene,view);});
  const triangles=renderer.info.render.triangles,colorCalls=renderer.info.render.calls;
  const restore=[];
  scene.traverseVisible(o=>{
   if(!(o.isMesh||o.isLine||o.isPoints)||!o.material||Array.isArray(o.material))return;
   const original=o.material;let material=cache.get(original);
   if(!material){material=o.isPoints?new T.PointsMaterial({size:original.size,sizeAttenuation:original.sizeAttenuation}):o.isLine?new T.LineBasicMaterial():new T.MeshBasicMaterial();cache.set(original,material);owned.add(material);}
   const context=o.userData.defocusWeight??(o.userData.defocus?1:0);material.color.setRGB(context,context,context);
   const transparent=original.transparent;if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
   material.visible=original.visible;material.opacity=original.opacity;material.depthWrite=original.depthWrite;material.depthTest=original.depthTest;material.side=original.side;material.forceSinglePass=original.forceSinglePass;
   material.map=original.map||null;material.alphaMap=original.alphaMap||null;material.alphaTest=original.alphaTest;
   material.clippingPlanes=original.clippingPlanes;material.clipIntersection=original.clipIntersection;material.toneMapped=false;
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
 function render(scene,view,strength){try{return vehicleTransparency.render(scene,()=>renderFrame(scene,view,strength));}catch(error){try{renderer.setRenderTarget(null);}catch{}throw error;}}
 return {render,dispose(){[source,mask,horizontal,vertical].forEach(t=>t.dispose());owned.forEach(m=>m.dispose());blur.dispose();composite.dispose();quad.geometry.dispose();}};
}
