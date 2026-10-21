import * as T from './vendor/three.module.min.js';
import {c41PartMaterials} from './c41-part-materials.js?v=761';
import {configureC41Surface} from './c41-surface-detail.js?v=751.2';
import {configureC41IntakeMaterial} from './c41-intake-detail.js?v=751.2';
import {configureC41SwitchMaterial} from './c41-switch-finish.js?v=751.2';

// The supplied C41 studio views guide the finish. Geometry and CAD colours are
// kept separate from this presentation palette; no highlights are baked in.
const finishes={
 'satin-carbon':{color:0x282d30,metalness:.08,roughness:.34,clearcoat:.32,clearcoatRoughness:.20,envMapIntensity:.42,specularIntensity:.55},
 'frame-graphite':{color:0x353d43,metalness:.04,roughness:.32,clearcoat:.25,clearcoatRoughness:.21,envMapIntensity:.56},
 'satin-titanium':{color:0x929796,metalness:.90,roughness:.30,envMapIntensity:.56},
 'bright-alloy':{color:0xb7bbbd,metalness:.94,roughness:.26,envMapIntensity:.60},
 'warm-alloy':{color:0x95938c,metalness:.90,roughness:.32,envMapIntensity:.50},
 'dark-titanium':{color:0x44494a,metalness:.80,roughness:.33,envMapIntensity:.48},
 'brushed-steel':{color:0x959a9c,metalness:.95,roughness:.34,envMapIntensity:.54},
 'polished-steel':{color:0xbcc0c2,metalness:.98,roughness:.20,envMapIntensity:.62},
 'champagne':{color:0xae955e,metalness:.82,roughness:.30,envMapIntensity:.53},
 'copper-satin':{color:0x887b55,metalness:.82,roughness:.33,envMapIntensity:.50},
 'cast-ceramic':{color:0x8c9599,metalness:.76,roughness:.44,envMapIntensity:.60},
 'engine-cover':{color:0x626d73,metalness:.68,roughness:.35,clearcoat:.12,clearcoatRoughness:.30,envMapIntensity:.56},
 'tyre-rubber':{color:0x252627,metalness:0,roughness:.82,specularIntensity:.34,envMapIntensity:.26},
 'soft-black':{color:0x282c30,metalness:0,roughness:.80,specularIntensity:.35,envMapIntensity:.32},
 'warm-exhaust':{color:0x978e79,metalness:.90,roughness:.34,envMapIntensity:.53}
};
const metalFinishes={
 aluminum:{color:0xe0e4e5,metalness:.98,roughness:.34,envMapIntensity:.60},
 cast_aluminum:{color:0xcbd1d3,metalness:.96,roughness:.47,envMapIntensity:.58},
 steel:{color:0xb5bfc4,metalness:.99,roughness:.28,envMapIntensity:.61},
 stainless_steel:{color:0xb9c3ca,metalness:.98,roughness:.22,envMapIntensity:.62},
 black_steel:{color:0x353d43,metalness:.04,roughness:.32,clearcoat:.25,clearcoatRoughness:.21,envMapIntensity:.56},
 magnesium:{color:0x9da7aa,metalness:.85,roughness:.36,envMapIntensity:.58},
 titanium:{color:0x929b9e,metalness:.91,roughness:.33,envMapIntensity:.61},
 copper:{color:0xb77e55,metalness:.93,roughness:.32,envMapIntensity:.58}
};
const damperBlack={color:0x292d32,metalness:.42,roughness:.27,clearcoat:.22,clearcoatRoughness:.20,envMapIntensity:.64};
const damperCoil={...damperBlack,color:0x24282c,metalness:.52,roughness:.24};
const damperGold={color:0xc6a05d,metalness:.87,roughness:.28,clearcoat:.12,clearcoatRoughness:.22,envMapIntensity:.61};
const componentFinishes={
 'damper-silver':metalFinishes.aluminum,'damper-gold':damperGold,
 'damper-rod':metalFinishes.stainless_steel,'damper-spring':damperCoil,
 'red-filter':{color:0xb71927,metalness:.18,roughness:.53,clearcoat:.06,envMapIntensity:.48},
 'oil-hose':{color:0x353b3e,metalness:.03,roughness:.67,clearcoat:0,specularIntensity:.40,envMapIntensity:.38},
 'battery-housing':{color:0x38363a,metalness:.02,roughness:.62,clearcoat:0,specularIntensity:.35,envMapIntensity:.34}
};
function sourceFinish(record){
 if(!record)return null;
 const source=record.sourceMaterial||'',kind=record.materialClass;
 if(source==='black_steel')return metalFinishes.black_steel;
 if(source==='cast_aluminum'||source==='engine_cast_aluminum')return metalFinishes.cast_aluminum;
 if(source==='stainless_steel')return metalFinishes.stainless_steel;
 return metalFinishes[kind]||({carbon:finishes['satin-carbon'],carbon_composite:finishes['satin-carbon'],rubber:finishes['tyre-rubber'],plastic:finishes['soft-black']})[kind]||null;
}

export function applyC41ReferenceFinish(material,data,environment,{preserveColor=false}={}){
 if(!material.isMeshStandardMaterial||material.userData.c41Livery||material.userData.c41Finish)return;
 const label=data.label||'',tag=data.presentationMaterial||material.userData.presentation;
 const source=c41PartMaterials[data.id]||c41PartMaterials[data.sourceParent];
 let finish=sourceFinish(source)||finishes[tag];
 if(label==='减振器弹簧')finish=damperCoil;
 else if(/减振器.*(筒体|壳)/.test(label))finish=metalFinishes.aluminum;
 if(source?.componentFinish)finish=componentFinishes[source.componentFinish]||finish;
 if(componentFinishes[data.finishRole])finish=componentFinishes[data.finishRole];
 if(data.id==='c41-engine-update-022'||data.id==='engine-012')finish=metalFinishes.aluminum;
 const redFilter=data.id==='c41-engine-update-024'||data.id==='engine-015';
 if(redFilter)finish=componentFinishes['red-filter'];
 const oilHose=data.id==='c41-engine-update-135';
 if(oilHose)finish=componentFinishes['oil-hose'];
 const lowVoltageBattery=data.id==='c41-engine-update-168';
 if(lowVoltageBattery)finish=componentFinishes['battery-housing'];
 if(!finish)return;
 const {color,...physical}=finish;
 // Coloured switches, native CAD accents and the red harness retain their hue.
 const cad=data.cadColor?new T.Color(data.cadColor):null;
 const nativeAccent=cad&&Math.max(cad.r,cad.g,cad.b)-Math.min(cad.r,cad.g,cad.b)>.06;
 const explicitComponent=redFilter||oilHose||lowVoltageBattery||data.id==='c41-engine-update-022'||data.id==='engine-012'||source?.componentFinish||data.finishRole;
 if(!preserveColor&&(!nativeAccent||explicitComponent)&&color!==undefined)material.color.setHex(color);
 Object.assign(material,physical,{envMap:environment});
 material.envMapIntensity*=2.1;
 const cast=finish===metalFinishes.cast_aluminum||tag==='cast-ceramic';
 const bareMetal=Object.entries(metalFinishes).some(([name,value])=>name!=='black_steel'&&value===finish);
 if(data.nativeEngine&&data.role==='emergency-stop-fixed')configureC41SwitchMaterial(material);
 else if(data.nativeEngine&&data.role==='inertial-switch-fixed')configureC41SwitchMaterial(material,{inertial:true});
 else if(redFilter)configureC41IntakeMaterial(material,'filter');
 else if(data.id==='c41-engine-update-022')configureC41IntakeMaterial(material,'throttle');
 else if(cast)configureC41Surface(material,'cast');
 else if(bareMetal||finish===damperGold)configureC41Surface(material,'brushed');
 material.userData.c41Finish={version:751,preset:tag,sourceMaterial:source?.sourceMaterial||null,materialClass:source?.materialClass||null,componentFinish:oilHose?'oil-hose':lowVoltageBattery?'battery-housing':source?.componentFinish||data.finishRole||null};
 material.needsUpdate=true;
}

export function createC41ReferenceEnvironment(renderer){
 const studio=new T.Scene();studio.background=new T.Color().setRGB(.065,.070,.078);
 const resources=[],size=128,rgba=new Uint8Array(size*size*4);
 const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4,u=x/(size-1),v=y/(size-1);
  rgba[i]=rgba[i+1]=rgba[i+2]=255;
  rgba[i+3]=Math.round(255*smooth(Math.min(u,1-u)/.14)*smooth(Math.min(v,1-v)/.18));
 }
 const softbox=new T.DataTexture(rgba,size,size);softbox.needsUpdate=true;softbox.magFilter=softbox.minFilter=T.LinearFilter;resources.push(softbox);
 function panel(width,height,x,y,z,intensity,soft=true){
  const geometry=new T.PlaneGeometry(width,height);
  const material=new T.MeshBasicMaterial({color:new T.Color().setRGB(intensity,intensity,intensity),side:T.DoubleSide,map:soft?softbox:null,transparent:soft,depthWrite:!soft,toneMapped:false});
  const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.lookAt(0,0,.25);
  studio.add(mesh);resources.push(geometry,material);
 }
 // Long studio softboxes describe the curvature without the room's bright
 // wall reflecting as a silver stripe across the black floor and nose.
 panel(7,1.0,0,0,5,4.0);
 panel(5,.9,-2.5,-3,2.7,3.6);
 panel(4.5,1.6,3.2,3.8,1.8,2.5);
 panel(7,1.0,-.8,5.2,1.2,1.5);
 panel(4.5,1.4,1.4,-4.8,.7,1.2);
 panel(50,50,0,0,-4,.09,false);
 const pmrem=new T.PMREMGenerator(renderer),target=pmrem.fromScene(studio,.04);
 pmrem.dispose();for(const resource of resources)resource.dispose();
 return {texture:target.texture,dispose(){target.dispose();}};
}

export function finishC41Supplement(root,environment){
 root?.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.nativeEngine||mesh.userData.variant==='e74'||mesh.userData.variant==='a08')return;
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   if(!material||material.map||material.userData.blenderNativeMaterial||!material.userData.presentation)continue;
   const data={...mesh.userData};
   if(/damper.*helical-spring/.test(mesh.name))data.finishRole='damper-spring';
   else if(/damper.*piston-rod/.test(mesh.name))data.finishRole='damper-rod';
   else if(/damper.*piggyback-reservoir/.test(mesh.name))data.finishRole='damper-gold';
   else if(/damper.*(barrel|spring-seat|rod-gland|rod-end-neck|reservoir-union|reservoir-return-neck|reservoir-cap)/.test(mesh.name))data.finishRole='damper-silver';
   applyC41ReferenceFinish(material,data,environment,{preserveColor:!data.finishRole});
  }
 });
}
