import * as T from './vendor/three.module.min.js';
import {surfaceMetadata,surfacePoints,surfaceOffsets,surfaceRoles,surfaceSources,surfaceOmitted} from './aero-surface-data-745.js?v=746';

// Short moving traces follow the actual native main/flap skins. The visual
// layer takes nearby saved-U tangent speed and never changes the source CAD.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),V=(...v)=>new T.Vector3(...v);
const stops=[[0,0x273791],[.3333,0x176bce],[.6667,0x16bfd3],[1,0x35c58c],[1.3333,0xebd545],[1.6667,0xf18b32],[2,0xe33c30]].map(([x,c])=>[x,new T.Color(c)]);
function colour(v,out){let i=0;while(i<stops.length-2&&v>stops[i+1][0])i++;return out.copy(stops[i][1]).lerp(stops[i+1][1],clamp((v-stops[i][0])/(stops[i+1][0]-stops[i][0]),0,1));}
function fraction(n){n=Math.imul(n^0x9e3779b9,0x85ebca6b);n^=n>>>13;n=Math.imul(n,0xc2b2ae35);return(n>>>0)/4294967296;}

export function createWingSurfaceFlow(){
 const root=new T.Group();root.name='native-wing-surface-flow';root.visible=false;
 const position=[],colours=[],travel=[],seeds=[],cycles=[],durations=[],edges=[],indices=[],paths=[],ranges=new Map(),c=new T.Color(),half=surfaceMetadata.ribbonWidthM*.5;
 for(let line=0;line<surfaceOffsets.length-1;line++){
  const first=surfaceOffsets[line],last=surfaceOffsets[line+1]-1,total=surfacePoints[last*5+4],duration=Math.max(.004,total*surfaceMetadata.packetFractionOfTravel),cycle=Math.max(.025,total+duration*1.05),seed=fraction(line+1)*cycle;
  const source=surfaceSources[line];if(!ranges.has(source))ranges.set(source,{start:indices.length,end:indices.length});
  paths.push({line,first,last,total,duration,cycle,seed,role:surfaceRoles[line],source});
  for(let i=first;i<last;i++){
   if(surfaceOmitted[i])continue;
   const base=position.length/3;
   for(const [point,side]of [[i,-1],[i,1],[i+1,-1],[i+1,1]]){
    const at=point*5;position.push(surfacePoints[at],surfacePoints[at+1]+side*half,surfacePoints[at+2]);colour(surfacePoints[at+3]/15,c);colours.push(c.r,c.g,c.b);
    travel.push(surfacePoints[at+4]);seeds.push(seed);cycles.push(cycle);durations.push(duration);edges.push(side<0?0:1);
   }
   indices.push(base,base+2,base+1,base+1,base+2,base+3);
  }
  ranges.get(source).end=indices.length;
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(position,3));geometry.setAttribute('surfaceColour',new T.Float32BufferAttribute(colours,3));
 for(const [name,data]of Object.entries({surfaceTravel:travel,surfaceSeed:seeds,surfaceCycle:cycles,surfaceDuration:durations,surfaceEdge:edges}))geometry.setAttribute(name,new T.Float32BufferAttribute(data,1));geometry.setIndex(indices);geometry.computeBoundingSphere();
 const material=new T.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,toneMapped:false,uniforms:{phase:{value:0},strength:{value:0}},
  vertexShader:`attribute vec3 surfaceColour;attribute float surfaceTravel,surfaceSeed,surfaceCycle,surfaceDuration,surfaceEdge;varying vec3 c;varying float t,s,p,w,e;void main(){c=surfaceColour;t=surfaceTravel;s=surfaceSeed;p=surfaceCycle;w=surfaceDuration;e=surfaceEdge;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform float phase,strength;varying vec3 c;varying float t,s,p,w,e;
void main(){
 float age=mod(phase+s-t,p);if(age>w)discard;
 float packet=smoothstep(0.,w*.14,age)*(1.-smoothstep(w*.55,w,age));
 float edge=smoothstep(0.,.12,e)*(1.-smoothstep(.88,1.,e));
 float alpha=packet*edge*strength*.97;if(alpha<.002)discard;
 gl_FragColor=vec4(c,alpha);
 #include <colorspace_fragment>
}`});
 const sourceRoots=new Map(),borrowed=[];
 for(const [source,range]of ranges){
  const partGeometry=sourceRoots.size?new T.BufferGeometry():geometry;
  if(partGeometry!==geometry){for(const [name,attribute]of Object.entries(geometry.attributes))partGeometry.setAttribute(name,attribute);partGeometry.setIndex(geometry.index);partGeometry.boundingSphere=geometry.boundingSphere.clone();borrowed.push(partGeometry);}
  partGeometry.setDrawRange(range.start,range.end-range.start);
  const group=new T.Group(),sourceId=surfaceMetadata.sourceIds[source];group.name='surface-flow-'+sourceId;
  const traces=new T.Mesh(partGeometry,material);traces.name='wing-skin-moving-short-traces-'+sourceId;traces.userData.defocusWeight=0;traces.castShadow=false;traces.renderOrder=20;group.add(traces);root.add(group);sourceRoots.set(sourceId,group);
 }
 const diagnostics={...surfaceMetadata,gpuBytes:Object.values(geometry.attributes).reduce((n,a)=>n+a.array.byteLength,geometry.index.array.byteLength),triangles:indices.length/3,phase:0,weight:0};
 return {root,diagnostics,sourceRoots,
  update(motion,weight){const clock=Number.isFinite(motion?.conditionTime)?motion.conditionTime:(motion?.distance||0)/15,alpha=clamp(Number(weight)||0,0,1),phase=.037+clock*surfaceMetadata.timeScale;root.visible=alpha>.0001;material.uniforms.phase.value=phase;material.uniforms.strength.value=alpha;material.opacity=alpha;diagnostics.phase=phase;diagnostics.weight=alpha;},
  packetHeads({limit=512}={}){const out=[];
   for(const path of paths){const clock=material.uniforms.phase.value+path.seed-path.duration*.35,cycle=Math.floor(clock/path.cycle),at=clock-cycle*path.cycle;if(at<0||at>path.total)continue;let first=path.first,last=path.last-1;
    while(first<last){const mid=(first+last)>>1;if(surfacePoints[(mid+1)*5+4]<at)first=mid+1;else last=mid;}
    if(surfaceOmitted[first])continue;
    const a=first*5,b=(first+1)*5,mix=clamp((at-surfacePoints[a+4])/Math.max(1e-12,surfacePoints[b+4]-surfacePoints[a+4]),0,1);
    const point=V(surfacePoints[a],surfacePoints[a+1],surfacePoints[a+2]).lerp(V(surfacePoints[b],surfacePoints[b+1],surfacePoints[b+2]),mix);
    out.push({path:path.line,sourceId:surfaceMetadata.sourceIds[path.source],role:surfaceMetadata.roleNames[path.role],cycle,travelSeconds:at,position:point.toArray()});if(out.length>=limit)break;
   }return out;
  },
  dispose(){for(const owned of borrowed){for(const name of Object.keys(owned.attributes))owned.deleteAttribute(name);owned.setIndex(null);owned.dispose();}geometry.dispose();material.dispose();paths.length=0;sourceRoots.clear();root.clear();}
 };
}
