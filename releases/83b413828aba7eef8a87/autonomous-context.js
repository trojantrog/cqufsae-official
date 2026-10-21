import * as T from './vendor/three.module.min.js';

const V=(...a)=>new T.Vector3(...a),clamp=x=>T.MathUtils.clamp(x,0,1),smooth=x=>{x=clamp(x);return x*x*x*(3-2*x);};
const styles={body:{color:0x81786b,opacity:.105,budget:1800},frame:{color:0x787268,opacity:.16,budget:100},
 tyre:{color:0x62625d,opacity:.19,budget:420},rim:{color:0x827d72,opacity:.105,budget:280},suspension:{color:0x79766d,opacity:.15,budget:180}};

function category(source){
 const d=source.userData||{};if(d.variant==='e74'||d.variant==='a08')return null;
 if(d.label==='轮胎')return 'tyre';if(d.label==='轮辋')return 'rim';
 if(d.group==='body'&&['fr-body','fr-aero'].includes(d.mechanism))return 'body';
 if(d.group==='frame'&&d.mechanism==='fr-frame')return 'frame';
 if(/su-(front|rear)_(uca|lca|upright)|st-tie_rods/.test(d.mechanism||'')){
  source.geometry.computeBoundingBox();if(source.geometry.boundingBox.getSize(V()).length()>.18)return 'suspension';
 }
 return null;
}

// Edge adjacency is derived from the original tessellation. The line geometry
// shares its immutable position attribute; it owns only the sparse edge index.
function* topology(source){
 const p=source.geometry.attributes.position,ix=source.geometry.index?.array,vertices=p.array,keys=new Array(p.count),edges=new Map();
 for(let i=0;i<p.count;i++){keys[i]=Math.round(vertices[i*3]*1e5)+','+Math.round(vertices[i*3+1]*1e5)+','+Math.round(vertices[i*3+2]*1e5);if(i&&i%8192===0)yield;}
 const count=ix?.length||p.count;
 for(let i=0;i+2<count;i+=3){
  const a=ix?ix[i]:i,b=ix?ix[i+1]:i+1,c=ix?ix[i+2]:i+2,A=a*3,B=b*3,C=c*3;
  const ux=vertices[B]-vertices[A],uy=vertices[B+1]-vertices[A+1],uz=vertices[B+2]-vertices[A+2],
   vx=vertices[C]-vertices[A],vy=vertices[C+1]-vertices[A+1],vz=vertices[C+2]-vertices[A+2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const length=Math.hypot(nx,ny,nz);if(length<1e-12)continue;
  nx/=length;ny/=length;nz/=length;
  for(const [s,e] of [[a,b],[b,c],[c,a]]){
   if(keys[s]===keys[e])continue;const key=keys[s]<keys[e]?keys[s]+'|'+keys[e]:keys[e]+'|'+keys[s],edge=edges.get(key);
   if(edge){edge[5]++;if(edge[5]===2)edge.push(nx,ny,nz);}
   else edges.set(key,[s,e,nx,ny,nz,1]);
  }
  if(i&&i%24576===0)yield;
 }
 const endpoints=[],normals=[],features=[],lengths=[];const crease=Math.cos(28*Math.PI/180);
 let packed=0;for(const edge of edges.values()){
  const [a,b,nx,ny,nz,n]=edge,A=a*3,B=b*3,length=Math.hypot(vertices[A]-vertices[B],vertices[A+1]-vertices[B+1],vertices[A+2]-vertices[B+2]);
  if(length<.0025)continue;
  const n2=n===2?edge.slice(6,9):[nx,ny,nz];endpoints.push(a,b);normals.push(nx,ny,nz,...n2);
  features.push(n!==2||nx*n2[0]+ny*n2[1]+nz*n2[2]<crease?1:0);lengths.push(length);
  if(++packed%8192===0)yield;
 }
 return {endpoints:new Uint32Array(endpoints),normals:new Float32Array(normals),features:new Uint8Array(features),lengths:new Float32Array(lengths),vertices};
}

export function createAutonomousContext(sources=[],{camera=null,maxSegments=12000,viewThresholdDegrees=1.2}={}){
 const root=new T.Group();root.name='autonomous-whole-vehicle-reference';const lines=[],bindings=[];
 const started=performance.now(),framing=[],pending=[],basis=V(1.6,7,2.8),worldEye=V(),inverseRoot=new T.Matrix4();
 let viewCamera=camera,last={ready:false,sourceParts:0,segments:0,updateMilliseconds:0},disposed=false,prepared=false,preparePromise=null,prepareMilliseconds=0,maximumPrepareSliceMilliseconds=0;
 for(const source of sources){
  if(!source?.isMesh||!source.geometry?.attributes.position)continue;const kind=category(source);if(!kind)continue;
  pending.push({source,kind});
  const box=source.geometry.boundingBox||new T.Box3().setFromBufferAttribute(source.geometry.attributes.position);
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])framing.push(V(x,y,z));
 }
 const initMilliseconds=performance.now()-started,cosThreshold=Math.cos(viewThresholdDegrees*Math.PI/180);
 function install(source,kind,data){
  const style=styles[kind],geometry=new T.BufferGeometry(),budget=Math.min(style.budget,data.endpoints.length/2);
  geometry.setAttribute('position',source.geometry.attributes.position);geometry.setIndex(new T.BufferAttribute(new Uint32Array(budget*2),1));geometry.setDrawRange(0,0);
  const material=new T.LineBasicMaterial({color:style.color,transparent:true,opacity:0,depthWrite:false,depthTest:true,toneMapped:false});
  const line=new T.LineSegments(geometry,material);line.name='vehicle-reference-'+source.userData.id;line.matrixAutoUpdate=false;line.frustumCulled=false;
  line.userData={referenceSource:source,contextOnly:true,partCounted:false,kind,defocusWeight:0};root.add(line);lines.push(line);
  bindings.push({source,line,kind,data,budget,lastEye:null,lastTime:null,lastRefreshMs:0,candidates:[],inverseSource:new T.Matrix4(),segments:0});
 }
 function prepare(){
  if(preparePromise)return preparePromise;
  preparePromise=(async()=>{
   const start=performance.now();
   for(const {source,kind} of pending){
    const iterator=topology(source);let result;
    do{const slice=performance.now();do{result=iterator.next();}while(!result.done&&performance.now()-slice<12);maximumPrepareSliceMilliseconds=Math.max(maximumPrepareSliceMilliseconds,performance.now()-slice);
     if(!result.done)await new Promise(resolve=>setTimeout(resolve,0));
    }while(!result.done&&!disposed);
    if(disposed)break;install(source,kind,result.value);await new Promise(resolve=>setTimeout(resolve,0));
   }
   prepared=!disposed;prepareMilliseconds=performance.now()-start;last={...last,ready:prepared&&bindings.length>0,sourceParts:bindings.length};return diagnostics();
  })();return preparePromise;
 }

 function edgeSelection(binding,eye){
  const {data,kind}=binding,{vertices,endpoints,normals,features,lengths}=data,candidates=binding.candidates;candidates.length=0;
  for(let i=0;i<features.length;i++){
   let draw=!!features[i];
   if(!draw&&kind!=='rim'){
    const a=endpoints[i*2]*3,b=endpoints[i*2+1]*3,n=i*6,x=eye.x-(vertices[a]+vertices[b])*.5,y=eye.y-(vertices[a+1]+vertices[b+1])*.5,z=eye.z-(vertices[a+2]+vertices[b+2])*.5;
    draw=(normals[n]*x+normals[n+1]*y+normals[n+2]*z)*(normals[n+3]*x+normals[n+4]*y+normals[n+5]*z)<0;
   }
   if(draw)candidates.push(i);
  }
  if(candidates.length>binding.budget){candidates.sort((a,b)=>lengths[b]-lengths[a]);candidates.length=binding.budget;}
  const index=binding.line.geometry.index.array;
  for(let i=0;i<candidates.length;i++){index[i*2]=endpoints[candidates[i]*2];index[i*2+1]=endpoints[candidates[i]*2+1];}
  binding.line.geometry.index.needsUpdate=true;binding.line.geometry.setDrawRange(0,candidates.length*2);binding.segments=candidates.length;
 }

 function update(focus=[],motion={}){
  if(disposed)return last;const tick=performance.now(),weight=focus.reduce((n,r)=>n+(r.department==='driverless'?r.weight:0),0),alpha=smooth(weight);
  const localFocus=weight>1e-9?focus.reduce((n,r)=>n+(r.department==='driverless'&&(r.mode==='control'||r.mode==='algorithm')?r.weight:0),0)/weight:0;
  root.visible=prepared&&alpha>.002;if(!root.visible){last={...last,segments:0,updateMilliseconds:performance.now()-tick};return diagnostics();}
  root.updateWorldMatrix(true,false);inverseRoot.copy(root.matrixWorld).invert();
  if(viewCamera){viewCamera.updateWorldMatrix(true,false);viewCamera.getWorldPosition(worldEye);}
  let segments=0,recomputed=0;
  for(const binding of bindings){
   const {source,line,kind}=binding;source.updateWorldMatrix(true,false);line.matrix.copy(inverseRoot).multiply(source.matrixWorld);line.matrixWorldNeedsUpdate=true;
   const eye=viewCamera?worldEye.clone().applyMatrix4(binding.inverseSource.copy(source.matrixWorld).invert()):basis.clone().multiplyScalar(4);
   const direction=eye.clone().sub(source.geometry.boundingSphere?.center||V()).normalize(),changed=!binding.lastEye||direction.dot(binding.lastEye)<cosThreshold;
   const time=motion.conditionTime??0,ready=binding.lastTime===null||time<binding.lastTime||time-binding.lastTime>=.05||tick-binding.lastRefreshMs>=50;
   if(!binding.lastEye||kind!=='rim'&&changed&&ready){edgeSelection(binding,eye);binding.lastEye=direction;binding.lastTime=time;binding.lastRefreshMs=tick;recomputed++;}
   const remaining=Math.max(0,maxSegments-segments),count=Math.min(binding.segments,remaining);line.geometry.setDrawRange(0,count*2);segments+=count;
   line.material.opacity=styles[kind].opacity*alpha*(1-.35*localFocus);line.visible=count>0&&line.material.opacity>.002;
  }
  root.updateMatrixWorld(true);last={ready:bindings.length>0,sourceParts:bindings.length,segments,recomputed,initMilliseconds,updateMilliseconds:performance.now()-tick,conditionTime:motion.conditionTime??0,
   categories:Object.fromEntries(Object.keys(styles).map(kind=>[kind,bindings.filter(b=>b.kind===kind).length])),referenceVehicle:'c41',geometryCopied:false};return diagnostics();
 }
 function diagnostics(){return {...last,prepared,preparing:!!preparePromise&&!prepared,initMilliseconds,prepareMilliseconds,maximumPrepareSliceMilliseconds,sourceCandidates:pending.length};}
 return {root,lines,update,prepare,setCamera(value){viewCamera=value;for(const b of bindings)b.lastEye=null;},
  framingPoints(request={}){return request.department==='driverless'&&['driverless','all'].includes(request.mode)?framing.map(p=>p.clone()):[];},
  labels(){return [];},diagnostics,
  dispose(){if(disposed)return;disposed=true;for(const line of lines){line.geometry.dispose();line.material.dispose();}root.clear();bindings.length=0;lines.length=0;}
 };
}
