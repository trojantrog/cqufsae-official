import {fetchModelBinary} from './model-binary.js?v=749';
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { createStudioLighting } from './studio-lighting.js?v=742';
import { createDepartmentDirector } from './department-work.js?v=748';
import { vehicleMaterial } from './presentation-materials.js?v=742';
import { detailElectricPart } from './electric-details.js?v=746';
import { createEngineSourceParts } from './engine-native-source.js?v=749';
import { createModelGeometry } from './model-geometry.js?v=749';
import { sampleGeometry,visiblePoints,fitPoints } from './camera-framing.js?v=742';
import { explosionLayout } from './explosion-layout.js?v=747';
import { createSystemFocus } from './system-focus.js?v=748';
import { createRenderTelemetry } from './render-telemetry.js?v=742';
import { createContextGeometry } from './context-geometry.js?v=749';
import { createWorkLabels } from './work-labels.js?v=742';
import { createSectionCulling } from './section-culling.js?v=742';
import { prepareShowcase, createShowcase } from './showcase.js?v=743';
import { isA08PartRelevant } from './a08-motion.js?v=746';
let powerVariant='c41',electricParts=[],electricLoadPromise=null,autonomousParts=[],autonomousLoadPromise=null;
const reviewParams=new URLSearchParams(location.search),reviewEnabled=reviewParams.has('review');
const gpuPass=reviewEnabled&&['color','mask','blurH','blurV','composite'].includes(reviewParams.get('gpuPass'))?reviewParams.get('gpuPass'):null;
const contextGeometry=createContextGeometry({enabled:!reviewEnabled||reviewParams.get('contextLod')!=='0'});
const drawingSize=new THREE.Vector2();let renderScope='loading';

const $ = s => document.querySelector(s);
const presentation = document.documentElement.hasAttribute('data-presentation');
if(presentation)prepareShowcase();
const host = $('#vehicle-canvas'), stage = $('.ex-stage');
const workLabels = createWorkLabels($('#work-labels'));
const range = $('#explosion-progress'), value = $('#explosion-value');
const loading = $('#model-loading'), fallback = $('#model-fallback');
const reducedSystem = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = t => Math.max(0,Math.min(1,t));
const ease = t => t*t*(3-2*t);
const baseTarget = new THREE.Vector3(0,0,.6);
const departments = {
  all:{name:'一辆赛车的组成',copy:'查看部件的装配关系。选择部门，进入对应系统的工作演示。',tags:[],groups:[]},
  chassis:{name:'底盘',copy:'悬架、转向与制动共同影响赛车的姿态、行驶方向和减速过程。',tags:['suspension','steering','brakes'],groups:['suspension','steering','brakes']},
  structure:{name:'车身车架',copy:'车身组织赛车的外部形态，车架承载并连接各系统。',tags:['body','frame'],groups:['body','frame']},
  power:{name:'动力总成',copy:'从动力来源到车轮，完成能量储存、动力输出与传递。',tags:['engine','transmission','ecu','battery','wiring'],groups:['transmission','engine','ecu','battery','wiring']},
  driverless:{name:'无人',copy:'算法生成行驶路径，控制将规划结果转化为车辆运动。',tags:[],groups:['algorithm','control']},
  operations:{name:'运营部',copy:'车队组织、活动策划、对外传播与资源协调贯穿整车项目。',tags:[],groups:[]}
};
const groups = {
  suspension:{name:'悬架',department:'chassis',tags:['suspension'],copy:'围绕轮胎接地、悬架几何和车辆姿态，完成设计、装配与调试。',related:'对应摆臂、立柱、减振器及相关轮端部件。'},
  steering:{name:'转向',department:'chassis',tags:['steering'],copy:'将驾驶员输入传递至车轮，协调转向传动关系和整车布置。',related:'对应方向盘、转向柱、转向机与横拉杆。'},
  brakes:{name:'制动',department:'chassis',tags:['brakes'],copy:'通过制动踏板、液压系统与轮端机构实现减速。',related:'对应制动踏板、制动盘与卡钳的概括外形。'},
  body:{name:'车身',department:'structure',tags:['body'],copy:'设计车身覆盖件及空气动力学外形，参与复合材料制作和安装。',related:'对应车身覆盖件、前后翼与底板。'},
  frame:{name:'车架',department:'structure',tags:['frame'],copy:'围绕载荷、空间与安装关系设计承载结构，协调各系统布置。',related:'对应管架与座舱承载结构。'},
  transmission:{name:'传动',department:'power',tags:['transmission'],copy:'把动力输出传递到车轮，完成传动机构的设计、布置与调试。',related:'对应传动与驱动部件。'},
  engine:{name:'发动机（油）',short:'发动机',department:'power',vehicle:'c41',tags:['engine'],copy:'围绕发动机及进排气、冷却等配套系统开展设计、标定和测试。',related:'显示发动机与进排气、冷却附件，内部剖面展示工作原理。'},
  ecu:{name:'电控（电）',short:'电控',department:'power',vehicle:'e74',tags:['ecu'],copy:'完成车辆信号采集、系统通信与电控功能开发。',related:'观察电机控制器与电驱系统的联系。'},
  battery:{name:'电池（电）',short:'电池',department:'power',vehicle:'e74',tags:['battery'],copy:'参与动力电池系统的设计、装配、管理和验证。',related:'箱体与上部板件逐渐透明，展示电芯排列、模组和连接件。'},
  wiring:{name:'线路（电）',short:'线路',department:'power',vehicle:'e74',tags:['wiring'],copy:'设计并制作整车电气连接，完成线束布置与检查。',related:'通过局部开窗，观察高压盒内部元件与连接布置。'},
  algorithm:{name:'算法',department:'driverless',tags:[],copy:'环境感知、定位与路径规划共同生成赛车的行驶路径。',related:'观察 A08 激光雷达、深度相机及其安装结构。'},
  control:{name:'控制',department:'driverless',tags:[],copy:'将目标路径与速度转化为转向、驱动和制动指令。',related:'观察 A08 自动转向、制动执行机构与储气装置。'}
};

let renderer,scene,camera,controls,vehicleRoot,envTexture,shadow,contactShadow,systemFocus,renderTelemetry,sectionCulling,sectionRig=null;
let car='c41', department='all', group=null, meshes=[], revision=0;
let progress=0,targetProgress=0,playing=false,flightStart=0,flightFrom=0,flightTo=1,flightDuration=4600;
let previous=performance.now(),manualReduced=false,loaded=false,activeTags=[],flightCamera=null,finishFlight=null;
let focusTarget=baseTarget.clone(),hoverId='',pointerStart=null,dragging=false,autoFit=true;
let director,responseView,navigation=0,viewTween=null,lastMotionCaption='',activeView='perspective';
const frameDurations=[];
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const backgroundColor = new THREE.Color('#edeae2');
try{manualReduced=localStorage.getItem('cqufsae-reduce-motion')==='1';}catch{}
const reduced=()=>reducedSystem.matches||manualReduced;
const showcase=presentation?createShowcase({reduced}):null;
let pendingPresentationSelection=null;
if(presentation)departments.all.copy='向下滚动，查看赛车的组成。选择部门与组别，观察对应系统的工作过程。';
const assets=new Map();

function init(){
  stage.dataset.build='749';
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.localClippingEnabled=true;
  sectionCulling=createSectionCulling(renderer,{enabled:!reviewEnabled||reviewParams.get('sectionCull')!=='0'});
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.94;
  renderTelemetry=createRenderTelemetry(renderer,{enabled:reviewEnabled});
  systemFocus=createSystemFocus(renderer,{maskScale:reviewEnabled&&reviewParams.get('maskScale')==='0.5'?.5:1,onPass:gpuPass?(label,draw)=>{
    const timing=label===gpuPass&&renderTelemetry.begin(`${renderScope}/${label}`);
    try{return draw();}finally{if(timing)renderTelemetry.end();}
  }:undefined});
  window.addEventListener('pagehide',()=>{renderTelemetry.dispose();contextGeometry.dispose();sectionCulling.dispose();},{once:true});
  host.append(renderer.domElement);
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(32,1,.018,70);
  camera.up.set(0,0,1);
  camera.position.set(4.8,6,3.7);
  controls=new OrbitControls(camera,renderer.domElement);
  controls.target.copy(baseTarget);
  controls.enableDamping=false;controls.enablePan=false;
  controls.minDistance=.3;controls.maxDistance=18;controls.minPolarAngle=.04;controls.maxPolarAngle=Math.PI*.49;
  controls.addEventListener('start',()=>{dragging=true;autoFit=false;});
  controls.addEventListener('end',()=>{dragging=false;});
  director=createDepartmentDirector({scene,camera,controls,getMeshes:()=>loaded?meshes:[],getCar:()=>car,getElectricMeshes:()=>electricParts,getAutonomousMeshes:()=>autonomousParts,reduced,overviewDirection:presentation?[1.8,7,2.6]:null,onState:updateWorkUI,onPresentationFrame:({rig})=>{
    if(rig===sectionRig)return;
    sectionRig=rig;
    sectionCulling.registerStatic([...rig.meshes.filter(m=>m.userData.mechanism==='mo-power_unit'),...rig.windows]);
  }});
  showcase?.connect({camera,controls,director,direction:new THREE.Vector3(1.8,7,2.6)});
  envTexture=createStudioLighting(renderer,scene).environment;
  const pad=document.createElement('canvas');pad.width=128;pad.height=128;
  const ctx=pad.getContext('2d'),gradient=ctx.createRadialGradient(64,64,5,64,64,62);
  gradient.addColorStop(0,'rgba(40,37,30,.22)');gradient.addColorStop(.4,'rgba(40,37,30,.1)');gradient.addColorStop(1,'rgba(40,37,30,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const shadowMap=new THREE.CanvasTexture(pad);
  shadow=new THREE.Mesh(new THREE.PlaneGeometry(4.5,3.1),new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false}));
  shadow.position.z=-.03;scene.add(shadow);
  contactShadow=new THREE.Mesh(new THREE.PlaneGeometry(14,12),new THREE.ShadowMaterial({opacity:.22,transparent:true,depthWrite:false}));
  contactShadow.position.z=-.024;contactShadow.receiveShadow=true;scene.add(contactShadow);
  new ResizeObserver(resize).observe(stage);resize();
  if(!presentation)renderer.domElement.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});
  if(!presentation)renderer.domElement.addEventListener('pointerup',e=>{
    if(!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>6)return;
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(meshes,false)[0];
    if(director.state().phase==='overview'&&hit&&groups[hit.object.userData.group])chooseGroup(hit.object.userData.group);
  });
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();showError('三维画面已暂停，请重新加载。');});
  renderer.setAnimationLoop(render);
}
function resize(){
  const w=stage.clientWidth,h=stage.clientHeight;
  if(!renderer||!w||!h)return;
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  showcase?.resize();
  if(!director||director.state().phase==='overview')overviewFit=null;if(!loaded)resetCamera();
}
function resetCamera(){
  const narrow=stage.clientWidth/stage.clientHeight<1.2;
  camera.position.set(4.8,6,3.7).multiplyScalar(narrow?1.18:.92);
  autoFit=true;overviewFit=null;camera.zoom=1;camera.updateProjectionMatrix();controls.target.copy(baseTarget);focusTarget.copy(baseTarget);controls.update();
}
const material=vehicleMaterial;

async function readModel(id){
  if(assets.has(id))return assets.get(id);
  const assetVersion='749';
  const metadataName=['c41','c41-engine-update','dc26-powertrain','a08-systems','a08-context'].includes(id)?`${id}-optimized-749`:id;
  const metaResponse=await fetch(`assets/exploded/${metadataName}.json?v=${assetVersion}`);if(!metaResponse.ok)throw new Error('metadata');
  const metadataBuffer=await metaResponse.arrayBuffer(),meta=JSON.parse(new TextDecoder().decode(metadataBuffer));
  const buffer=await fetchModelBinary(`assets/exploded/${meta.binary}?v=${assetVersion}`);const model={meta,buffer,metadataBuffer};assets.set(id,model);return model;
}
async function loadCar(id,navToken=null){
  const token=++revision,loadStart=performance.now();loaded=false;loading.hidden=false;fallback.hidden=true;
  document.querySelectorAll('[data-car]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.car===id)));
  try{
    const [base,engineUpdate,wingGroups,aeroGroups]=await Promise.all([readModel(id),id==='c41'?readModel('c41-engine-update'):null,id==='c41'?fetch('aero-rear-wing-groups-745.json?v=746').then(response=>{if(!response.ok)throw new Error('Wing section metadata');return response.json();}):null,id==='c41'?fetch('aero-explosion-groups-747.json?v=747').then(response=>{if(!response.ok)throw new Error('Aero partition metadata');return response.json();}):null]);
    const {meta,buffer,metadataBuffer}=base;if(token!==revision||(navToken!==null&&navToken!==navigation))return false;
    const replacedIds=new Set(engineUpdate?.meta.replacesOriginalIds||[]);
    contextGeometry.clear();
    sectionCulling.clear();sectionRig=null;
    director.clear();
    responseView?.dispose();responseView=null;
    if(vehicleRoot){scene.remove(vehicleRoot);vehicleRoot.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}
    vehicleRoot=new THREE.Group();meshes=[];
    for(const data of meta.objects){
      if(replacedIds.has(data.id))continue;
      const geometry=createModelGeometry(data,buffer),positions=geometry.attributes.position.array;
      const mat=material(data),mesh=new THREE.Mesh(geometry,mat);
      mesh.castShadow=true;mesh.receiveShadow=true;
      mesh.userData={...data,baseColor:mat.color.clone(),contextColor:mat.color.clone().lerp(new THREE.Color('#85877f'),.58),baseMetal:mat.metalness,baseRoughness:mat.roughness,explode:new THREE.Vector3(...data.explode),assemblyOffset:new THREE.Vector3(...data.assemblyOffset||data.explode),detailOffset:new THREE.Vector3(...data.detailOffset||[0,0,0]),selected:false};
      mesh.userData.layout=explosionLayout(data);mesh.userData.edge=null;mesh.userData.framingPoints=sampleGeometry(geometry,Math.max(24,Math.min(100,Math.floor(positions.length/90))));
      if(data.id===wingGroups?.sourceId)mesh.userData.aeroWingGroups=wingGroups;
      if(data.id==='body-004')mesh.userData.aeroExplosionGroups=aeroGroups;

      meshes.push(mesh);vehicleRoot.add(mesh);
      if(meshes.length%40===0){if(globalThis.scheduler?.yield)await globalThis.scheduler.yield();else await new Promise(resolve=>setTimeout(resolve,0));}
    }
    if(engineUpdate){
      const bottleHost=meshes.find(mesh=>mesh.userData.id==='engine-030');
      if(bottleHost){bottleHost.userData.bottleSourceTransforms=engineUpdate.meta.bottleSourceTransforms||[];bottleHost.userData.replacesBottleSourceIds=engineUpdate.meta.replacesBottleSourceIds||[];}
      for(const mesh of createEngineSourceParts(engineUpdate.meta,engineUpdate.buffer)){meshes.push(mesh);vehicleRoot.add(mesh);}
    }
    scene.add(vehicleRoot);car=id;loaded=true;loading.hidden=true;
    responseView=null;
    $('#part-count').textContent=`${meshes.filter(mesh=>mesh.userData.partCounted!==false).length+(aeroGroups?.objects.reduce((n,object)=>n+object.groups.length-1,0)||0)} 个独立展示零件`;
    $('#model-caption').textContent='C41 / 整车结构';
    host.setAttribute('aria-label',presentation?`${id.toUpperCase()} 赛车结构，随页面滚动展开；通过部门按钮查看系统演示`:`${id.toUpperCase()} 整车交互模型，可展开、旋转并高亮各组对应部件`);
    stage.dataset.vehicle=id;resetCamera();updateSelection();stage.dataset.loadMs=(performance.now()-loadStart).toFixed(1);
    if(showcase){autoFit=false;showcase.ready();}
    if(id==='c41'&&(!reviewEnabled||reviewParams.get('contextLod')!=='0'))void contextGeometry.load(meshes,{metadataBuffer,buffer,excludedIds:replacedIds});
    return true;
  }catch(error){if(token===revision)showError('整车视图暂未加载，请重新加载。');console.error('Model load failed',id,error);return false;}
}
async function loadElectricParts(){
  if(electricParts.length)return;
  if(electricLoadPromise)return electricLoadPromise;
  electricLoadPromise=(async()=>{
    const {meta,buffer}=await readModel('dc26-powertrain'),parts=[],geometries=new Map();
    try{
      for(const source of meta.objects){
        const data={...source,variant:'e74'},key=[data.position.byteOffset,data.position.count,data.normal?.byteOffset,data.index.byteOffset,data.index.count].join('/');
        let geometry=geometries.get(key);
        if(!geometry){
          geometry=createModelGeometry(data,buffer);geometries.set(key,geometry);
        }
        const mat=material(data),mesh=new THREE.Mesh(geometry,mat),rest=new THREE.Matrix4();
        if(data.installationMatrix)rest.fromArray(data.installationMatrix);
        rest.decompose(mesh.position,mesh.quaternion,mesh.scale);mesh.updateMatrix();
        mesh.userData={...data,nativeRestMatrix:rest.toArray(),baseColor:mat.color.clone(),framingPoints:sampleGeometry(geometry).map(p=>p.applyMatrix4(rest)),explode:new THREE.Vector3(...(data.explode||[0,0,0]))};
        detailElectricPart(mesh);parts.push(mesh);
        if(parts.length%24===0)await new Promise(resolve=>setTimeout(resolve,0));
      }
      electricParts=parts;
    }catch(error){for(const geometry of geometries.values())geometry.dispose();for(const mesh of parts)mesh.material.dispose();throw error;}
  })();
  try{await electricLoadPromise;}finally{electricLoadPromise=null;}
}
async function loadAutonomousParts(){
  if(autonomousParts.length)return;
  if(autonomousLoadPromise)return autonomousLoadPromise;
  autonomousLoadPromise=(async()=>{
    const models=await Promise.all([readModel('a08-systems'),readModel('a08-context')]),parts=[];
    for(const {meta,buffer} of models)for(const source of meta.objects){
      const data={...source,id:source.id.startsWith('a08-')?source.id:'a08-'+source.id,variant:'a08'};
      const geometry=createModelGeometry(data,buffer);
      const mat=material(data),mesh=new THREE.Mesh(geometry,mat);
      mesh.castShadow=true;mesh.receiveShadow=true;
      mesh.userData={...data,baseColor:mat.color.clone(),framingPoints:sampleGeometry(geometry)};
      parts.push(mesh);
      if(parts.length%24===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    autonomousParts=parts;
  })();
  try{await autonomousLoadPromise;}finally{autonomousLoadPromise=null;}
}
function showError(text){loading.hidden=true;fallback.hidden=false;$('#model-error').textContent=text;}
async function animateTo(next){
  finishFlight?.(false);finishFlight=null;
  const navToken=navigation;
  if(director.state().phase!=='overview'){await director.leave();if(navToken!==navigation)return false;department='all';group=null;showGroups();updateSelection();}
  autoFit=false;overviewFit=null;
  const track=director.explosionCameraTrack?.(new THREE.Vector3(1.8,7,2.6));
  flightCamera=track?{from:camera.position.clone(),fromTarget:controls.target.clone(),track,start:performance.now()}:null;
  flightFrom=progress;flightTo=next;targetProgress=next;flightStart=performance.now();flightDuration=next>progress?4600:2600;
  playing=!reduced();if(!playing)progress=next;
  $('#play-explosion').innerHTML=playing?'<span aria-hidden="true">Ⅱ</span> 暂停动画':'<span aria-hidden="true">↗</span> 重播展开';
  if(!playing)return true;
  return new Promise(resolve=>{finishFlight=resolve;});
}
function selectedDefinition(){return group?groups[group]:departments[department];}
function overviewStatus(){return progress<=0?'整车装配状态':progress>=1?'整车展开状态':'整车部分展开';}
function updateSelection(){
  const def=selectedDefinition();activeTags=def.tags||[];
  $('#selection-title').textContent=def.short||def.name;$('#selection-copy').textContent=def.copy;
  $('.explorer').classList.toggle('is-highlighted',activeTags.length>0);
  document.querySelectorAll('[data-department]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.department===department)));
  document.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===group)));
  const selection=department==='driverless'?autonomousParts.filter(m=>isA08PartRelevant(m.userData,group||department)):(department==='power'&&powerVariant==='e74'?[...meshes.filter(m=>m.userData.group!=='engine'),...electricParts]:meshes).filter(m=>activeTags.includes(m.userData.group));
  if(selection.length){
    $('#related-parts').textContent=def.related||'已高亮该部门关联的部件，可继续选择组别。';
    $('#selection-tag').textContent=def.short||def.name;$('#selection-tag').hidden=false;
  }else{
    $('#related-parts').textContent=def.related||(department==='operations'?'运营工作贯穿整车项目。':department==='driverless'?'选择算法或控制，了解对应的工作内容。':overviewStatus());
    $('#selection-tag').hidden=true;
    if(activeTags.length&&!selection.length&&!(department==='power'&&powerVariant==='e74'))$('#related-parts').textContent='该部分的展示资料正在补充，当前可查看工作介绍。';
  }
  for(const mesh of [...meshes,...electricParts,...autonomousParts])mesh.userData.selected=selection.includes(mesh);
  const focus=new THREE.Vector3();for(const mesh of selection){const point=new THREE.Vector3(...mesh.userData.center);if(mesh.userData.explode?.isVector3)point.addScaledVector(mesh.userData.explode,progress);focus.add(point);}
  focusTarget.copy(baseTarget);if(selection.length)focusTarget.lerp(focus.multiplyScalar(1/selection.length),.22);
  stage.dataset.selection=group||department;
  stage.dataset.highlightCount=selection.length;
}
function showGroups(){
  const container=$('#group-buttons'),focusedGroup=container.contains(document.activeElement)?document.activeElement.dataset.group:null;container.replaceChildren();
  for(const id of departments[department].groups.filter(id=>department!=='power'||id==='transmission'||(powerVariant==='c41'?id==='engine':['ecu','battery','wiring'].includes(id)))){const button=document.createElement('button');button.dataset.group=id;button.type='button';button.textContent=groups[id].name;button.setAttribute('aria-pressed',String(group===id));button.addEventListener('click',()=>chooseGroup(id));container.append(button);}
  if(focusedGroup){const replacement=Array.from(container.children).find(b=>b.dataset.group===focusedGroup);replacement?.focus({preventScroll:true});}
}
async function navigateSystem(nextDepartment,nextGroup=null,nextCar=null){
  if(!loaded||!meshes.length){if(presentation)pendingPresentationSelection={nextDepartment,nextGroup,nextCar};return;}
  const priorVariant=powerVariant;
  const token=++navigation;playing=false;flightCamera=null;finishFlight?.(false);finishFlight=null;viewTween=null;++revision;loading.hidden=true;
  $('#play-explosion').innerHTML=`<span aria-hidden="true">↗</span> ${progress>.98?'重播展开':progress<.01?'展开整车':'继续展开'}`;
  autoFit=false;
  if(nextCar)powerVariant=nextCar;
  showcase?.busy(false);
  if(nextDepartment==='power'&&powerVariant==='e74'){
    showcase?.busy(!electricParts.length);
    try{await loadElectricParts();}catch(error){if(token===navigation){powerVariant=priorVariant;showcase?.error('电驱结构暂未加载，请重新选择电驱动力。');}console.error('Electric model load failed',error);return;}
    if(token!==navigation)return;
    showcase?.busy(false);
  }
  if(nextDepartment==='driverless'){
    showcase?.busy(!autonomousParts.length,'正在准备 A08 无人系统');
    if(!presentation&&!autonomousParts.length)loading.hidden=false;
    try{await loadAutonomousParts();if(token===navigation)await director.prepareAutonomous();}catch(error){if(token===navigation){loading.hidden=true;showcase?.error('无人系统暂未加载，请重新选择无人。');if(!presentation)$('#related-parts').textContent='无人系统暂未加载，请重新选择无人。';}console.error('Autonomous model load failed',error);return;}
    if(token!==navigation)return;
    loading.hidden=true;showcase?.busy(false);
  }
  loaded=true;document.querySelectorAll('[data-car]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.car===car)));
  department=nextDepartment;group=nextGroup;showGroups();updateSelection();
  showcase?.select({department,group,name:selectedDefinition().short||selectedDefinition().name});
  activeView='perspective';
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view==='perspective')));
  if(department!=='all'){autoFit=false;director.select(department,group||department,department==='driverless'?'a08':powerVariant);}
  else{director.back();focusTarget.copy(controls.target);updateWorkUI(director.state());}
}
function chooseDepartment(id){navigateSystem(id);}
function chooseGroup(id){navigateSystem(groups[id].department,id,groups[id].vehicle);}
function updateWorkUI(state){
  if(presentation){
    const sceneLabel=state.phase==='overview'?'C41 赛车结构，随页面滚动展开；通过部门按钮查看系统演示':state.department==='driverless'?'A08 无人系统，展示转向、制动、储气与感知设备':state.department==='operations'?'CQUFSAE 运营部，无限符号动画':state.department==='power'&&powerVariant==='e74'?'E74 电驱系统工作演示':`C41 ${groups[state.mode]?.short||groups[state.mode]?.name||departments[state.department]?.name||'赛车系统'}工作演示`;
    if(host.getAttribute('aria-label')!==sceneLabel)host.setAttribute('aria-label',sceneLabel);
  }
  $('#cockpit-view').hidden=state.mode!=='frame';
  if(state.phase==='overview'){autoFit=false;focusTarget.copy(controls.target);overviewFit=null;}
  const working=state.phase!=='overview';
  $('#work-controls').hidden=!working;$('.ex-timeline').hidden=working;$('#return-overview').hidden=!working;
  $('#work-toggle').textContent=state.paused?'播放演示':'暂停演示';
  $('#work-location').textContent=working?`${departments[state.department]?.name||''} / 工作演示`:'整车 / 结构展开';
  $('#work-principle').hidden=!working;
  $('#work-principle').textContent=state.department==='structure'?'观察前翼、车身与尾翼附近的气流，相对流速以颜色表示。':state.department==='operations'?'车队组织与协作流程示意。':'各系统共享同一行驶工况；内部剖面用于说明机构原理。';
  if(state.mode==='frame')$('#work-principle').textContent='颜色由蓝到红表示相对应力由低到高，随转向、制动和轮跳变化。';
  $('#power-variants').hidden=state.department!=='power';
  $('#model-caption').textContent=state.department==='driverless'?'A08 / 无人系统':state.department==='power'?(powerVariant==='e74'?'整车视角 / 电驱结构对照':'C41 / 燃油动力'):'C41 / 整车结构';
  document.querySelectorAll('[data-power]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.power===powerVariant)));
  if(state.department==='driverless')$('#work-principle').textContent='按 A08 装配模型展示转向、制动、储气装置与感知设备。动作演示用于说明机构关系。';
  stage.dataset.phase=state.phase;
  if(state.department==='chassis')$('#work-principle').textContent='麋鹿工况：转向变道、路面起伏、制动减速与重新加速。运动参数用于原理演示。';
  if(state.department==='power'&&powerVariant==='e74')$('#work-principle').textContent=state.mode==='battery'?'透过箱体与上部板件，观察电芯排列、模组和连接件。':state.mode==='wiring'?'透过高压盒盖板，观察内部元件与连接布置。':'观察电池、控制器、电机与后桥之间的动力传递。';
  if(state.department==='operations'){$('#work-principle').hidden=true;$('#model-caption').textContent='CQUFSAE / 运营部';}
  const transition=state.phase==='transitioning';
  ['zoom-in','zoom-out','reset-camera'].forEach(id=>$('#'+id).disabled=transition);
  document.querySelectorAll('[data-view]').forEach(b=>b.disabled=transition);
}
function changeView(kind){
  activeView=kind;
  autoFit=false;
  const dirs={perspective:[2.8,6,3],side:[0,7,1.2],front:[7,.01,1.2],top:[.01,.001,7],cockpit:[5.4,2.4,8]};
  const direction=new THREE.Vector3(...dirs[kind]);
  if(director.state().phase==='working'&&director.viewDirection?.(direction,{subject:kind==='cockpit'?'cockpit':undefined})){
    viewTween=null;
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===kind)));
    return;
  }
  director.releaseCamera();
  const list=director.focusMeshes()||meshes;
  const points=kind==='cockpit'?director.cockpitPoints():director.state().phase==='overview'?director.overviewPoints():visiblePoints(list);
  const frame=fitPoints(points,camera,direction);
  viewTween={from:camera.position.clone(),to:frame.position,start:performance.now(),fromTarget:controls.target.clone(),target:frame.target,fromZoom:camera.zoom};
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===kind)));
}
let lastFitProgress=-1,overviewFit=null;
function updateFieldLegend(condition){
  const legend=$('#flow-legend'),frame=condition?.frameResponse,stress=frame?.amount||0,flow=condition?.aeroAlpha||0;
  const mode=stress>flow?'stress':'flow',amount=Math.max(stress,flow);
  legend.hidden=amount<.02;legend.style.opacity=String(amount);
  if(legend.dataset.mode!==mode){
    legend.dataset.mode=mode;
    legend.querySelector(':scope > span').textContent=mode==='stress'?'相对应力':'相对流速';
    legend.querySelector('small').textContent=mode==='stress'?'载荷响应':'流向示意';
    legend.querySelector('i').style.background=mode==='stress'?'linear-gradient(90deg,#2458d4,#16bace 28%,#64c778 48%,#f0d74f 68%,#ec8a35 84%,#cf3933)':'';
    const resultLink=legend.querySelector('.flow-result-link');if(resultLink)resultLink.style.display=mode==='stress'?'none':'';
  }
  stage.dataset.frameResponse=String(frame?.active||false);stage.dataset.frameStress=(frame?.relativePeak||0).toFixed(3);
}

function render(now){
  const elapsed=(now-previous)/1000,dt=Math.min(.15,elapsed);previous=now;
  if(showcase&&!showcase.visible())return;
  stage.dataset.visibility=document.visibilityState;
  if(loaded&&elapsed>0){frameDurations.push(elapsed*1000);if(frameDurations.length>120)frameDurations.shift();if(frameDurations.length%15===0){stage.dataset.frameMs=(frameDurations.reduce((a,b)=>a+b,0)/frameDurations.length).toFixed(1);stage.dataset.frameMaxMs=Math.max(...frameDurations).toFixed(1);}}
  if(playing){const t=clamp((now-flightStart)/flightDuration);progress=flightFrom+(flightTo-flightFrom)*ease(t);if(t>=1){playing=false;$('#play-explosion').innerHTML='<span aria-hidden="true">↗</span> 重播展开';updateSelection();finishFlight?.(true);finishFlight=null;}}
  if(showcase&&loaded){progress=showcase.beforeFrame(dt,director.state().phase,progress);autoFit=false;}
  const cpuStart=performance.now(),work=director.update(dt,{explosion:progress});
  stage.dataset.updateMs=(performance.now()-cpuStart).toFixed(1);
  if(work.phase!=='overview')progress=work.explosion;
  stage.dataset.phase=work.phase;stage.dataset.workTime=work.time.toFixed(3);stage.dataset.workMode=work.mode;stage.dataset.transitionStage=work.transitionStage||'';
  if(work.caption!==lastMotionCaption){$('#work-caption').textContent=work.caption;lastMotionCaption=work.caption;}
  $('#work-progress').value=(work.time%36).toFixed(2);
  const condition=work.motion,conditionVisible=work.phase!=='overview'&&work.department!=='operations'&&!!condition;
  $('#condition-readout').hidden=!conditionVisible;
  if(conditionVisible){$('#condition-stage').textContent=condition.stage;$('#condition-speed').value=condition.speed;$('#condition-brake').value=condition.brake;stage.dataset.condition=condition.stage;stage.dataset.steer=condition.steer.toFixed(4);stage.dataset.brake=condition.brake.toFixed(3);stage.dataset.springCompression=condition.chassis.dampers.map(d=>(d.compression*1000).toFixed(2)).join(',');}
  updateFieldLegend(condition);
  stage.dataset.flowLines=String(condition?.aeroLines||0);stage.dataset.flowSurfaces=(condition?.aeroSurfaceCounts||[]).join(',');stage.dataset.flowOuterPaths=String(condition?.aeroOuterPaths||0);stage.dataset.playbackRate=String(work.displayTimeScale);
  // The working road receives the actual shadow at its sampled height. Fade the
  // planar overview receivers by the same continuous weight to avoid two floors.
  const roadCoverage=clamp(work.motion?.roadSurface?.shadowCoverageWeight??0);
  if(contactShadow){contactShadow.material.opacity=.22*(1-roadCoverage);contactShadow.visible=contactShadow.material.opacity>1e-5;}
  if(shadow){shadow.material.opacity=(work.phase==='overview'?1-progress*.55:['chassis','driverless'].includes(work.department)?.7:(1-progress*.55)*(1-work.blend))*(work.motion?.variants?.assemblyAlpha??1)*(1-roadCoverage);shadow.visible=shadow.material.opacity>1e-5;const shift=work.motion?.carOffset,amount=work.phase==='working'?1:work.phase==='returning'?work.blend:0;shadow.position.x=(shift?.x||0)*amount;shadow.position.y=(shift?.y||0)*amount;}
  if(!presentation&&!dragging&&work.phase==='overview'&&!viewTween)controls.target.lerp(focusTarget,1-Math.exp(-dt*3));
  if(viewTween){const t=reduced()?1:ease(clamp((now-viewTween.start)/850));camera.position.lerpVectors(viewTween.from,viewTween.to,t);controls.target.lerpVectors(viewTween.fromTarget,viewTween.target,t);camera.zoom=THREE.MathUtils.lerp(viewTween.fromZoom,1,t);camera.updateProjectionMatrix();if(t===1){focusTarget.copy(viewTween.target);viewTween=null;}}
  if(flightCamera&&work.phase==='overview'){
    const t=reduced()?1:ease(clamp((now-flightCamera.start)/900)),frame=flightCamera.track(progress),fromDirection=flightCamera.from.clone().sub(flightCamera.fromTarget),toDirection=frame.position.clone().sub(frame.target),radius=THREE.MathUtils.lerp(fromDirection.length(),toDirection.length(),t),direction=fromDirection.normalize().lerp(toDirection.normalize(),t).normalize();
    controls.target.lerpVectors(flightCamera.fromTarget,frame.target,t);camera.position.copy(controls.target).addScaledVector(direction,radius);camera.zoom=1;camera.updateProjectionMatrix();focusTarget.copy(controls.target);if(!playing&&t===1)flightCamera=null;
  }
  controls.update();
  if(autoFit&&meshes.length&&work.phase==='overview'){
    if(Math.abs(progress-lastFitProgress)>.003||!overviewFit){
      overviewFit=fitPoints(director.overviewPoints(),camera,new THREE.Vector3(1.8,7,2.6));lastFitProgress=progress;
    }
    camera.position.lerp(overviewFit.position,1-Math.exp(-dt*8));controls.target.lerp(overviewFit.target,1-Math.exp(-dt*8));
    focusTarget.copy(overviewFit.target);camera.zoom=1;camera.updateProjectionMatrix();controls.update();
  }
  showcase?.afterFrame(work,dt,progress);
  range.value=Math.round(progress*100);value.value=`${Math.round(progress*100)}%`;value.textContent=value.value;
  stage.dataset.progress=progress.toFixed(3);
  if(work.phase==='overview'&&department==='all'){const status=overviewStatus();if($('#related-parts').textContent!==status)$('#related-parts').textContent=status;}
  const focusAmount=3*(work.focusStrength||0);
  renderScope=[loaded?'model':'loading',work.phase,work.mode,work.variant,activeView,work.paused?'paused':'playing',progress===0?'assembled':progress===1?'exploded':'extracting'].join('/');
  const drawStart=performance.now(),timing=!gpuPass&&renderTelemetry.begin(renderScope);
  let renderStats;
  renderer.getDrawingBufferSize(drawingSize);
  try{renderStats=contextGeometry.render(scene,camera,()=>sectionCulling.render(scene,camera,()=>systemFocus.render(scene,camera,focusAmount)),{strength:work.focusStrength||0,pixelHeight:drawingSize.y});}finally{if(timing)renderTelemetry.end();}
  stage.dataset.drawMs=(performance.now()-drawStart).toFixed(1);
  stage.dataset.meshes=String(meshes.length);stage.dataset.triangles=String(renderStats.triangles);stage.dataset.focusBlur=focusAmount.toFixed(3);
  const gpu=renderTelemetry.snapshot();
  if(gpu.enabled){stage.dataset.gpuStatus=gpu.status;stage.dataset.gpuScope=gpu.label;stage.dataset.gpuMs=gpu.lastMs===null?'':gpu.lastMs.toFixed(2);stage.dataset.gpuMedianMs=gpu.medianMs===null?'':gpu.medianMs.toFixed(2);stage.dataset.gpuP95Ms=gpu.p95Ms===null?'':gpu.p95Ms.toFixed(2);stage.dataset.gpuSamples=String(gpu.count);stage.dataset.colorCalls=String(renderStats.colorCalls);stage.dataset.maskCalls=String(renderStats.maskCalls);stage.dataset.maskTriangles=String(renderStats.maskTriangles);}
  if(reviewEnabled){const lod=contextGeometry.diagnostics(),section=sectionCulling.diagnostics(),road=work.motion?.roadSurface;stage.dataset.contextLod=lod.status;stage.dataset.contextMeshes=String(lod.meshes);stage.dataset.contextTrianglesSaved=String(lod.trianglesSaved);stage.dataset.contextMaxErrorPx=lod.maxProjectedError.toFixed(4);stage.dataset.maskSize=`${renderStats.maskWidth||0}x${renderStats.maskHeight||0}`;stage.dataset.sectionCulling=String(section.enabled);stage.dataset.sectionRegistered=String(section.registered);stage.dataset.sectionMeshes=String(section.culledMeshes);stage.dataset.sectionTrianglesSaved=String(section.trianglesSaved);stage.dataset.sectionCallsSaved=String(section.callsSaved);stage.dataset.roadCoverage=roadCoverage.toFixed(5);stage.dataset.planarShadowOpacity=(contactShadow?.material.opacity??0).toFixed(5);stage.dataset.roadTriangles=String(road?.grid.triangles??0);stage.dataset.roadHeightRange=road?road.bounds.min[2].toFixed(6)+','+road.bounds.max[2].toFixed(6):'';stage.dataset.roadOffset=road?.courseOffset.map(x=>x.toFixed(5)).join(',')??'';}
  $('#vehicle-response').hidden=true;
  workLabels.update(director.labels(),camera,{suppressed:activeView==='cockpit',reduced:reduced()});

}

function zoomModel(factor){
  director.releaseCamera();
  autoFit=false;const direction=camera.position.clone().sub(controls.target),distance=Math.max(.3,Math.min(18,direction.length()*factor));
  const destination=controls.target.clone().add(direction.normalize().multiplyScalar(distance));
  viewTween={from:camera.position.clone(),to:destination,start:performance.now(),fromTarget:controls.target.clone(),target:controls.target.clone(),fromZoom:camera.zoom};
}
$('#zoom-in').addEventListener('click',()=>zoomModel(.78));
$('#zoom-out').addEventListener('click',()=>zoomModel(1.28));
document.querySelectorAll('[data-power]').forEach(button=>button.addEventListener('click',()=>navigateSystem('power',null,button.dataset.power)));
$('#focus-view').addEventListener('click',()=>{const focus=document.documentElement.classList.toggle('focus-view');$('#focus-view').textContent=focus?'退出专注 ↙':'专注查看 ↗';overviewFit=null;});
document.querySelectorAll('[data-department]').forEach(button=>button.addEventListener('click',()=>chooseDepartment(button.dataset.department)));
$('#play-explosion').addEventListener('click',async()=>{if(playing){playing=false;finishFlight?.(false);finishFlight=null;$('#play-explosion').innerHTML='<span aria-hidden="true">↗</span> 继续展开';}else{if(progress>.98){const complete=await animateTo(0);if(!complete)return;}animateTo(1);}});
$('#assemble-car').addEventListener('click',()=>{department='all';group=null;showGroups();updateSelection();animateTo(0);});
range.addEventListener('input',()=>{playing=false;finishFlight?.(false);finishFlight=null;flightCamera=null;autoFit=true;overviewFit=null;progress=Number(range.value)/100;targetProgress=progress;$('#play-explosion').innerHTML=`<span aria-hidden="true">↗</span> ${progress>.98?'重播展开':progress<.01?'展开整车':'继续展开'}`;updateSelection();});
$('#reset-camera').addEventListener('click',()=>changeView('perspective'));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>changeView(b.dataset.view)));
$('#return-overview').addEventListener('click',()=>navigateSystem('all'));
$('#work-back').addEventListener('click',()=>navigateSystem('all'));
$('#work-toggle').addEventListener('click',()=>director.pause());
$('#work-replay').addEventListener('click',()=>director.replay());
$('#work-progress').addEventListener('input',e=>director.scrub(Number(e.target.value)));
$('#retry-model').addEventListener('click',()=>location.reload());
function motionPreference(){
  director?.reduce();
  showcase?.motionChanged();
  $('#ex-reduce').setAttribute('aria-pressed',String(reduced()));$('#ex-reduce').textContent=reduced()?'动态已减少':'减少动态';
  if(reduced()&&playing){progress=flightTo;playing=false;finishFlight?.(true);finishFlight=null;$('#play-explosion').innerHTML='<span aria-hidden="true">↗</span> 重播展开';}
}
$('#ex-reduce').addEventListener('click',()=>{manualReduced=!manualReduced;try{localStorage.setItem('cqufsae-reduce-motion',manualReduced?'1':'0');}catch{}motionPreference();});
reducedSystem.addEventListener('change',motionPreference);motionPreference();
addEventListener('storage',event=>{if(event.key==='cqufsae-reduce-motion'){manualReduced=event.newValue==='1';motionPreference();}});
if(presentation)document.addEventListener('motionpreference',()=>{try{manualReduced=localStorage.getItem('cqufsae-reduce-motion')==='1';}catch{}motionPreference();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){playing=false;finishFlight?.(false);finishFlight=null;$('#play-explosion').innerHTML='<span aria-hidden="true">↗</span> 继续展开';}});
try{init();await loadCar('c41');if(pendingPresentationSelection){const request=pendingPresentationSelection;pendingPresentationSelection=null;navigateSystem(request.nextDepartment,request.nextGroup,request.nextCar);}}catch(error){showError('当前设备的三维视图暂未就绪，可先查看整车图片。');console.error('3D view unavailable',error);}
