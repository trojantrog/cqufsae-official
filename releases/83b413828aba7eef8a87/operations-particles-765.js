import * as T from './vendor/three.module.min.js';

const clamp=x=>Math.max(0,Math.min(1,x));
const hash=x=>{const a=Math.sin(x*127.1+311.7)*43758.5453;return a-Math.floor(a);};
export const PARTICLE_LIMIT=129600;
export const ENTRY_SECONDS=3.4;

// Both the surface handoff and the particles use the same physical X position.
// +X is the nose of C41, so the release front advances from rear to front.
const releaseGLSL=`
 uniform sampler2D depthMap;
 uniform mat4 sourceProjectionInverse,sourceWorld,worldToVehicle;
 uniform vec2 longitudinalRange;
 uniform float progress;
 float ease5(float x){x=clamp(x,0.,1.);return x*x*x*(10.+x*(-15.+6.*x));}
 vec3 sourcePosition(vec2 uv){
  vec4 point=sourceProjectionInverse*vec4(uv*2.-1.,texture2D(depthMap,uv).r*2.-1.,1.);
  return (sourceWorld*vec4(point.xyz/point.w,1.)).xyz;
 }
 float longitudinal(vec3 world){
  float x=(worldToVehicle*vec4(world,1.)).x;
  return clamp((x-longitudinalRange.x)/(longitudinalRange.y-longitudinalRange.x),0.,1.);
 }
 float releaseAt(vec3 world,float along){
  vec3 local=(worldToVehicle*vec4(world,1.)).xyz;
  float irregular=sin(local.y*43.+local.z*29.)*sin(local.z*71.-local.y*37.);
  return .025+.29*along+.009*irregular;
 }
 float dissolveAt(vec3 world,float along){return smoothstep(0.,.055,progress-releaseAt(world,along));}
`;
const vertex=`
 attribute vec2 sampleUV;
 attribute vec3 destination,arrivalColour,variation;
 uniform sampler2D colourMap,eligibilityMap;
 uniform vec3 sourceRight,sourceUp,sourceForward;
 uniform float pointPixels,layerAlpha;
 varying vec3 vColour;varying float vAlpha;
 ${releaseGLSL}
 void main(){
  vec4 original=texture2D(colourMap,sampleUV),mask=texture2D(eligibilityMap,sampleUV);
  float depth=texture2D(depthMap,sampleUV).r;
  float sharp=1.-smoothstep(.12,.72,mask.r/max(mask.a,.0001));
  float eligible=smoothstep(.20,.65,mask.g/max(mask.a,.0001))*sharp*smoothstep(.12,.75,mask.a);
  vec3 start=sourcePosition(sampleUV),target=(modelMatrix*vec4(destination,1.)).xyz;
  float along=longitudinal(start),age=max(0.,progress-releaseAt(start,along));
  float gatherStart=.37+.11*along+variation.z*.02;
  float travel=ease5((progress-gatherStart)/(.94-gatherStart));
  float spread=ease5(age/.12)*(1.-ease5((progress-.43)/.50));
  float angle=variation.y*6.2831853,radius=.18+.42*sqrt(variation.z);
  vec3 drift=sourceRight*(cos(angle)*radius+(sampleUV.x-.5)*.32)
   +sourceUp*(sin(angle)*radius*.72+.025+(sampleUV.y-.5)*.18)
   +sourceForward*((variation.x-.5)*.22);
  vec3 point=mix(start,target,travel)+drift*spread;
  float dissolve=dissolveAt(start,along),settle=smoothstep(.84,.99,progress);
  vAlpha=eligible*dissolve*(1.-settle)*layerAlpha;
  vColour=mix(original.rgb/max(original.a,.0001),arrivalColour,ease5((travel-.34)/.62));
  gl_Position=projectionMatrix*viewMatrix*vec4(point,1.);
  vec2 ndc=gl_Position.xy/gl_Position.w;
  // Keep the trajectories free. Compressing their positions against viewport
  // limits builds a dense rectangular wall; fade individual outliers instead.
  float edgeX=1.-smoothstep(.72+variation.y*.09,.99,abs(ndc.x));
  float edgeY=1.-smoothstep(.68+variation.z*.10,.985,abs(ndc.y));
  vAlpha*=mix(1.,edgeX*edgeY,spread);
  float grain=.55+1.12*pow(variation.x,2.2);
  gl_PointSize=max(.80,pointPixels*grain)*mix(1.,.83,travel);
  if(depth>=.999999||eligible<.002){vAlpha=0.;gl_Position=vec4(2.,2.,2.,1.);}
 }`;
const fragment=`
 varying vec3 vColour;varying float vAlpha;
 void main(){
  float radius=length(gl_PointCoord-.5)*2.;
  float alpha=vAlpha*(1.-smoothstep(.78,.96,radius));
  if(alpha<.012)discard;
  gl_FragColor=vec4(vColour,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`;

export function createOperationsParticles(targetFaces,sourceBounds){
 const root=new T.Group();root.name='operations-visible-surface-particles';
 const columns=480,rows=270,count=PARTICLE_LIMIT;
 const uv=new Float32Array(count*2),target=new Float32Array(count*3),colours=new Float32Array(count*3),variations=new Float32Array(count*3);
 const faces=[];let area=0;
 for(const [family,triangles]of Object.entries(targetFaces))for(const face of triangles){
  const size=face.b.clone().sub(face.a).cross(face.c.clone().sub(face.a)).length()/2;
  if(size>1e-12){area+=size;faces.push({...face,family,end:area});}
 }
 const black=new T.Color('#122235'),red=new T.Color('#E60012');
 for(let i=0;i<count;i++){
  const s=hash(i+1),j=hash(i+73),at=hash(i+997)*area;
  let lo=0,hi=faces.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(faces[mid].end<at)lo=mid+1;else hi=mid;}
  const face=faces[lo],u=Math.sqrt(hash(i+417)),v=hash(i+891);
  face.a.clone().multiplyScalar(1-u).addScaledVector(face.b,u*(1-v)).addScaledVector(face.c,u*v).toArray(target,i*3);
  (face.family==='red'?red:black).toArray(colours,i*3);
  uv[i*2]=(i%columns+.18+s*.64)/columns;uv[i*2+1]=(Math.floor(i/columns)+.18+j*.64)/rows;
  variations[i*3]=hash(i+2347);variations[i*3+1]=hash(i+12491);variations[i*3+2]=hash(i+6143);
 }
 const uniforms={colourMap:{value:null},depthMap:{value:null},eligibilityMap:{value:null},sourceProjectionInverse:{value:new T.Matrix4()},sourceWorld:{value:new T.Matrix4()},worldToVehicle:{value:new T.Matrix4()},longitudinalRange:{value:new T.Vector2(sourceBounds.min.x,sourceBounds.max.x)},sourceRight:{value:new T.Vector3()},sourceUp:{value:new T.Vector3()},sourceForward:{value:new T.Vector3()},progress:{value:0},pointPixels:{value:1.4},layerAlpha:{value:1}};
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(target.slice(),3));geometry.setAttribute('destination',new T.BufferAttribute(target,3));geometry.setAttribute('arrivalColour',new T.BufferAttribute(colours,3));geometry.setAttribute('sampleUV',new T.BufferAttribute(uv,2));geometry.setAttribute('variation',new T.BufferAttribute(variations,3));
 const material=new T.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,depthTest:false,toneMapped:true,blending:T.NormalBlending});
 const points=new T.Points(geometry,material);points.frustumCulled=false;points.renderOrder=10;points.name='operations-surface-particles';root.add(points);
 const backdropMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,toneMapped:true,uniforms:{image:{value:null},...Object.fromEntries(['eligibilityMap','depthMap','sourceProjectionInverse','sourceWorld','worldToVehicle','longitudinalRange','progress','layerAlpha'].map(k=>[k,uniforms[k]]))},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`varying vec2 vUv;uniform sampler2D image,eligibilityMap;uniform float layerAlpha;
   ${releaseGLSL}
   void main(){vec4 colour=texture2D(image,vUv),m=texture2D(eligibilityMap,vUv);
    vec3 world=sourcePosition(vUv);float along=longitudinal(world);
    float sharp=1.-smoothstep(.12,.72,m.r/max(m.a,.0001));
    float surface=1.-dissolveAt(world,along),background=1.-smoothstep(.025,.31,progress);
    float fade=mix(background,surface,sharp*step(.2,m.g/max(m.a,.0001)))*layerAlpha;
    gl_FragColor=vec4(colour.rgb/max(colour.a,.0001),colour.a*fade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`});
 const backdrop=new T.Mesh(new T.PlaneGeometry(2,2),backdropMaterial);backdrop.name='operations-surface-handoff';backdrop.frustumCulled=false;backdrop.renderOrder=-10;root.add(backdrop);
 let captured=null;
 return {root,points,uniforms,count,
  setSourceTransform(matrix){uniforms.worldToVehicle.value.copy(matrix).invert();},
  bind(frame){captured?.dispose();captured=frame;uniforms.colourMap.value=frame.colour;uniforms.depthMap.value=frame.depth;uniforms.eligibilityMap.value=frame.mask;backdropMaterial.uniforms.image.value=frame.image;uniforms.sourceProjectionInverse.value.copy(frame.camera.projectionMatrixInverse);uniforms.sourceWorld.value.copy(frame.camera.matrixWorld);uniforms.sourceRight.value.setFromMatrixColumn(frame.camera.matrixWorld,0);uniforms.sourceUp.value.setFromMatrixColumn(frame.camera.matrixWorld,1);uniforms.sourceForward.value.setFromMatrixColumn(frame.camera.matrixWorld,2).negate();uniforms.pointPixels.value=Math.min(2.6,Math.max(1.1,frame.width/columns*.48));},
  update(progress,alpha=1){uniforms.progress.value=clamp(progress);uniforms.layerAlpha.value=alpha;root.visible=!!captured&&alpha>.0001;points.visible=progress>.0001&&progress<.999;backdrop.visible=progress<.39;},
  release(){captured?.dispose();captured=null;root.visible=false;},
  diagnostics(){return {particleBudget:count,captured:!!captured,source:'visible-colour-depth-mask',cpuReadback:false,releaseDirection:'rear-to-front',releaseSweepSeconds:.29*ENTRY_SECONDS,particleBasePixels:uniforms.pointPixels.value,sourceLongitudinalRange:uniforms.longitudinalRange.value.toArray(),grainProfile:'fine-varied-hard-edge',scatterRadius:[.18,.60],edgeTreatment:'free-trajectories-soft-density-falloff'};},
  dispose(){captured?.dispose();geometry.dispose();material.dispose();backdrop.geometry.dispose();backdropMaterial.dispose();root.clear();}
 };
}
