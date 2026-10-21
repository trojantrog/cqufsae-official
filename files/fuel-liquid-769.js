import * as T from './vendor/three.module.min.js';

const defaults={x0:-.0825,x1:.0825,z0:.0035,z1:.1765,bottom:-.0583,level:-.030,left:-.05425,right:.05425,front:.0534394,rear:.1265606};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
const number=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const PI=Math.PI;

export function createFuelLiquid({tank:sourceTank,holes=[],environment=null,environmentRotation=null}={}){
 const tank={...defaults,...sourceTank},level=-.014,baffleTop=-.0195,maxExcursion=.0092;
 const width=tank.x1-tank.x0,length=tank.z1-tank.z0,cx=(tank.x0+tank.x1)/2,cz=(tank.z0+tank.z1)/2;
 const nx=56,nz=58,row=nx+1,count=row*(nz+1),dx=width/nx,dz=length/nz,invX=1/dx,invZ=1/dz,ix2=invX*invX,iz2=invZ*invZ;
 const root=new T.Group();root.name='fuel-liquid-769';root.visible=false;root.userData.illustrativeOverlay=true;
 const owned=new Set(),own=value=>(owned.add(value),value),items=[];
 const wave=new Float32Array(count),velocity=new Float32Array(count),height=new Float32Array(count),damping=new Float32Array(count),speed=new Float32Array(count),forceX=new Float32Array(count),forceZ=new Float32Array(count),crest=new Float32Array(count);
 const uniforms={fuelTime:{value:0},fuelEnergy:{value:0}};
 const slosh={x:0,z:0,vx:0,vz:0};
 let disposed=false,lastTime=null,lastRoll=0,lastPitch=0,lastBrake=0,energy=0,peakWave=0,peakVelocity=0,amplitudeScale=1,minSurface=level,maxSurface=level,alpha=0;

 // The full free surface covers the submerged plates. Their actual top edges
 // create smooth underwater bands of reduced propagation and greater loss.
 const frontAtTop=tank.front+(baffleTop-tank.level),rearAtTop=tank.rear-(baffleTop-tank.level);
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
  const k=j*row+i,u=i/nx,v=j/nz,x=tank.x0+u*width,z=tank.z0+v*length;
  const transverse=Math.max(Math.exp(-Math.pow((z-frontAtTop)/.0065,2)),Math.exp(-Math.pow((z-rearAtTop)/.0065,2)));
  const middle=clamp((z-frontAtTop)/.007,0,1)*clamp((rearAtTop-z)/.007,0,1);
  const longitudinal=Math.max(Math.exp(-Math.pow((x-tank.left)/.0055,2)),Math.exp(-Math.pow((x-tank.right)/.0055,2)))*middle;
  const plate=Math.max(transverse,longitudinal);
  damping[k]=1.20+plate*3.4;speed[k]=.20**2*(1-plate*.57);
  forceX[k]=(Math.exp(-u*width/.014)-Math.exp(-(1-u)*width/.014))*(.42+.58*Math.sin(PI*v));
  forceZ[k]=(Math.exp(-v*length/.014)-Math.exp(-(1-v)*length/.014))*(.42+.58*Math.sin(PI*u));
 }

 const sampling={y:level,dx:0,dz:0,crest:0};
 function sample(x,z,out=sampling){
  const gx=clamp((x-tank.x0)/width,0,.999999)*nx,gz=clamp((z-tank.z0)/length,0,.999999)*nz,i=Math.floor(gx),j=Math.floor(gz),fx=gx-i,fz=gz-j,k=j*row+i;
  const a=height[k],b=height[k+1],c=height[k+row],d=height[k+row+1];
  out.y=(a*(1-fx)+b*fx)*(1-fz)+(c*(1-fx)+d*fx)*fz;
  out.dx=((b-a)*(1-fz)+(d-c)*fz)*invX;out.dz=((c-a)*(1-fx)+(d-b)*fx)*invZ;
  out.crest=(crest[k]*(1-fx)+crest[k+1]*fx)*(1-fz)+(crest[k+row]*(1-fx)+crest[k+row+1]*fx)*fz;return out;
 }
 height.fill(level);
 function builder(){return {positions:[],normals:[],depths:[],bands:[],crests:[],indices:[],vertices:[]};}
 function vertex(b,x,z,{bottom=false,normal=null,lift=0,band=1}={}){
  const i=b.positions.length/3;b.positions.push(x,bottom?tank.bottom:level+lift,z);b.normals.push(...(normal||[0,1,0]));b.depths.push(bottom?1:0);b.bands.push(band);b.crests.push(0);b.vertices.push({i,x,z,bottom,normal,lift});return i;
 }
 function quad(b,a,c,d,e){b.indices.push(a,c,d,d,c,e);}
 function finish(b){
  const g=own(new T.BufferGeometry());g.setAttribute('position',new T.Float32BufferAttribute(b.positions,3).setUsage(T.DynamicDrawUsage));g.setAttribute('normal',new T.Float32BufferAttribute(b.normals,3).setUsage(T.DynamicDrawUsage));g.setAttribute('fuelDepth',new T.Float32BufferAttribute(b.depths,1));g.setAttribute('fuelBand',new T.Float32BufferAttribute(b.bands,1));g.setAttribute('fuelCrest',new T.Float32BufferAttribute(b.crests,1).setUsage(T.DynamicDrawUsage));g.setIndex(b.indices);
  g.boundingBox=new T.Box3(new T.Vector3(tank.x0,tank.bottom,tank.z0),new T.Vector3(tank.x1,level+maxExcursion+.001,tank.z1));g.boundingSphere=g.boundingBox.getBoundingSphere(new T.Sphere());return {geometry:g,vertices:b.vertices};
 }
 const topBuilder=builder(),bodyBuilder=builder(),rimBuilder=builder();
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)vertex(topBuilder,tank.x0+i*dx,tank.z0+j*dz);
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*row+i,b=a+row;quad(topBuilder,a,b,a+1,b+1);}
 const edges=[{x0:tank.x0,z0:tank.z0,x1:tank.x1,z1:tank.z0,n:[0,0,-1],steps:nx,inward:[0,1]},
  {x0:tank.x1,z0:tank.z0,x1:tank.x1,z1:tank.z1,n:[1,0,0],steps:nz,inward:[-1,0]},
  {x0:tank.x1,z0:tank.z1,x1:tank.x0,z1:tank.z1,n:[0,0,1],steps:nx,inward:[0,-1]},
  {x0:tank.x0,z0:tank.z1,x1:tank.x0,z1:tank.z0,n:[-1,0,0],steps:nz,inward:[1,0]}];
 for(const edge of edges){
  let previousBody=null,previousRim=null;
  for(let i=0;i<=edge.steps;i++){
   const u=i/edge.steps,x=T.MathUtils.lerp(edge.x0,edge.x1,u),z=T.MathUtils.lerp(edge.z0,edge.z1,u);
   const a=vertex(bodyBuilder,x,z,{normal:edge.n}),b=vertex(bodyBuilder,x,z,{normal:edge.n,bottom:true});if(previousBody)quad(bodyBuilder,previousBody[0],previousBody[1],a,b);previousBody=[a,b];
   const outer=vertex(rimBuilder,x,z,{lift:.00052,band:1}),inner=vertex(rimBuilder,x+edge.inward[0]*.00115,z+edge.inward[1]*.00115,{lift:.00003,band:0});
   if(previousRim)quad(rimBuilder,previousRim[0],previousRim[1],outer,inner);previousRim=[outer,inner];
  }
 }
 const top=finish(topBuilder),body=finish(bodyBuilder),rim=finish(rimBuilder);

 function patch(material,kind){
  material.onBeforeCompile=shader=>{
   shader.uniforms.fuelTime=uniforms.fuelTime;shader.uniforms.fuelEnergy=uniforms.fuelEnergy;
   shader.vertexShader='attribute float fuelDepth;attribute float fuelBand;attribute float fuelCrest;varying vec3 vFuelLocal;varying vec3 vFuelSurfaceNormal;varying float vFuelDepth;varying float vFuelBand;varying float vFuelCrest;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFuelLocal=position;vFuelSurfaceNormal=normal;vFuelDepth=fuelDepth;vFuelBand=fuelBand;vFuelCrest=fuelCrest;');
   shader.fragmentShader='uniform float fuelTime;uniform float fuelEnergy;varying vec3 vFuelLocal;varying vec3 vFuelSurfaceNormal;varying float vFuelDepth;varying float vFuelBand;varying float vFuelCrest;\n'+shader.fragmentShader;
   if(kind==='surface'){
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
     float fuelMicro=(sin(vFuelLocal.x*214.+vFuelLocal.z*78.-fuelTime*2.2*fuelEnergy)+.45*sin(vFuelLocal.z*348.-vFuelLocal.x*116.+fuelTime*2.8*fuelEnergy))*(.000055+.00020*fuelEnergy);
     vec3 fuelDpdx=dFdx(-vViewPosition),fuelDpdy=dFdy(-vViewPosition);
     vec3 fuelR1=cross(fuelDpdy,normal),fuelR2=cross(normal,fuelDpdx);
     float fuelDet=dot(fuelDpdx,fuelR1);
     normal=normalize(max(abs(fuelDet),1.e-15)*normal-sign(fuelDet)*(dFdx(fuelMicro)*fuelR1+dFdy(fuelMicro)*fuelR2));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
     vec3 fuelView=normalize(vViewPosition),fuelReflection=reflect(-fuelView,normal);
     float fuelFresnel=.025+.975*pow(1.-clamp(abs(dot(normal,fuelView)),0.,1.),5.);
     float fuelWindow=pow(max(0.,dot(fuelReflection,normalize(vec3(-.46,.72,.52)))),26.);
     float fuelStrip=pow(max(0.,1.-abs(dot(fuelReflection,normalize(vec3(.84,-.16,.52))))),115.)*smoothstep(-.35,.32,fuelReflection.y);
     float fuelCrestLight=pow(clamp(vFuelCrest,0.,1.),3.);
     // A long softbox catches curved slopes. Its highlight follows the solved
     // surface normals, so a resting surface has no scrolling painted streaks.
     vec3 fuelSlope=normalize(vFuelSurfaceNormal);
     float fuelSlopeAngle=dot(fuelSlope.xz,vec2(.84,.54));
     float fuelRibbonWidth=max(.010,fwidth(fuelSlopeAngle)*1.25);
     float fuelRibbon=exp(-pow((fuelSlopeAngle+.035)/fuelRibbonWidth,2.))+.55*exp(-pow((fuelSlopeAngle-.045)/(fuelRibbonWidth*1.2),2.));
     float fuelSoftReflection=exp(-pow((fuelSlopeAngle+.055)/.11,2.));
     outgoingLight=outgoingLight*.92+vec3(.012,.008,.0015);
     outgoingLight+=vec3(.90,.91,.79)*(fuelWindow*.36+fuelStrip*1.10)*(.30+.70*fuelFresnel)+vec3(.50,.43,.25)*fuelCrestLight*.52;
     outgoingLight+=vec3(1.08,1.09,.96)*fuelRibbon*1.20+vec3(.20,.22,.17)*fuelSoftReflection;
     diffuseColor.a*=.80+.20*fuelFresnel+min(.42,fuelStrip*.32+fuelCrestLight*.16+fuelRibbon*.32);
     #include <opaque_fragment>`);
   }else if(kind==='body'){
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\ndiffuseColor.rgb*=mix(vec3(1.20,1.10,.84),vec3(.51,.34,.14),clamp(vFuelDepth,0.,1.));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
     float fuelEdge=pow(1.-abs(dot(normal,normalize(vViewPosition))),2.);
     outgoingLight=outgoingLight*.74+vec3(.040,.018,.002)*(.35+.40*(1.-vFuelDepth));
     diffuseColor.a*=.78+.22*fuelEdge;
     #include <opaque_fragment>`);
   }else shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','diffuseColor.a*=smoothstep(0.,.72,vFuelBand)*(.68+.22*fuelEnergy);\n#include <opaque_fragment>');
  };
  if(environment)material.envMap=environment;
  if(environmentRotation)material.envMapRotation.copy(environmentRotation);
  material.customProgramCacheKey=()=>`fuel-liquid-769-${kind}-5`;return own(material);
 }
 const surfaceMaterial=patch(new T.MeshPhysicalMaterial({color:0xd1b962,metalness:0,roughness:.045,ior:1.36,clearcoat:1,clearcoatRoughness:.035,specularIntensity:1,envMapIntensity:1.55,emissive:0x432000,emissiveIntensity:.025,transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide,forceSinglePass:true}),'surface');
 const bodyMaterial=patch(new T.MeshPhysicalMaterial({color:0xb28d39,metalness:0,roughness:.14,ior:1.36,clearcoat:.82,clearcoatRoughness:.07,envMapIntensity:.95,emissive:0x381500,emissiveIntensity:.025,transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide,forceSinglePass:true}),'body');
 const rimMaterial=patch(new T.MeshPhysicalMaterial({color:0xffe7a7,metalness:0,roughness:.09,clearcoat:1,clearcoatRoughness:.04,emissive:0xb78b36,emissiveIntensity:.15,transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide,forceSinglePass:true}),'meniscus');
 function add(data,material,name,order){const m=new T.Mesh(data.geometry,material);m.name=name;m.renderOrder=order;m.castShadow=false;m.receiveShadow=false;m.userData.illustrativeOverlay=true;m.userData.detailOpacity=1;root.add(m);items.push(m);}
 add(body,bodyMaterial,'fuel-amber-volume',2);add(top,surfaceMaterial,'fuel-amber-free-surface',3);add(rim,rimMaterial,'fuel-wall-meniscus',4);

 function spring(key,vel,target,dt,frequency,damp){slosh[vel]+=(frequency*frequency*(target-slosh[key])-2*damp*frequency*slosh[vel])*dt;slosh[key]+=slosh[vel]*dt;}
 function propagate(dt,rollRate,pitchRate){
  const fx=clamp(-rollRate*2.88-slosh.vx*.56,-.25,.25),fz=clamp(pitchRate*2.72+slosh.vz*.52,-.25,.25);
  const excitation=clamp((Math.abs(rollRate)+Math.abs(pitchRate)+(Math.abs(slosh.vx)+Math.abs(slosh.vz))*.25)/.006,0,1),settlingLoss=(1-excitation)*.85;
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
   const k=j*row+i,left=k+(i===0?0:-1),right=k+(i===nx?0:1),near=k+(j===0?0:-row),far=k+(j===nz?0:row);
   const fluxX=((wave[left]-wave[k])*(speed[left]+speed[k])+(wave[right]-wave[k])*(speed[right]+speed[k]))*.5*ix2;
   const fluxZ=((wave[near]-wave[k])*(speed[near]+speed[k])+(wave[far]-wave[k])*(speed[far]+speed[k]))*.5*iz2;
   velocity[k]+=(.38*(fluxX+fluxZ)+forceX[k]*fx+forceZ[k]*fz-(.50+(damping[k]-1.2)*.38+settlingLoss)*velocity[k])*dt;
  }
  let mean=0,meanVelocity=0;
  for(let k=0;k<count;k++){const next=wave[k]+velocity[k]*dt;if(Math.abs(next)>.0048)velocity[k]*=.35;wave[k]=clamp(next,-.0048,.0048);mean+=wave[k];meanVelocity+=velocity[k];}
  mean/=count;meanVelocity/=count;for(let k=0;k<count;k++){wave[k]-=mean;velocity[k]-=meanVelocity;}
 }
 function updateGeometry(data){
  const p=data.geometry.attributes.position.array,n=data.geometry.attributes.normal.array,c=data.geometry.attributes.fuelCrest.array;
  for(const s of data.vertices){
   const v=sample(s.x,s.z),k=s.i*3;p[k+1]=s.bottom?tank.bottom:v.y+s.lift;
   if(!s.normal){const inv=1/Math.hypot(v.dx,1,v.dz);n[k]=-v.dx*inv;n[k+1]=inv;n[k+2]=-v.dz*inv;}c[s.i]=s.bottom?0:v.crest;
   if(!s.bottom){minSurface=Math.min(minSurface,p[k+1]);maxSurface=Math.max(maxSurface,p[k+1]);}
  }
  data.geometry.attributes.position.needsUpdate=true;data.geometry.attributes.fuelCrest.needsUpdate=true;if(data!==body)data.geometry.attributes.normal.needsUpdate=true;
 }
 function update(motion={},options={}){
  if(disposed)return diagnostics();
  const time=number(motion.conditionTime,number(motion.time)),reset=lastTime!==null&&time<lastTime,dt=lastTime===null||reset?1/60:clamp(time-lastTime,0,.065);lastTime=time;
  if(reset){wave.fill(0);velocity.fill(0);for(const k of ['x','z','vx','vz'])slosh[k]=0;lastRoll=0;lastPitch=0;lastBrake=0;}
  const pose=clamp(number(motion.poseMotionWeight,1),0,1),roll=clamp(number(motion.roll),-.16,.16)*pose,pitch=clamp(number(motion.pitch),-.12,.12)*pose,brake=clamp(number(motion.brake),0,1)*pose;
  const rollRate=dt>0?clamp((roll-lastRoll)/Math.max(dt,1/120),-.8,.8):0,pitchRate=dt>0?clamp((pitch-lastPitch+(brake-lastBrake)*.045)/Math.max(dt,1/120),-.8,.8):0;
  lastRoll=roll;lastPitch=pitch;lastBrake=brake;
  const targetX=clamp(-roll*1.20,-.12,.12),targetZ=clamp(pitch*1.10+brake*.075,-.10,.10),steps=Math.max(1,Math.ceil(dt*480)),step=dt/steps;
  for(let s=0;s<steps;s++){spring('x','vx',targetX,step,5.2,.46);spring('z','vz',targetZ,step,4.7,.48);propagate(step,rollRate,pitchRate);}
  let rawPeak=0;peakWave=0;peakVelocity=0;
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
   const k=j*row+i,tilt=slosh.x*(tank.x0+i*dx-cx)+slosh.z*(tank.z0+j*dz-cz);
   rawPeak=Math.max(rawPeak,Math.abs(tilt+wave[k]));peakWave=Math.max(peakWave,Math.abs(wave[k]));peakVelocity=Math.max(peakVelocity,Math.abs(velocity[k]));
  }
  amplitudeScale=Math.min(1,maxExcursion/Math.max(.000001,rawPeak));
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
   const k=j*row+i,x=tank.x0+i*dx,z=tank.z0+j*dz;
   height[k]=level+(slosh.x*(x-cx)+slosh.z*(z-cz)+wave[k])*amplitudeScale;
   const left=k+(i===0?1:-1),right=k+(i===nx?-1:1),near=k+(j===0?row:-row),far=k+(j===nz?-row:row);
   const curvature=-((wave[left]+wave[right]-2*wave[k])*ix2+(wave[near]+wave[far]-2*wave[k])*iz2)*amplitudeScale;
   const wx=(wave[right]-wave[left])*invX*.5,wz=(wave[far]-wave[near])*invZ*.5;
   crest[k]=clamp(curvature*.22,0,1)*Math.exp(-(wx*wx+wz*wz)/.018);
  }
  energy=clamp((Math.abs(slosh.vx)+Math.abs(slosh.vz))*.6+peakWave*85+peakVelocity*3,0,1);uniforms.fuelTime.value=time;uniforms.fuelEnergy.value=energy;
  minSurface=Infinity;maxSurface=-Infinity;updateGeometry(top);updateGeometry(body);updateGeometry(rim);
  alpha=clamp(number(options.alpha,1),0,1);const defocusWeight=clamp(number(options.defocusWeight),0,1);
  bodyMaterial.opacity=.28*alpha;surfaceMaterial.opacity=.42*alpha;rimMaterial.opacity=.72*alpha;root.visible=alpha>.0001;
  for(const item of items){item.userData.defocusWeight=defocusWeight;item.userData.detailOpacity=1;}return diagnostics();
 }
 function diagnostics(){return {active:root.visible&&!disposed,appearanceRevision:769.4,liquidStyle:'continuous-amber-surface; submerged-baffle-damping; propagating-curved-crests',liquidRegions:1,baffleInfluenceCount:4,liquidLevelLocal:level,liquidBottomLocal:tank.bottom,liquidSurface:[minSurface,maxSurface],baffleTopLocal:baffleTop,ceilingLocal:level+maxExcursion+.00052,maximumExcursion:maxExcursion,liquidEnergy:energy,peakWaveAmplitude:peakWave*amplitudeScale,peakSurfaceSpeed:peakVelocity*amplitudeScale,waveCells:count,volumeScale:amplitudeScale,tilt:[slosh.x,slosh.z],fillWidth:width,fillLength:length,sourceHoles:holes.length,drawCalls:3,sourceGeometryModified:false,fixedBuffers:true,renderOrders:items.map(m=>m.renderOrder),displayOpacity:{body:bodyMaterial.opacity,surface:surfaceMaterial.opacity,meniscus:rimMaterial.opacity},alpha,disposed};}
 function dispose(){if(disposed)return;disposed=true;root.visible=false;for(const r of owned)r.dispose();owned.clear();root.clear();root.removeFromParent();}
 update({time:0,poseMotionWeight:0},{alpha:0});lastTime=null;return {root,items,update,diagnostics,dispose};
}
