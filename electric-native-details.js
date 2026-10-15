import * as T from './vendor/three.module.min.js';

const unitAxis=new T.Vector3(),pivot=new T.Vector3(),rotation=new T.Matrix4(),move=new T.Matrix4();
const back=new T.Matrix4(),current=new T.Matrix4(),inverse=new T.Matrix4(),q=new T.Quaternion();
const sourceRest=new T.Matrix4();
const limit=value=>Math.max(0,Math.min(1,Number(value)||0));
const nativeElectric=data=>data.sourceNative&&(data.variant==='e74'||data.sourceVariant==='dc26');

export function configureNativeElectricPart(mesh){
 const data=mesh.userData;
 if(!nativeElectric(data))return mesh;
 data.detailMeshes=[];
 data.nativeElectric=true;
 const rest=data.nativeRestMatrix||data.installationMatrix;
 if(rest)data.nativeRestMatrix=Array.from(rest);
 // Per-occurrence source appearance is retained when it differs from CATIA's
 // unassigned white. Presentation materials supply the remaining PBR response.
 if(data.cadColor&&data.cadColor.toLowerCase()!=='#ffffff')mesh.material.color.set(data.cadColor);
 if(data.role==='battery-cell'){mesh.material.color.setHex(0x73848c);mesh.material.metalness=.68;mesh.material.roughness=.38;}
 data.baseColor=mesh.material.color.clone();
 if(!data.window||data.nativeWindowUniforms)return mesh;
 const w=data.window;
 const state={
  centre:{value:new T.Vector3(...w.center)},
  u:{value:new T.Vector3(...w.u)},v:{value:new T.Vector3(...w.v)},
  n:{value:new T.Vector3(...w.normal)},
  extent:{value:new T.Vector3(...w.halfExtents)},
  alpha:{value:w.opacity??.16},amount:{value:1}
 };
 const originalMaterial=mesh.material;
 const previousCompile=originalMaterial.onBeforeCompile.bind(originalMaterial);
 const previousCacheKey=originalMaterial.customProgramCacheKey();
 mesh.material=originalMaterial.clone();
 mesh.material.transparent=true;
 mesh.material.depthWrite=false;
 mesh.renderOrder=4;
 mesh.material.onBeforeCompile=(shader,renderer)=>{
  previousCompile(shader,renderer);
  Object.assign(shader.uniforms,{
   evWindowCentre:state.centre,evWindowU:state.u,evWindowV:state.v,
   evWindowN:state.n,evWindowExtent:state.extent,
   evWindowAlpha:state.alpha,evWindowAmount:state.amount
  });
  shader.vertexShader='varying vec3 vEvPartPosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
   '#include <begin_vertex>\n vEvPartPosition=position;');
  shader.fragmentShader=`varying vec3 vEvPartPosition;
uniform vec3 evWindowCentre,evWindowU,evWindowV,evWindowN,evWindowExtent;
uniform float evWindowAlpha,evWindowAmount;
`+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec3 evDelta=vEvPartPosition-evWindowCentre;
vec3 evAbs=abs(vec3(dot(evDelta,evWindowU),dot(evDelta,evWindowV),dot(evDelta,evWindowN)));
float evInside=step(evAbs.x,evWindowExtent.x)*step(evAbs.y,evWindowExtent.y)*step(evAbs.z,evWindowExtent.z);
diffuseColor.a*=mix(1.0,evWindowAlpha,evInside*evWindowAmount);
`);
 };
 mesh.material.customProgramCacheKey=()=> previousCacheKey+'/dc26-original-panel-window-745';
 mesh.material.needsUpdate=true;
 data.nativeWindowUniforms=state;
 mesh.castShadow=false;
 originalMaterial.dispose();
 return mesh;
}

function inputAngle(data,inputs){
 const drive=data.motion;
 if(!drive)return null;
 let angle=inputs[drive.input];
 if(!Number.isFinite(angle)&&drive.input==='rearAxleAngle'&&Number.isFinite(inputs.leftRearWheelAngle)&&Number.isFinite(inputs.rightRearWheelAngle)){
  angle=(inputs.leftRearWheelAngle+inputs.rightRearWheelAngle)/2;
 }
 return Number.isFinite(angle)?angle*(drive.gain??1):null;
}

// Call after restoring source poses, applying the car/explosion transform and
// the ordinary focus alpha. The native matrix cancels only installation, so
// context pose and focus remain in the transform supplied by the caller.
export function updateNativeElectricParts(meshes,inputs={},focus={}){
 let moving=0,sourceInstances=0;
 for(const mesh of meshes){
  const data=mesh.userData;
  if(!nativeElectric(data))continue;
  sourceInstances++;
  if(!data.nativeElectric)configureNativeElectricPart(mesh);
  const batteryView=limit(focus.batteryView??0),role=data.role;
  if(data.nativeWindowUniforms){
   data.nativeWindowUniforms.amount.value=focus.windowsEnabled===false?0:limit(focus.windowAmount??1);
   const w=data.window,state=data.nativeWindowUniforms;
   state.alpha.value=T.MathUtils.lerp(w.opacity??.14,role==='accumulator-lid'?.018:.055,role==='accumulator-lid'?batteryView:limit(focus.windowAmount??1));
   state.extent.value.fromArray(w.halfExtents);
   if(role==='accumulator-lid'){state.extent.value.x=T.MathUtils.lerp(w.halfExtents[0],.181,batteryView);state.extent.value.y=T.MathUtils.lerp(w.halfExtents[1],.177,batteryView);}
   mesh.castShadow=false;
   mesh.material.depthWrite=false;
  }
  const cutawayAlpha={'accumulator-case':.065,'voltage-board':.035,'cell-locating-plate':.065,'module-frame':.12,'battery-component-plate':.16}[role];
  if(cutawayAlpha!==undefined&&batteryView>0){mesh.material.opacity*=T.MathUtils.lerp(1,cutawayAlpha,batteryView);mesh.material.depthWrite=false;mesh.castShadow=false;if(data.shadowFade)data.shadowFade.value=0;}
  if(data.motionType!=='rotate'||!data.axis||!data.pivot||!data.nativeRestMatrix)continue;
  const angle=inputAngle(data,inputs);
  if(angle===null)continue;
  mesh.updateMatrix();
  current.copy(mesh.matrix);
  inverse.fromArray(data.nativeRestMatrix).invert();
  unitAxis.fromArray(data.axis).normalize();pivot.fromArray(data.pivot);
  q.setFromAxisAngle(unitAxis,angle);
  rotation.makeRotationFromQuaternion(q);
  move.makeTranslation(pivot.x,pivot.y,pivot.z);
  back.makeTranslation(-pivot.x,-pivot.y,-pivot.z);
  move.multiply(rotation).multiply(back);
  sourceRest.fromArray(data.nativeRestMatrix);
  current.multiply(inverse).multiply(move).multiply(sourceRest);
  current.decompose(mesh.position,mesh.quaternion,mesh.scale);
  mesh.updateMatrix();
  moving++;
 }
 return {moving,sourceInstances};
}
