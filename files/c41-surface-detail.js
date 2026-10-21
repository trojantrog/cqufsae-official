// Object-space finish detail avoids adding UV seams to mechanical CAD surfaces.
// Fine patterns fade before becoming subpixel; no additional render pass.
export function configureC41Surface(material,kind){
 material.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 vC41P; varying vec3 vC41N;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvC41P=position;vC41N=normal;');
  shader.fragmentShader='varying vec3 vC41P; varying vec3 vC41N;\n'+shader.fragmentShader;
  const projection=`vec3 c41N=abs(normalize(vC41N));vec2 c41UV=c41N.z>c41N.x&&c41N.z>c41N.y?vC41P.xy:(c41N.x>c41N.y?vC41P.yz:vC41P.xz);`;
  const surface=kind==='filter'?`
   vec2 c41Net=mat2(.7071068,-.7071068,.7071068,.7071068)*vec2(atan(vC41P.z,vC41P.x)*.038,vC41P.y)/.00125;
   vec2 c41Width=max(fwidth(c41Net),vec2(.001));
   vec2 c41Distance=abs(fract(c41Net+.5)-.5);
   vec2 c41Wire=1.-smoothstep(vec2(.13)-c41Width,vec2(.13)+c41Width,c41Distance);
   float c41AA=1.-smoothstep(.24,.85,max(c41Width.x,c41Width.y));
   float c41Grid=mix(.45,max(c41Wire.x,c41Wire.y),c41AA);
   float c41Band=smoothstep(-.062,-.059,vC41P.y)*(1.-smoothstep(-.002,.001,vC41P.y));
   float c41Side=1.-smoothstep(.72,.95,abs(normalize(vC41N).y));
   float c41Mesh=c41Band*c41Side;
   vec3 c41Red=diffuseColor.rgb*(.56+.67*c41Grid);
   diffuseColor.rgb=mix(vec3(.009,.011,.012),c41Red,c41Mesh);
   float c41RoughDelta=mix(.15,.05-.10*c41Grid,c41Mesh);
   float c41Height=0.;`
  :kind==='cast'?`
   vec3 c41GrainP=vC41P/.00075;
   float c41AA=1.-smoothstep(.35,1.4,max(max(fwidth(c41GrainP.x),fwidth(c41GrainP.y)),fwidth(c41GrainP.z)));
   float c41Grain=sin(dot(c41GrainP,vec3(1.7,2.3,.9)))*sin(dot(c41GrainP,vec3(.8,-1.1,1.9)))*c41AA;
   float c41RoughDelta=.045*c41Grain;
   float c41Height=.000004*c41Grain;`
  :projection+`
   float c41Brush=(c41UV.x+c41UV.y*.035)/.00024;
   float c41AA=1.-smoothstep(.18,.60,fwidth(c41Brush));
   float c41Grain=(.65*sin(c41Brush*6.2831853)+.35*sin(c41Brush*13.119))*c41AA;
   float c41RoughDelta=.020*c41Grain;
   float c41Height=0.;`;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+surface);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+c41RoughDelta,.04,1.);');
  if(kind==='filter')shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=c41Mesh;');
  if(kind==='cast')shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   vec3 c41DX=dFdx(-vViewPosition),c41DY=dFdy(-vViewPosition);
   vec3 c41R1=cross(c41DY,normal),c41R2=cross(normal,c41DX);
   float c41Det=dot(c41DX,c41R1);
   vec3 c41Gradient=(c41R1*dFdx(c41Height)+c41R2*dFdy(c41Height))*sign(c41Det)/max(abs(c41Det),1.e-12);
   normal=normalize(normal-c41Gradient);`);
 };
 material.customProgramCacheKey=()=>`c41-surface-750-6-${kind}`;
 material.userData.c41Surface=kind;
 material.needsUpdate=true;
}
