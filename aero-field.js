import * as T from './vendor/three.module.min.js';
import {flowMetadata,flowPoints,flowOffsets,flowGroups,flowPhases,flowPeriods} from './aero-flow-data-745.js?v=746';
import {createWingSurfaceFlow} from './aero-surface-flow-745.js?v=746';
import {createOuterAeroFlow} from './aero-outer-flow-745.js?v=746';

// The saved straight-line 15 m/s RANS snapshot is unconverged and unvalidated.
// Display filtering removes native CAD crossing chords without redirecting U.
const V=(...a)=>new T.Vector3(...a),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const defaultGround=x=>flowMetadata.groundIntercept+flowMetadata.groundSlope*x+.010;
const inletSpeed=flowMetadata.condition.speedMps,stride=flowMetadata.pointStride||6;
const packetPeriod=flowMetadata.display.packetPeriodSeconds,packetDuration=flowMetadata.display.packetDurationSeconds;
const stops=[[0,0x273791],[.3333,0x176bce],[.6667,0x16bfd3],[1,0x35c58c],[1.3333,0xebd545],[1.6667,0xf18b32],[2,0xe33c30]].map(([speed,colour])=>[speed,new T.Color(colour)]);
function tint(speed,out){let i=0;while(i<stops.length-2&&speed>stops[i+1][0])i++;return out.copy(stops[i][1]).lerp(stops[i+1][1],clamp((speed-stops[i][0])/(stops[i+1][0]-stops[i][0]),0,1));}

// Frame only the near-body field; the integration inlet and long wake remain
// outside this camera cloud. These bounds are in the native assembly datum.
const nearBody={minimum:[-1.63,-.70,-.036],maximum:[1.45,.70,1.405]},regions={
 body:nearBody,structure:nearBody,frame:nearBody,
 'front-wing':{minimum:[.75,-.69,-.036],maximum:[1.45,.69,.39]},
 'rear-wing':{minimum:[-1.70,-.50,.53],maximum:[-.57,.50,1.405]}
};
// Camera bounds use real near-car streamline points. A single high box also
// adds empty space above the nose and unnecessarily shrinks the car.
const nearProfiles=[
 {minimum:[-.64,-.49,-.036],maximum:[1.35,.49,.84]},
 {minimum:[.75,-.70,-.036],maximum:[1.46,.70,.39]},
 {minimum:[-1.46,-.48,.565],maximum:[-.60,.48,1.34]}
];
const inside=(p,box)=>[p.x,p.y,p.z].every((v,i)=>v>=box.minimum[i]&&v<=box.maximum[i]);
function regionName(request){if(typeof request==='string')return request;return request?.region||request?.mode||request?.department;}
function emphasis(p){
 if(p.x<-.57&&p.z>.53&&Math.abs(p.y)<.53)return p.z>1.?1.18:1.12;
 if(p.x>.75&&p.z<.40&&Math.abs(p.y)<.70)return 1.02;
 if(p.x>-.72&&p.x<1.40&&p.z<.76&&Math.abs(p.y)<.47)return .94;
 return .63;
}

// Compatibility sampler: nearest recorded streamline vertex, normalized by
// inlet speed. This is a point lookup, not an additional field solve.
export function flowVelocity(p,ground=defaultGround(p.x)){
 let distance=Infinity,at=0;
 for(let i=0;i<flowPoints.length;i+=stride){const d=(p.x-flowPoints[i])**2+(p.y-flowPoints[i+1])**2+(p.z-flowPoints[i+2])**2;if(d<distance){distance=d;at=i;}}
 const out=V(flowPoints[at+3],flowPoints[at+4],flowPoints[at+5]).divideScalar(inletSpeed);
 if(p.z<ground&&out.z<0)out.z=0;return out;
}

export function createAeroField({groundAt=defaultGround,nativeMeshes=[]}={}){
 const root=new T.Group();root.name='aerodynamic-streamlines';root.visible=false;
 const positions=[],colours=[],distances=[],seeds=[],speeds=[],pathIds=[],sourceGroups=[],weights=[],periods=[],tracks=[],colour=new T.Color();let count=0,groundRemoved=0;
 const point=(i,out)=>{const at=i*stride;return out.set(flowPoints[at],flowPoints[at+1],flowPoints[at+2]);};
 const speed=i=>Math.hypot(flowPoints[i*stride+3],flowPoints[i*stride+4],flowPoints[i*stride+5])/inletSpeed;
 const a=V(),b=V();
 for(let line=0;line<flowOffsets.length-1;line++){
  let visible=false;const cycle=flowPeriods[line],seed=flowPhases[line]*cycle,start=positions.length/6;
  // One short packet per retained path also avoids stacked marker trains in
  // long, recirculating paths of this unconverged steady-field snapshot.
  for(let i=flowOffsets[line];i<flowOffsets[line+1]-1;i++){
   point(i,a);point(i+1,b);const sa=speed(i),sb=speed(i+1);
   const travel=flowPoints[i*stride+6],nextTravel=flowPoints[(i+1)*stride+6];
   // Filter against the caller's ground rather than moving points through CAD.
   if(a.z>=groundAt(a.x)&&b.z>=groundAt(b.x)){
    positions.push(a.x,a.y,a.z,b.x,b.y,b.z);tint(sa,colour);colours.push(colour.r,colour.g,colour.b);tint(sb,colour);colours.push(colour.r,colour.g,colour.b);
    distances.push(travel,nextTravel);seeds.push(seed,seed);speeds.push(sa,sb);pathIds.push(line,line);
    const skinWeight=flowGroups[line]>=6?1.25:1;
    sourceGroups.push(flowGroups[line],flowGroups[line]);weights.push(emphasis(a)*skinWeight,emphasis(b)*skinWeight);periods.push(cycle,cycle);visible=true;
   }else groundRemoved++;
  }
  if(visible){count++;tracks.push({line,group:flowGroups[line],seed,period:cycle,start,end:positions.length/6});}
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('flowColour',new T.Float32BufferAttribute(colours,3));
 geometry.setAttribute('travel',new T.Float32BufferAttribute(distances,1));geometry.setAttribute('seed',new T.Float32BufferAttribute(seeds,1));
 geometry.setAttribute('relativeSpeed',new T.Float32BufferAttribute(speeds,1));geometry.setAttribute('pathId',new T.Float32BufferAttribute(pathIds,1));geometry.computeBoundingSphere();
 geometry.setAttribute('sourceGroup',new T.Float32BufferAttribute(sourceGroups,1));geometry.setAttribute('emphasis',new T.Float32BufferAttribute(weights,1));geometry.computeBoundingBox();
 geometry.setAttribute('pathPeriod',new T.Float32BufferAttribute(periods,1));
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,toneMapped:false,uniforms:{phase:{value:0},strength:{value:0},packetPeriod:{value:packetPeriod},packetDuration:{value:packetDuration}},
  vertexShader:`attribute vec3 flowColour;attribute float travel,seed,emphasis,pathPeriod;varying vec3 c;varying float d,s,e,period;void main(){c=flowColour;d=travel;s=seed;e=emphasis;period=pathPeriod;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform float phase,strength,packetPeriod,packetDuration;varying vec3 c;varying float d,s,e,period;
void main(){
 float age=mod(phase+s-d,period);
 if(age>packetDuration)discard;
 float packet=smoothstep(0.,.004,age)*(1.-smoothstep(packetDuration*.52,packetDuration,age));
 if(packet<.002)discard;
 gl_FragColor=vec4(c,min(.98,strength*e*.94*packet));
 #include <colorspace_fragment>
}`});
 const lines=new T.LineSegments(geometry,material);lines.name='rans-travelling-flow-bundles';lines.userData.defocusWeight=0;lines.renderOrder=20;root.add(lines);
 const surfaceFlow=createWingSurfaceFlow(),wingSources=nativeMeshes.filter(m=>m.isMesh&&surfaceFlow.sourceRoots.has(m.userData?.id)),outerFlow=createOuterAeroFlow({nativeMeshes});root.add(surfaceFlow.root,outerFlow.root);
 outerFlow.root.traverse(object=>{if(object.isLine||object.isMesh)object.renderOrder=20;});
 const directions=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)directions.push(V(x,y,z));
 const cloudFor=boxes=>{
  const extremes=directions.map(()=>({score:-Infinity,point:null})),p=V();
  for(let i=0;i<positions.length;i+=3){p.fromArray(positions,i);if(!boxes.some(box=>inside(p,box)))continue;
   for(let j=0;j<directions.length;j++){const score=p.dot(directions[j]);if(score>extremes[j].score)extremes[j]={score,point:p.clone()};}
  }
  const unique=new Map();for(const {point}of extremes)if(point)unique.set(point.toArray().join(','),point);return [...unique.values()];
 };
 const cameraCloud=cloudFor(nearProfiles),frontCloud=cloudFor([nearProfiles[1]]),rearCloud=cloudFor([nearProfiles[2]]);
 const cameraClouds={body:cameraCloud,structure:cameraCloud,frame:cameraCloud,'front-wing':frontCloud,'rear-wing':rearCloud};
 const supplied=new Set(nativeMeshes.map(m=>m.userData?.id));
 const diagnostics={...flowMetadata,renderedPaths:count,renderedSegments:positions.length/6,groundChordsRemoved:groundRemoved,
  sourceRegistered:flowMetadata.sourceParts.every(p=>supplied.has(p.id)),suppliedNativeParts:flowMetadata.sourceParts.filter(p=>supplied.has(p.id)).map(p=>p.id),
  sourceDisplayBoundaryParts:flowMetadata.displayOnlyBoundaryParts.filter(id=>supplied.has(id)),rearWingIndexGroupsURL:'./aero-rear-wing-groups-745.json?v=746',surfaceFlow:surfaceFlow.diagnostics,outerFlow:outerFlow.diagnostics,framingRegions:regions,framingNearProfiles:nearProfiles,framingPointCount:cameraCloud.length,velocitySampler:'nearest saved RANS streamline vertex',gpuBytes:Object.values(geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0),tracerPhase:0,tracerClock:null,staticLineAlpha:0,maximumPacketsPerPath:1};
 const grouped=new Map();for(const track of tracks){if(!grouped.has(track.group))grouped.set(track.group,[]);grouped.get(track.group).push(track);}
 const sampleOrder=[],groups=[...grouped.keys()].sort((a,b)=>b-a);for(let i=0;i<Math.max(0,...[...grouped.values()].map(x=>x.length));i++)for(const group of groups){const track=grouped.get(group)[i];if(track)sampleOrder.push(track);}
 root.userData.flowModel={sourceSha256:flowMetadata.sourceSha256,sourceSampleSha256:flowMetadata.sourceSampleSha256,iteration:flowMetadata.iteration,validatedCFD:false,numericallyConverged:false};
 return {root,lineCount:count,segments:positions.length/6,diagnostics,surfaceFlow,outerFlow,
  regionBounds:regions,
  framingPoints(request,matrix=null){const name=regionName(request)||(root.visible?'body':null),cloud=cameraClouds[name];return cloud?cloud.map(p=>matrix?p.clone().applyMatrix4(matrix):p.clone()):[];},
  update(motion,weight){
   const strength=clamp(Number(weight)||0,0,1),time=Number.isFinite(motion?.conditionTime)?motion.conditionTime:null;
   const phase=.12+(time!==null?time*flowMetadata.display.tracerTimeScale:Number.isFinite(motion?.distance)?motion.distance/inletSpeed*1.3:0);
   root.visible=strength>.0001;material.uniforms.phase.value=phase;material.uniforms.strength.value=strength;material.opacity=strength;
   diagnostics.tracerPhase=phase;diagnostics.tracerClock=time!==null?'conditionTime':'distance-fallback';
   for(const source of wingSources){const group=surfaceFlow.sourceRoots.get(source.userData.id);group.position.copy(source.position);group.quaternion.copy(source.quaternion);group.scale.copy(source.scale);}
   surfaceFlow.update(motion,strength);
   outerFlow.update(motion,strength);
  },
  // Bright packet-core samples on the actual retained geometry. This narrow
  // diagnostic does not create extra streamlines or bypass depth occlusion.
  packetHeads({region='rear-wing',limit=32,phase=material.uniforms.phase.value}={}){
   const samples=[],box=regions[region],headOffset=packetDuration*.28,p=V();
   for(const track of sampleOrder){
    const low=distances[track.start*2],high=distances[(track.end-1)*2+1],clock=phase+track.seed-headOffset;
    for(let k=Math.ceil((clock-high)/track.period);k<=Math.floor((clock-low)/track.period);k++){
     const at=clock-k*track.period;let first=track.start,last=track.end-1;
     while(first<last){const m=(first+last)>>1;if(distances[m*2+1]<at)first=m+1;else last=m;}
     if(at<distances[first*2]||at>distances[first*2+1])continue;
     const mix=clamp((at-distances[first*2])/Math.max(1e-12,distances[first*2+1]-distances[first*2]),0,1),offset=first*6;
     p.set(positions[offset],positions[offset+1],positions[offset+2]).lerp(b.set(positions[offset+3],positions[offset+4],positions[offset+5]),mix);
     if(box&&[p.x,p.y,p.z].some((v,i)=>v<box.minimum[i]||v>box.maximum[i]))continue;
     samples.push({path:track.line,group:track.group,cycle:k,travelSeconds:at,position:p.toArray(),speedMps:T.MathUtils.lerp(speeds[first*2],speeds[first*2+1],mix)*inletSpeed});
     if(samples.length>=limit)return samples;
    }
   }
   return samples;
  },
  dispose(){geometry.dispose();material.dispose();surfaceFlow.dispose();outerFlow.dispose();tracks.length=0;sampleOrder.length=0;root.clear();}};
}

