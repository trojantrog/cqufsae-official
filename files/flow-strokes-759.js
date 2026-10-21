import * as T from './vendor/three.module.min.js';

// Screen-width ribbons retain the sampled 3D centreline and its depth. A shared
// quad is instanced per source segment; camera changes require no CPU rebuild.
export function createFlowStrokes(source,{name,width=1.65,baseline=.035,gain=.94,uniforms,pathDuration=false}={}){
 const geometry=new T.InstancedBufferGeometry(),count=source.attributes.position.count/2;
 geometry.setAttribute('position',new T.Float32BufferAttribute([0,-1,0,0,1,0,1,-1,0,1,1,0],3));
 geometry.setIndex([0,2,1,1,2,3]);geometry.instanceCount=count;
 function pair(sourceName,targetNames,size){
  const buffer=new T.InstancedInterleavedBuffer(source.attributes[sourceName].array,size*2);
  targetNames.forEach((target,i)=>geometry.setAttribute(target,new T.InterleavedBufferAttribute(buffer,size,i*size)));return buffer;
 }
 pair('position',['segmentStart','segmentEnd'],3);pair('flowColour',['colourStart','colourEnd'],3);
 for(const [from,to]of [['travel','segmentTravel'],['emphasis','segmentWeight']])geometry.setAttribute(to,new T.InstancedBufferAttribute(source.attributes[from].array,2));
 pair('seed',['segmentSeed'],1);const periodBuffer=pair('pathPeriod',['segmentPeriod'],1);
 if(pathDuration)pair('duration',['segmentDuration'],1);
 geometry.boundingBox=source.boundingBox?.clone()||null;geometry.boundingSphere=source.boundingSphere?.clone()||null;
 const viewport=new T.Vector4(),shared={...uniforms,strokeViewport:{value:new T.Vector2(1,1)},strokeWidth:{value:width},strokePixelRatio:{value:1}};
 const vertexShader=`
 attribute vec3 segmentStart,segmentEnd,colourStart,colourEnd;
 attribute vec2 segmentTravel,segmentWeight;
 attribute float segmentSeed,segmentPeriod;
 ${pathDuration?'attribute float segmentDuration;':'uniform float packetDuration;'}
 uniform vec2 strokeViewport;uniform float strokeWidth,strokePixelRatio;
 varying vec3 c;varying float d,s,p,w,e,side;
 void main(){
  vec4 viewA=modelViewMatrix*vec4(segmentStart,1.),viewB=modelViewMatrix*vec4(segmentEnd,1.);
  float first=0.,last=1.;
  if(viewA.z>-.025&&viewB.z<=-.025)first=(-.025-viewA.z)/(viewB.z-viewA.z);
  if(viewB.z>-.025&&viewA.z<=-.025)last=(-.025-viewA.z)/(viewB.z-viewA.z);
  float along=mix(first,last,position.x);vec4 a=projectionMatrix*mix(viewA,viewB,first),b=projectionMatrix*mix(viewA,viewB,last);
  vec2 direction=(b.xy/max(b.w,.0001)-a.xy/max(a.w,.0001))*strokeViewport;
  direction/=max(length(direction),.00001);vec2 normal=vec2(-direction.y,direction.x);
  gl_Position=mix(a,b,position.x);gl_Position.xy+=normal*position.y*strokeWidth*strokePixelRatio/strokeViewport*gl_Position.w;
  if(viewA.z>-.025&&viewB.z>-.025)gl_Position=vec4(2.,2.,2.,1.);
  c=mix(colourStart,colourEnd,along);d=mix(segmentTravel.x,segmentTravel.y,along);
  e=mix(segmentWeight.x,segmentWeight.y,along);s=segmentSeed;p=segmentPeriod;w=${pathDuration?'segmentDuration':'packetDuration'};side=position.y;
 }`;
 const fragmentShader=`
 uniform float phase,strength;varying vec3 c;varying float d,s,p,w,e,side;
 void main(){
  float age=mod(phase+s-d,p),packet=0.;
  if(age<w)packet=smoothstep(0.,w*.09,age)*(1.-smoothstep(w*.46,w,age));
  float edge=1.-smoothstep(.48,1.,abs(side));
  float alpha=min(.98,strength*e*(${baseline.toFixed(5)}+${gain.toFixed(5)}*packet))*edge;
  if(alpha<.004)discard;
  float head=exp(-pow((age-w*.16)/max(w*.085,.0001),2.));
  vec3 ink=mix(c,c*.90+vec3(.10),head*.18);
  #ifdef FLOW_MASK
   ink=vec3(0.);
  #endif
  gl_FragColor=vec4(ink,alpha);
  #include <colorspace_fragment>
 }`;
 const settings={transparent:true,depthTest:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,toneMapped:false,uniforms:shared,vertexShader,fragmentShader};
 const material=new T.ShaderMaterial(settings),mask=new T.ShaderMaterial({...settings,defines:{FLOW_MASK:1}});
 const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.renderOrder=20;mesh.frustumCulled=false;
 mesh.userData={defocusWeight:0,partCounted:false,nativeFocusMask:mask,flowStroke:{widthPixels:width,baselineAlpha:baseline,instances:count}};
 let periodVersion=-1;
 mesh.onBeforeRender=renderer=>{
  renderer.getCurrentViewport(viewport);shared.strokeViewport.value.set(Math.max(1,viewport.z),Math.max(1,viewport.w));shared.strokePixelRatio.value=renderer.getPixelRatio();
  if(periodVersion!==source.attributes.pathPeriod.version){periodVersion=source.attributes.pathPeriod.version;periodBuffer.needsUpdate=true;}
 };
 return {mesh,geometry,material,mask,dispose(){geometry.dispose();material.dispose();mask.dispose();}};
}
