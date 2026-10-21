import * as T from './vendor/three.module.min.js';
import {operationsVIS} from './operations-vis-data.js?v=744';
import {createOperationsParticles,ENTRY_SECONDS} from './operations-particles-765.js?v=765.1';

const V=(...v)=>new T.Vector3(...v),clamp=x=>T.MathUtils.clamp(x,0,1);
const ease=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const center=V(0,0,.64),view=operationsVIS.viewBox,unit=2/view[2];
// From +Y with +Z up, screen-right is -X. Keep the original VIS orientation.
const project=(x,y)=>V(-(x-view[0]-view[2]/2)*unit,0,-(y-view[1]-view[3]/2)*unit);

function readContour(d){
 const tokens=d.match(/[MLCQZ]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi),shape=new T.Shape();let i=0;
 const number=()=>Number(tokens[i++]);
 while(i<tokens.length){
  const command=tokens[i++];
  if(command==='M')shape.moveTo(number(),number());
  else if(command==='L')shape.lineTo(number(),number());
  else if(command==='C')shape.bezierCurveTo(number(),number(),number(),number(),number(),number());
  else if(command==='Q')shape.quadraticCurveTo(number(),number(),number(),number());
  else if(command==='Z')shape.closePath();
  else throw new Error(`Unsupported VIS path command: ${command}`);
 }
 return shape;
}

// One closed centreline: over the red crossing, around the right lobe,
// under the crossing and around the left lobe. No disconnected outline loops.
function createSweepRoute(){
 const knots=[[1216,664],[1280,690],[1341,714],[1394,714],[1440,688],[1463,646],[1450,607],[1414,579],[1370,579],[1333,602],[1304,634],[1275,668],[1253,695],[1224,733],[1190,777],[1150,787],[1118,766],[1103,731],[1118,695],[1155,669],[1190,660]];
 const curve=new T.CatmullRomCurve3(knots.map(p=>project(...p)),true,'centripetal');curve.arcLengthDivisions=4096;curve.updateArcLengths();
 function partAt(phase){const t=curve.getUtoTmapping(phase)*knots.length;return t<2?'red-0':t<11.7?'navy-1':'navy-0';}
 return {curve,partAt,knots};
}

export function createOperationsMark(sources){
 const root=new T.Scene();root.name='operations-vis-mark';
 const route=createSweepRoute(),markStrength={value:0},markLight={value:new T.Vector2()},meshes=[],targetFaces={red:[],black:[]},lights=[];
 for(const path of operationsVIS.paths){
  const shape=readContour(path.d),raw=new T.ShapeGeometry(shape,48),position=raw.attributes.position,index=raw.index,triangles=[];
  for(let i=0;i<index.count;i+=3){const at=j=>project(position.getX(index.getX(i+j)),position.getY(index.getX(i+j))),a=at(0),b=at(1),c=at(2);if(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()>1e-18)triangles.push({a,b,c,path:path.id});}
  const family=path.id==='red-0'?'red':'black';
  targetFaces[family].push(...triangles.map(t=>({...t,a:t.a.clone().add(center),b:t.b.clone().add(center),c:t.c.clone().add(center)})));
  const geometry=raw;
  for(let i=0;i<position.count;i++){const p=project(position.getX(i),position.getY(i));position.setXYZ(i,p.x,p.y,p.z);}
  position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const glowPoints={value:Array.from({length:5},()=>new T.Vector2())},glowTangents={value:Array.from({length:5},()=>new T.Vector2())},glowWeights={value:new Float32Array(5)};
  lights.push({path:path.id,glowPoints,glowTangents,glowWeights});
  const material=new T.MeshBasicMaterial({color:path.fill,transparent:true,side:T.DoubleSide,depthWrite:false,depthTest:false,toneMapped:true,forceSinglePass:true});
  material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,{markStrength,markLight,glowPoints,glowTangents,glowWeights});
   shader.vertexShader='varying vec2 vMarkPosition;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMarkPosition=position.xz;');
   shader.fragmentShader='varying vec2 vMarkPosition;uniform float markStrength;uniform vec2 glowPoints[5],glowTangents[5];uniform float glowWeights[5];\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float light=0.;
    for(int i=0;i<5;i++){
     vec2 delta=vMarkPosition-glowPoints[i],tangent=glowTangents[i];
     float along=dot(delta,tangent),across=dot(delta,vec2(-tangent.y,tangent.x));
     light+=exp(-pow(along/.045,2.)-pow(across/.105,4.))*glowWeights[i];
    }
    light=min(.90,light)*markStrength;
    diffuseColor.rgb=mix(diffuseColor.rgb,${family==='red'?'vec3(1.,.30,.22)':'vec3(.67,.77,.84)'},light);`);
  };
  material.customProgramCacheKey=()=>`operations-single-eight-760-${path.id}`;
  const mesh=new T.Mesh(geometry,material);mesh.position.copy(center);mesh.position.y=family==='red'?.0002:0;mesh.renderOrder=50+(family==='red'?1:0);
  mesh.name=`operations-vis-${path.id}`;mesh.userData.visSourcePath=path.id;mesh.userData.framingPoints=[geometry.boundingBox.min.clone(),geometry.boundingBox.max.clone()];root.add(mesh);meshes.push(mesh);
 }
 const sourceBounds=new T.Box3();
 for(const mesh of sources){
  if(mesh.userData.group!=='body'||['e74','a08'].includes(mesh.userData.variant)||!mesh.geometry.boundingBox)continue;
  const box=mesh.geometry.boundingBox.clone();if(mesh.userData.nativeRestTransform)box.applyMatrix4(mesh.userData.nativeRestTransform);sourceBounds.union(box);
 }
 if(sourceBounds.isEmpty()||sourceBounds.max.x-sourceBounds.min.x<.1)throw new Error('C41 body bounds are required for the particle release direction.');
 const particles=createOperationsParticles(targetFaces,sourceBounds);root.add(particles.root);root.visible=false;
 let phase='idle',p=0,clock=0,sweepStart=null,alpha=1,exitElapsed=0,exitDuration=.65,exitProgress=0,resumeElapsed=1,resumeAlpha=1,viewCamera=null,entryFrame=null;
 let state={progress:0,assemblyScale:1,assemblyAlpha:1,markAlpha:0,facetAlpha:0};
 function paint(){
  const markAlpha=ease((p-.74)/.25)*alpha;root.visible=phase!=='idle'&&alpha>.0001;
  for(const mesh of meshes){mesh.visible=markAlpha>.0001;mesh.material.opacity=markAlpha;}
  particles.update(p,alpha);
  if(p>=.91&&sweepStart===null)sweepStart=clock;
  const elapsed=sweepStart===null?0:Math.max(0,clock-sweepStart),cycle=elapsed%7.2;
  const sweep=Math.min(1,cycle/2.8),point=route.curve.getPointAt(sweep%1);
  markLight.value.set(point.x,point.z);markStrength.value=ease((p-.90)/.10)*ease(cycle/.22)*(1-ease((cycle-2.6)/.2));
  for(let i=0;i<5;i++){
   const atPhase=(sweep-i*.008+1)%1,at=route.curve.getPointAt(atPhase),tangent=route.curve.getTangentAt(atPhase),part=route.partAt(atPhase);
   for(const light of lights){light.glowPoints.value[i].set(at.x,at.z);light.glowTangents.value[i].set(tangent.x,tangent.z);light.glowWeights.value[i]=light.path===part?[.76,.32,.16,.075,.025][i]:0;}
  }
  state={progress:p,assemblyScale:1,assemblyAlpha:phase==='idle'?1:1-ease(p/.20),markAlpha,facetAlpha:0,sweep,sweepPoint:[point.x,point.z],sweepStrength:markStrength.value,phase,layerAlpha:alpha};return state;
 }
 function begin(frame,target){
  particles.bind(frame);viewCamera=frame.camera;viewCamera.updateMatrixWorld(true);
  const forward=viewCamera.getWorldDirection(V()),right=V().setFromMatrixColumn(viewCamera.matrixWorld,0),up=V().setFromMatrixColumn(viewCamera.matrixWorld,1);
  const distance=Math.max(.6,viewCamera.position.distanceTo(target)),height=2*Math.tan(T.MathUtils.degToRad(viewCamera.fov)/2)*distance/viewCamera.zoom;
  root.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right.clone().negate(),forward.clone().negate(),up));
  root.scale.setScalar(Math.min(height*.44/1.22,height*viewCamera.aspect*.43/1.9));
  root.position.copy(viewCamera.position).addScaledVector(forward,distance).sub(center.clone().multiplyScalar(root.scale.x).applyQuaternion(root.quaternion));root.updateMatrixWorld(true);
  entryFrame={position:viewCamera.position.clone(),target:target.clone(),up:viewCamera.up.clone(),zoom:viewCamera.zoom};
  phase='enter';p=0;clock=0;sweepStart=null;alpha=1;resumeAlpha=1;resumeElapsed=1;paint();
 }
 function update(progress,time,cycleMotion=null,dt=0){
  if(phase==='exit')return state;
  if(phase==='idle'){p=0;return paint();}
  p=clamp(progress);clock+=Math.max(0,dt);resumeElapsed+=Math.max(0,dt);alpha=T.MathUtils.lerp(resumeAlpha,1,ease(resumeElapsed/.20));if(p>=1)phase='settled';return paint();
 }
 return {root,meshes,particles,begin,update,setSourceTransform:matrix=>particles.setSourceTransform(matrix),
  get active(){return phase!=='idle';},get exiting(){return phase==='exit';},get progress(){return p;},get frame(){return entryFrame;},get camera(){return viewCamera;},
  entrySeconds:ENTRY_SECONDS,
  resume(){phase='enter';resumeAlpha=alpha;resumeElapsed=0;return p;},
  leave(immediate=false){if(phase==='idle'||phase==='exit')return;phase='exit';exitElapsed=0;exitDuration=immediate?.001:.65;exitProgress=p;resumeAlpha=alpha;},
  advanceExit(dt){if(phase!=='exit')return 1;exitElapsed+=dt;clock+=dt;p=exitProgress+(1-exitProgress)*.14*ease(exitElapsed/exitDuration);alpha=resumeAlpha*(1-ease(exitElapsed/exitDuration));paint();if(exitElapsed>=exitDuration){phase='idle';alpha=0;p=0;particles.release();paint();return 1;}return ease(exitElapsed/exitDuration);},
  draw(renderer,overlay=false){if(!root.visible||!viewCamera)return;const auto=renderer.autoClear,shadows=renderer.shadowMap.autoUpdate;renderer.autoClear=!overlay;renderer.shadowMap.autoUpdate=false;renderer.setRenderTarget(null);if(overlay)renderer.clearDepth();try{renderer.render(root,viewCamera);}finally{renderer.autoClear=auto;renderer.shadowMap.autoUpdate=shadows;}},
  async prepare(renderer,camera){const visible=root.visible;root.visible=true;try{await renderer.compileAsync(root,camera);}finally{root.visible=visible;}},
  diagnostics:()=>({...state,profile:'whole-car-surface-particles',entry:'restore-whole-scatter-gather',sourceSha256:operationsVIS.sourceSha256,sourcePathCount:meshes.length,sweepTopology:'one-closed-figure-eight',...particles.diagnostics()}),
  sweepRoute:route,
  dispose(){particles.dispose();meshes.forEach(m=>{m.geometry.dispose();m.material.dispose();});root.clear();}
 };
}
