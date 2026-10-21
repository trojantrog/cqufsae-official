import * as T from './vendor/three.module.min.js';

const drawable=o=>o.isMesh||o.isPoints||o.isLine;
const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
const planes=m=>m.clippingPlanes||null;
const shadowSide=side=>side===T.FrontSide?T.BackSide:side===T.BackSide?T.FrontSide:T.DoubleSide;

export function capturePrepareState(renderer){
 return {target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),level:renderer.getActiveMipmapLevel(),
  viewport:renderer.getViewport(new T.Vector4()),scissor:renderer.getScissor(new T.Vector4()),scissorTest:renderer.getScissorTest(),
  clearColor:renderer.getClearColor(new T.Color()).clone(),clearAlpha:renderer.getClearAlpha(),
  autoClear:renderer.autoClear,autoColor:renderer.autoClearColor,autoDepth:renderer.autoClearDepth,autoStencil:renderer.autoClearStencil,
  shadowAuto:renderer.shadowMap.autoUpdate,shadowNeeds:renderer.shadowMap.needsUpdate};
}
export function restorePrepareState(renderer,s){
 renderer.setRenderTarget(s.target,s.face,s.level);renderer.setViewport(s.viewport);renderer.setScissor(s.scissor);renderer.setScissorTest(s.scissorTest);
 renderer.setClearColor(s.clearColor,s.clearAlpha);renderer.autoClear=s.autoClear;renderer.autoClearColor=s.autoColor;renderer.autoClearDepth=s.autoDepth;renderer.autoClearStencil=s.autoStencil;
 renderer.shadowMap.autoUpdate=s.shadowAuto;renderer.shadowMap.needsUpdate=s.shadowNeeds;
}

// All writes are confined to preparation objects. Keeping their materials alive
// also keeps Three's shared programs alive until the corresponding real draws.
export function createShaderPreparation(renderer){
 const cache=new WeakMap(),owned=new Set(),scratch=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:true,stencilBuffer:false});
 const primerGeometry=new T.BufferGeometry();primerGeometry.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
 // Raw programs have no clipping-count component in r180's program cache key.
 // The draw still updates WebGLClipping before selecting this fixed program.
 const primerMaterial=new T.RawShaderMaterial({glslVersion:T.GLSL3,depthTest:false,depthWrite:false,colorWrite:false,toneMapped:false,
  vertexShader:'precision highp float;in vec3 position;void main(){gl_Position=vec4(position,1.);}',
  fragmentShader:'precision highp float;out vec4 preparedPixel;void main(){preparedPixel=vec4(0.);}'});
 primerMaterial.customProgramCacheKey=()=> 'focus-clip-primer-754';
 const primerScene=new T.Scene(),primerCamera=new T.Camera(),primer=new T.Mesh(primerGeometry,primerMaterial);primer.frustumCulled=false;primerScene.add(primer);
 let primerReady=null,disposed=false;
 function copyMaterial(original,role='color',owner=original){
  let entries=cache.get(owner);if(!entries){entries=new Map();cache.set(owner,entries);}
  let material=entries.get(role);if(!material){material=original.clone();entries.set(role,material);owned.add(material);}else material.copy(original);
  material.onBeforeCompile=original.onBeforeCompile;material.customProgramCacheKey=original.customProgramCacheKey;
  // ShaderMaterial.copy clones textures in uniforms. Compilation needs the
  // original texture features, without allocating duplicate texture storage.
  if(original.isShaderMaterial)for(const [name,uniform]of Object.entries(original.uniforms))if(uniform.value?.isTexture)material.uniforms[name].value=uniform.value;
  material.clippingPlanes=planes(original);material.needsUpdate=true;return material;
 }
 function proxy(object,material){
  let clone;
  if(object.isInstancedMesh){clone=new T.InstancedMesh(object.geometry,material,object.count);clone.instanceMatrix=object.instanceMatrix;clone.instanceColor=object.instanceColor;clone.morphTexture=object.morphTexture;}
  else if(object.isPoints)clone=new T.Points(object.geometry,material);
  else if(object.isLineSegments)clone=new T.LineSegments(object.geometry,material);
  else if(object.isLineLoop)clone=new T.LineLoop(object.geometry,material);
  else if(object.isLine)clone=new T.Line(object.geometry,material);
  else clone=new T.Mesh(object.geometry,material);
  if(object.isSkinnedMesh)throw new Error('Shader preparation requires a separate skinning snapshot');
  clone.matrixAutoUpdate=false;clone.matrix.copy(object.matrixWorld);clone.frustumCulled=false;clone.layers.mask=object.layers.mask;
  clone.visible=visible(object);clone.castShadow=object.castShadow;clone.receiveShadow=object.receiveShadow;clone.renderOrder=object.renderOrder;
  if(object.morphTargetInfluences)clone.morphTargetInfluences=[...object.morphTargetInfluences];
  return clone;
 }
 function sceneSnapshot(scene){
  const snapshot=new T.Scene();snapshot.environment=scene.environment;snapshot.environmentIntensity=scene.environmentIntensity;snapshot.environmentRotation.copy(scene.environmentRotation);snapshot.fog=scene.fog;
  const lights=[];
  scene.traverseVisible(object=>{if(!object.isLight)return;const light=object.clone(false);light.matrixAutoUpdate=false;light.matrix.copy(object.matrixWorld);snapshot.add(light);lights.push(light);
   if(light.target&&object.target){light.target.matrixAutoUpdate=false;light.target.matrix.copy(object.target.matrixWorld);snapshot.add(light.target);}
   if(light.shadow){light.shadow.mapSize.set(1,1);light.shadow.autoUpdate=true;light.shadow.needsUpdate=true;}
  });
  return {scene:snapshot,lights};
 }
 function shadowMaterial(object,material,distance=false){
  const original=(distance?object.customDistanceMaterial:object.customDepthMaterial)||
   (distance?new T.MeshDistanceMaterial():new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking}));
  const depth=copyMaterial(original,distance?'shadow-distance':'shadow-depth',material);
  depth.visible=material.visible;depth.wireframe=material.wireframe;depth.side=material.shadowSide??(renderer.shadowMap.type===T.VSMShadowMap?material.side:shadowSide(material.side));
  for(const name of ['map','alphaMap','displacementMap','displacementScale','displacementBias','wireframeLinewidth','linewidth','clipShadows','clipIntersection'])depth[name]=material[name];
  depth.alphaTest=material.alphaToCoverage?.5:material.alphaTest;depth.clippingPlanes=material.clipShadows?planes(material):null;
  if(!object[distance?'customDistanceMaterial':'customDepthMaterial'])original.dispose();
  return depth;
 }
 function groups(objects){
  const result=new Map();
  for(const object of objects){const m=object.material,count=renderer.localClippingEnabled?(planes(m)?.length||0):0,key=count+':'+(count&&m.clipIntersection?1:0);let entry=result.get(key);
   if(!entry){entry={group:new T.Group(),planes:count?planes(m):null,intersection:!!(count&&m.clipIntersection)};result.set(key,entry);}entry.group.add(object);
  }
  return [...result.values()];
 }
 // compileAsync reads the active target and clipping state synchronously. Put
 // both back before yielding so asynchronous work never borrows live state.
 function compile(group,view,scene,target,clipPlanes=null,intersection=false){
  const state=capturePrepareState(renderer);let pending;
  try{
   renderer.setRenderTarget(scratch);renderer.setViewport(0,0,1,1);renderer.setScissorTest(false);
   primerMaterial.clippingPlanes=clipPlanes;primerMaterial.clipIntersection=intersection;
   renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.render(primerScene,primerCamera);
   renderer.setRenderTarget(target);pending=renderer.compileAsync(group,view,scene);
  }finally{restorePrepareState(renderer,state);}
  return pending;
 }
 async function initialize(){
  if(!primerReady){const state=capturePrepareState(renderer);try{renderer.setRenderTarget(scratch);renderer.initRenderTarget(scratch);primerReady=renderer.compileAsync(primerScene,primerCamera);}finally{restorePrepareState(renderer,state);}}
  await primerReady;
 }
 async function prepare(scene,view,{maskFor,blurScene,blurCamera,blurTarget,compositeScene,compositeCamera}={}){
  if(disposed)throw new Error('Shader preparation disposed');await initialize();
  const snapshot=sceneSnapshot(scene),maskSnapshot=sceneSnapshot(scene),camera=view.clone(),color=[],mask=[],depth=[],distance=[];
  const hasPointShadow=snapshot.lights.some(light=>light.isPointLight&&light.castShadow);
  try{
   scene.traverse(object=>{if(!drawable(object)||!object.geometry||!object.material)return;
    for(const original of Array.isArray(object.material)?object.material:[object.material]){
     const material=copyMaterial(original),mesh=proxy(object,material);color.push(mesh);
     if(object.castShadow){mesh.customDepthMaterial=shadowMaterial(object,material);const item=proxy(object,mesh.customDepthMaterial);item.castShadow=false;depth.push(item);
      if(hasPointShadow){mesh.customDistanceMaterial=shadowMaterial(object,material,true);const item=proxy(object,mesh.customDistanceMaterial);item.castShadow=false;distance.push(item);}
     }
     if(!Array.isArray(object.material)&&maskFor){const maskMaterial=copyMaterial(maskFor(object,original),'mask'),item=proxy(object,maskMaterial);item.castShadow=false;mask.push(item);}
    }
   });
   for(const list of [color,mask,depth,distance])for(const entry of groups(list))await compile(entry.group,camera,snapshot.scene,scratch,entry.planes,entry.intersection);
   for(const mesh of color)snapshot.scene.add(mesh);for(const mesh of mask)maskSnapshot.scene.add(mesh);
   const state=capturePrepareState(renderer);
   try{
    renderer.setRenderTarget(scratch);renderer.setViewport(0,0,1,1);renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.autoClear=true;
    renderer.shadowMap.autoUpdate=true;renderer.shadowMap.needsUpdate=true;renderer.render(snapshot.scene,camera);
    renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.render(maskSnapshot.scene,camera);
   }finally{restorePrepareState(renderer,state);}
   if(blurScene)await compile(blurScene,blurCamera,blurScene,blurTarget);
   if(compositeScene)await compile(compositeScene,compositeCamera,compositeScene,null);
   return {objects:color.length,masks:mask.length,shadowMaterials:depth.length+distance.length,clipGroups:groups(color.map(mesh=>proxy(mesh,mesh.material))).length};
  }finally{for(const light of [...snapshot.lights,...maskSnapshot.lights]){light.shadow?.map?.dispose();light.shadow?.mapPass?.dispose();}snapshot.scene.clear();maskSnapshot.scene.clear();}
 }
 return {prepare,dispose(){disposed=true;scratch.dispose();primerGeometry.dispose();primerMaterial.dispose();for(const material of owned)material.dispose();owned.clear();}};
}
