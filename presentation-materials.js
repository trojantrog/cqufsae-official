import * as T from './vendor/three.module.min.js';
export const presentationMaterials={
 'satin-carbon':{color:0x282b2d,metalness:.04,roughness:.43,clearcoat:.30,clearcoatRoughness:.30,texture:'carbon'},
 'frame-graphite':{color:0x414446,metalness:.55,roughness:.39,clearcoat:.08,clearcoatRoughness:.42},
 'satin-titanium':{color:0x898b89,metalness:.92,roughness:.36,texture:'brushed'},
 'bright-alloy':{color:0xb5b7b7,metalness:.96,roughness:.30,texture:'brushed'},
 'warm-alloy':{color:0xa9a69d,metalness:.94,roughness:.36,texture:'brushed'},
 'dark-titanium':{color:0x545958,metalness:.88,roughness:.40,clearcoat:.03,clearcoatRoughness:.40},
 'brushed-steel':{color:0x9b9c9b,metalness:.97,roughness:.40,texture:'brushed'},
 'polished-steel':{color:0xc3c5c5,metalness:.99,roughness:.16},
 'champagne':{color:0xac9c7c,metalness:.94,roughness:.33,clearcoat:.04,clearcoatRoughness:.40},
 'copper-satin':{color:0xa97756,metalness:.96,roughness:.40,texture:'brushed'},
 'cast-ceramic':{color:0x60615e,metalness:.72,roughness:.60,texture:'cast'},
 'engine-cover':{color:0x343735,metalness:.64,roughness:.43,clearcoat:.06,clearcoatRoughness:.44},
 'tyre-rubber':{color:0x202120,metalness:.01,roughness:.93,texture:'rubber'},
 'soft-black':{color:0x282a28,metalness:.02,roughness:.80},
 'warm-exhaust':{color:0x989083,metalness:.94,roughness:.40,texture:'brushed'},
 'ice-window':{color:0xb8c0c0,metalness:.02,roughness:.18,clearcoat:.50,clearcoatRoughness:.16}
};
export function presentationMaterialFor(d){
 if(d.presentationMaterial)return d.presentationMaterial;
 const l=d.label||'',r=d.mechanism||'',g=d.group||'';
 if(g==='frame')return 'frame-graphite';if(l==='轮胎')return 'tyre-rubber';
 if(l==='头枕泡沫'||d.material==='rubber'&&!l.includes('减振'))return 'soft-black';
 if(l==='轮辋')return 'warm-alloy';if(l.includes('弹簧'))return 'champagne';
 if(l==='轴承'||l.includes('定位轴承'))return 'polished-steel';
 if(l==='紧固件'||l.includes('销')||l.includes('垫片'))return 'bright-alloy';
 if(l.includes('制动盘'))return 'brushed-steel';if(l==='制动卡钳')return 'copper-satin';
 if(l.includes('球笼'))return 'dark-titanium';if(l.includes('半轴'))return 'satin-titanium';
 if(g==='body')return l==='头枕支撑板'?'dark-titanium':'satin-carbon';
 if(r==='mo-power_unit')return ['casting-008','casting-009','casting-017'].includes(d.id)?'cast-ceramic':'engine-cover';
 if(r==='mo-exhaust')return l.includes('法兰')?'champagne':'warm-exhaust';
 if(r==='mo-intake')return l.includes('支架')?'satin-titanium':'satin-carbon';
 if(r==='mo-cooling')return l.includes('支架')?'satin-titanium':'bright-alloy';
 if(l.includes('转向机外壳')||l.includes('立柱')&&!l.includes('垫片'))return 'dark-titanium';
 if(l.includes('主缸'))return 'warm-alloy';
 if(l.includes('减振器'))return l.includes('密封')?'dark-titanium':'bright-alloy';
 if(l.includes('粘接套')||l.includes('轴套')||l.includes('隔套'))return 'champagne';
 if(l.includes('支撑板')||l.includes('摇臂')||l.includes('踏板'))return 'satin-titanium';
 if(g==='suspension')return l.includes('安装座')?'dark-titanium':'satin-titanium';
 if(r==='mo-final_drive')return 'brushed-steel';if(g==='steering')return l==='方向盘'?'satin-carbon':'bright-alloy';
 if(g==='battery')return 'engine-cover';if(g==='wiring')return 'copper-satin';if(g==='ecu')return 'bright-alloy';
 return d.material==='carbon'?'satin-carbon':d.material==='gold'?'champagne':d.material==='cast'?'cast-ceramic':'satin-titanium';
}
const aliases={carbon:'satin-carbon',gunmetal:'frame-graphite',metal:'bright-alloy',cast:'cast-ceramic',magnesium:'engine-cover',rubber:'tyre-rubber',copper:'copper-satin',gold:'champagne'};
export function vehicleMaterial(part){
 const tag=typeof part==='object'?presentationMaterialFor(part):(aliases[part]||part),preset=presentationMaterials[tag]||presentationMaterials['bright-alloy'];
 const {texture,...props}=preset,m=new T.MeshPhysicalMaterial({...props,side:T.DoubleSide,envMapIntensity:.95,forceSinglePass:true,clipShadows:true});m.userData.presentation=tag;
 if(texture){m.onBeforeCompile=s=>{
  s.vertexShader='varying vec3 vPartP; varying vec3 vPartN;\n'+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPartP=position;vPartN=normal;');
  s.fragmentShader='varying vec3 vPartP; varying vec3 vPartN;\n'+s.fragmentShader;
  // Source geometry is in metres; surface detail fades before it becomes subpixel.
  const projection=`vec3 partN=abs(normalize(vPartN));vec2 partUV=partN.z>partN.x&&partN.z>partN.y?vPartP.xy:(partN.x>partN.y?vPartP.yz:vPartP.xz);`;
  const detail=texture==='carbon'?projection+`
   vec2 towUV=mat2(.7071068,-.7071068,.7071068,.7071068)*partUV/.0028;
   float towAA=1.-smoothstep(.20,.65,max(fwidth(towUV.x),fwidth(towUV.y)));
   float weave=sin(towUV.x*3.14159265)*sin(towUV.y*3.14159265)*towAA;
   float strandCoord=(towUV.x+towUV.y*.035)*18.;
   float strandAA=1.-smoothstep(.20,.65,fwidth(strandCoord));
   float strand=sin(strandCoord*6.2831853)*strandAA;
   diffuseColor.rgb*=1.+.035*weave+.008*strand;
   float presentationRoughnessDelta=.035*weave+.008*strand;`
  :texture==='brushed'?projection+`
   float brushCoord=(partUV.x+partUV.y*.035)/.00022;
   float brushAA=1.-smoothstep(.18,.60,fwidth(brushCoord));
   float grain=(.65*sin(brushCoord*6.2831853)+.35*sin(brushCoord*13.119))*brushAA;
   diffuseColor.rgb*=1.+.013*grain;
   float presentationRoughnessDelta=.028*grain;`
  :`
   vec3 grainP=vPartP/${texture==='rubber'?'.00035':'.00070'};
   float grainAA=1.-smoothstep(.45,1.6,max(max(fwidth(grainP.x),fwidth(grainP.y)),fwidth(grainP.z)));
   float grain=sin(dot(grainP,vec3(1.7,2.3,.9)))*sin(dot(grainP,vec3(.8,-1.1,1.9)))*grainAA;
   diffuseColor.rgb*=1.+${texture==='rubber'?'.012':'.025'}*grain;
   float presentationRoughnessDelta=${texture==='rubber'?'.018':'.055'}*grain;`;
  s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+detail);
  s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+presentationRoughnessDelta,.04,1.);');
 };m.customProgramCacheKey=()=>`presentation-719c-pbr-${tag}`;}
 return m;
}
