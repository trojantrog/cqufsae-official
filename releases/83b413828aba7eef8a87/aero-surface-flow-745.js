import * as T from './vendor/three.module.min.js';
import {captureClock,capturePeriodAttribute,captureInterval} from './cyclic-presentation-753.js?v=761';
import {surfaceMetadata,surfacePoints,surfaceOffsets,surfaceRoles,surfaceSources,surfaceOmitted} from './aero-surface-data-745.js?v=761';
import {flowColour as colour,flowColourScale} from './aero-colour-scale-757.js?v=757.1';
import {createFlowStrokes} from './flow-strokes-759.js?v=759.1';

// Short moving traces follow the actual native main/flap skins. The visual
// layer takes nearby saved-U tangent speed and never changes the source CAD.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),V=(...v)=>new T.Vector3(...v);
const timeScale=.16,packetFraction=.42;
function fraction(n){n=Math.imul(n^0x9e3779b9,0x85ebca6b);n^=n>>>13;n=Math.imul(n,0xc2b2ae35);return(n>>>0)/4294967296;}

export function createWingSurfaceFlow(){
 const root=new T.Group();root.name='native-wing-surface-flow';root.visible=false;
 const paths=[],sources=new Map(),c=new T.Color(),uniforms={phase:{value:0},strength:{value:0}},sourceRoots=new Map(),owned=[];
 for(let line=0;line<surfaceOffsets.length-1;line++){
  const first=surfaceOffsets[line],last=surfaceOffsets[line+1]-1,total=surfacePoints[last*5+4],duration=Math.max(.007,total*packetFraction),cycle=Math.max(.025,total+duration*1.05),seed=fraction(line+1)*cycle;
  const source=surfaceSources[line];if(!sources.has(source))sources.set(source,{position:[],flowColour:[],travel:[],seed:[],pathPeriod:[],duration:[],emphasis:[]});const data=sources.get(source);
  paths.push({line,first,last,total,duration,cycle,seed,role:surfaceRoles[line],source});
  for(let i=first;i<last;i++){
   if(surfaceOmitted[i])continue;
   for(const point of [i,i+1]){
    const at=point*5;data.position.push(surfacePoints[at],surfacePoints[at+1],surfacePoints[at+2]);colour(surfacePoints[at+3]/15,c);data.flowColour.push(c.r,c.g,c.b);
    data.travel.push(surfacePoints[at+4]);data.seed.push(seed);data.pathPeriod.push(cycle);data.duration.push(duration);data.emphasis.push(1);
   }
  }
 }
 for(const [source,data]of sources){
  const geometry=new T.BufferGeometry();for(const [name,values]of Object.entries(data))geometry.setAttribute(name,new T.Float32BufferAttribute(values,['position','flowColour'].includes(name)?3:1));geometry.computeBoundingSphere();geometry.computeBoundingBox();
  const sourceId=surfaceMetadata.sourceIds[source],strokes=createFlowStrokes(geometry,{name:'wing-skin-moving-short-traces-'+sourceId,width:2.20,baseline:.13,gain:.94,uniforms,pathDuration:true}),group=new T.Group();group.name='surface-flow-'+sourceId;
  group.add(strokes.mesh);root.add(group);sourceRoots.set(sourceId,group);owned.push({geometry,strokes,cycles:data.pathPeriod});
 }
 const diagnostics={...surfaceMetadata,timeScale,packetFractionOfTravel:packetFraction,strokeWidthPixels:2.20,staticLineAlpha:.13,colourScale:flowColourScale,gpuBytes:owned.reduce((total,{geometry})=>total+Object.values(geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0),0),triangles:owned.reduce((total,{geometry})=>total+geometry.attributes.position.count,0),phase:0,weight:0};
 let cycleMotion=null;
 return {root,diagnostics,sourceRoots,
  update(motion,weight){cycleMotion=motion;for(const {geometry,cycles}of owned)capturePeriodAttribute(geometry.attributes.pathPeriod,cycles,timeScale,motion);const clock=Number.isFinite(motion?.conditionTime)?captureClock(motion):(motion?.distance||0)/15,alpha=clamp(Number(weight)||0,0,1),phase=.037+clock*timeScale;root.visible=alpha>.0001;uniforms.phase.value=phase;uniforms.strength.value=alpha;for(const {strokes}of owned)strokes.material.opacity=alpha;diagnostics.phase=phase;diagnostics.weight=alpha;},
  packetHeads({limit=512}={}){const out=[];
   for(const path of paths){const clock=uniforms.phase.value+path.seed-path.duration*.35,interval=captureInterval(path.cycle,timeScale,cycleMotion),cycle=Math.floor(clock/interval),at=clock-cycle*interval;if(at<0||at>path.total)continue;let first=path.first,last=path.last-1;
    while(first<last){const mid=(first+last)>>1;if(surfacePoints[(mid+1)*5+4]<at)first=mid+1;else last=mid;}
    if(surfaceOmitted[first])continue;
    const a=first*5,b=(first+1)*5,mix=clamp((at-surfacePoints[a+4])/Math.max(1e-12,surfacePoints[b+4]-surfacePoints[a+4]),0,1);
    const point=V(surfacePoints[a],surfacePoints[a+1],surfacePoints[a+2]).lerp(V(surfacePoints[b],surfacePoints[b+1],surfacePoints[b+2]),mix);
    out.push({path:path.line,sourceId:surfaceMetadata.sourceIds[path.source],role:surfaceMetadata.roleNames[path.role],cycle,travelSeconds:at,position:point.toArray()});if(out.length>=limit)break;
   }return out;
  },
  dispose(){for(const {geometry,strokes}of owned){geometry.dispose();strokes.dispose();}paths.length=0;sourceRoots.clear();root.clear();}
 };
}
