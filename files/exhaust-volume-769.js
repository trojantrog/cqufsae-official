import * as T from './vendor/three.module.min.js';
import {createExhaustFlowTexture,EXHAUST_DOMAIN_GLSL} from './exhaust-flow-field-774.js?v=774';

// A small, locally generated 3D density texture is reused by the ray marcher.
// No video, frame sequence or downloaded texture is needed.
function densityTexture(){
 const size=64,field=new Uint8Array(size*size*size),fade=t=>t*t*(3-2*t);
 const hash=(x,y,z)=>{let h=((x&7)*374761393+(y&7)*668265263+(z&7)*2147483647)|0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
 const noise=(x,y,z)=>{const a=Math.floor(x),b=Math.floor(y),c=Math.floor(z),u=fade(x-a),v=fade(y-b),w=fade(z-c);let n=0;for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++)n+=hash(a+i,b+j,c+k)*(i?u:1-u)*(j?v:1-v)*(k?w:1-w);return n;};
 let i=0;for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++)field[i++]=Math.round(255*(noise(x/8,y/8,z/8)*.70+noise(x/4,y/4,z/4)*.22+noise(x/2,y/2,z/2)*.08));
 const texture=new T.Data3DTexture(field,size,size,size);texture.format=T.RedFormat;texture.type=T.UnsignedByteType;texture.minFilter=texture.magFilter=T.LinearFilter;texture.wrapS=texture.wrapT=texture.wrapR=T.RepeatWrapping;texture.unpackAlignment=1;texture.needsUpdate=true;return texture;
}

export function createExhaustVolume({camera=null}={}){
 const texture=densityTexture(),flowMap=createExhaustFlowTexture(),root=new T.Group();root.name='exhaust-volume-774';root.userData.illustrativeOverlay=true;
 const uniforms={densityMap:{value:texture},flowMap:{value:flowMap},eyeLocal:{value:new T.Vector3(0,.5,.5)},flowTime:{value:0},flowAlpha:{value:0},load:{value:.65}};
 const geometry=new T.BoxGeometry(.71,.18,.18);geometry.translate(.295,0,0);
 const material=new T.ShaderMaterial({uniforms,transparent:true,opacity:0,depthTest:true,depthWrite:false,side:T.FrontSide,forceSinglePass:true,toneMapped:false,
  vertexShader:`varying vec3 vGasPosition;
   void main(){vGasPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`precision highp sampler3D;
   uniform sampler3D densityMap,flowMap;uniform vec3 eyeLocal;uniform float flowTime,flowAlpha,load;uniform mat4 modelViewMatrix,projectionMatrix;varying vec3 vGasPosition;
   float gate(float x,float a,float b){return smoothstep(a,a+.005,x)*(1.-smoothstep(b-.005,b,x));}
   float noise3(vec3 p){return texture(densityMap,p).r;}
   vec2 bounds(vec3 ro,vec3 rd){vec3 inv=1./rd,a=(vec3(-.06,-.09,-.09)-ro)*inv,b=(vec3(.65,.09,.09)-ro)*inv,lo=min(a,b),hi=max(a,b);return vec2(max(lo.x,max(lo.y,lo.z)),min(hi.x,min(hi.y,hi.z)));}
   ${EXHAUST_DOMAIN_GLSL}
   vec4 gas(vec3 p){
    float domain=gasDomain(p);if(domain<=0.)return vec4(0.);
    vec4 route=routeField(p);if(route.a<.001)return vec4(0.);
    // The texture moves with travel along the connected paths, including the
    // negative-X return passage. This is material transport, not a sound wave.
    vec3 q=vec3((route.x-flowTime)*.14,p.y*7.,p.z*7.);
    float broad=noise3(q*1.9),fine=noise3(q*5.6+vec3(0.,.13,.37));
    float rolling=pow(smoothstep(.36,.65,broad*.76+fine*.24),1.5);
    float envelope=(1.-smoothstep(.30,1.,route.y))*route.a;
    float density=domain*envelope*(.20+1.22*rolling);
    float tail=clamp((p.x-.450)/.20,0.,1.);density*=pow(1.-tail,1.6);
    float heat=clamp(route.z-tail*.36+(rolling-.5)*.06,0.,1.);
    vec3 cool=vec3(.055,.20,.33),warm=vec3(1.,.32,.025),hot=vec3(.95,.042,.012);
    vec3 colour=heat<.52?mix(cool,warm,heat/.52):mix(warm,hot,(heat-.52)/.48);
    float light=noise3(q*1.9+vec3(0.,.022,.015))-broad;
    colour*=.83+rolling*.28+light*.70;colour=mix(colour,vec3(.61,.64,.65),tail*.67);
    return vec4(colour,density*(.78+.25*load));
   }
   void main(){
    vec3 rd=normalize(vGasPosition-eyeLocal);vec2 hit=bounds(eyeLocal,rd);if(hit.x>hit.y)discard;
    float stepSize=(hit.y-max(hit.x,0.))/64.;vec3 p=eyeLocal+rd*(max(hit.x,0.)+stepSize*.5),first=p;vec4 accum=vec4(0.);bool hasFirst=false;
    for(int i=0;i<64;i++){
     vec4 sampleGas=gas(p);float a=(1.-exp(-sampleGas.a*stepSize*23.))*flowAlpha;
     if(!hasFirst&&sampleGas.a>.025){first=p;hasFirst=true;}
     accum.rgb+=(1.-accum.a)*a*sampleGas.rgb;accum.a+=(1.-accum.a)*a;
     if(accum.a>.93)break;p+=rd*stepSize;
    }
    if(accum.a<.002)discard;
    // Test the front of the density against the real pipes and shell, rather
    // than testing the empty front face of the proxy box.
    vec4 gasDepth=projectionMatrix*modelViewMatrix*vec4(first,1.);gl_FragDepth=gasDepth.z/gasDepth.w*.5+.5;
    gl_FragColor=vec4(accum.rgb/max(accum.a,.0001),accum.a);
    #include <colorspace_fragment>
   }`
 });
 material.customProgramCacheKey=()=> 'exhaust-volume-774-1';
 // Draw before the faded vehicle context (orders 10..20). That context writes
 // its own depth, so drawing gas afterwards would cut holes through the cloud.
 const volume=new T.Mesh(geometry,material);volume.name='muffler-volumetric-gas';volume.frustumCulled=false;volume.renderOrder=5;volume.userData.illustrativeOverlay=true;volume.castShadow=volume.receiveShadow=false;root.add(volume);
 const inverse=new T.Matrix4();let disposed=false,time=0,lastTime=null,phase=0;
 function update(motion={},options={}){
  if(disposed)return diagnostics();time=Number(motion.conditionTime??motion.time)||0;
  const dt=lastTime===null||time<lastTime?1/60:Math.min(.1,Math.max(0,time-lastTime));lastTime=time;
  const speed=Math.max(0,Number(motion.speed)||0),power=Math.max(.22,Math.min(1,.40+speed*.035-(Number(motion.brake)||0)*.3));
  phase+=dt*(.65+.45*power);uniforms.flowTime.value=phase;uniforms.load.value=power;
  material.opacity=uniforms.flowAlpha.value=Math.max(0,Math.min(1,options.alpha??1));root.visible=material.opacity>.0001;
  volume.userData.defocusWeight=options.defocusWeight??0;
  root.updateWorldMatrix(true,false);if(camera){camera.getWorldPosition(uniforms.eyeLocal.value);uniforms.eyeLocal.value.applyMatrix4(inverse.copy(root.matrixWorld).invert());}
  return diagnostics();
 }
 function diagnostics(){return {active:root.visible&&!disposed,style:'continuous-volumetric-gas',pathRevision:774,path:'inlet / perforations / rear chamber / baffle apertures / front chamber / outlet',transport:'connected-route travel time',boundary:'original CAD walls and openings',quantitativeCFD:false,colour:'hot-red / amber / cool-grey',time,phase,opacity:uniforms.flowAlpha.value,steps:64,drawCalls:1,textureBytes:texture.image.data.byteLength+flowMap.image.data.byteLength,fixedBuffers:true,disposed};}
 function dispose(){if(disposed)return;disposed=true;geometry.dispose();material.dispose();texture.dispose();flowMap.dispose();root.clear();root.removeFromParent();}
 return {root,items:[volume],update,diagnostics,dispose};
}
