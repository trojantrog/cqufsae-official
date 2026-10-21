import * as T from './vendor/three.module.min.js';
import {captureClock,capturePeriodAttribute} from './cyclic-presentation-753.js?v=761';
import {createFlowStrokes} from './flow-strokes-759.js?v=759.1';

const V=(...a)=>new T.Vector3(...a),clamp=x=>T.MathUtils.clamp(x,0,1),smooth=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const ramp=(a,b,x)=>smooth((x-a)/(b-a));
function halton(index,base){let value=0,step=1/base;while(index){value+=(index%base)*step;index=Math.floor(index/base);step/=base;}return value;}
const domain={minimum:[-5,-1.3,-.018],maximum:[4.8,1.3,2]};
const envelopeFallback=[[-1.58,-.48,.52,-.62,.48,1.36],[-1.35,-.46,.12,.70,.46,.86],[.64,-.40,.14,1.32,.40,.43],[.838,-.620,.040,1.350,.620,.301]];
function nativeBounds(meshes){const out=[];for(const m of meshes){const d=m.userData||{};if(!m.isMesh||!m.geometry?.attributes.position||['a08','e74'].includes(d.variant))continue;if(d.group!=='body'&&!['轮胎','轮辋'].includes(d.label))continue;m.geometry.computeBoundingBox();const b=m.geometry.boundingBox.clone();if(d.sourceNative&&(d.nativeRestMatrix||d.installationMatrix))b.applyMatrix4(new T.Matrix4().fromArray(d.nativeRestMatrix||d.installationMatrix));if(!b.isEmpty()&&b.getSize(V()).length()>.09)out.push({id:d.id,box:b});}return out;}
function chordHits(a,b,box){let lo=0,hi=1;for(const axis of ['x','y','z']){const delta=b[axis]-a[axis];if(Math.abs(delta)<1e-12){if(a[axis]<=box.min[axis]||a[axis]>=box.max[axis])return false;continue;}let p=(box.min[axis]-a[axis])/delta,q=(box.max[axis]-a[axis])/delta;if(p>q)[p,q]=[q,p];lo=Math.max(lo,p);hi=Math.min(hi,q);if(lo>=hi)return false;}return hi>0&&lo<1;}

// Display-only far-field bundles. Native body/tyre bounds provide conservative
// avoidance; no inferred velocity or pressure field is attached to the CAD.
export function createOuterAeroFlow({nativeMeshes=[]}={}){
 const root=new T.Group();root.name='outer-airflow-bundles';root.visible=false;root.userData={illustrativeOverlay:true,partCounted:false};
 const supplied=nativeBounds(nativeMeshes),obstacles=supplied.length?supplied:envelopeFallback.map((a,i)=>({id:'fallback-'+i,box:new T.Box3(V(...a.slice(0,3)),V(...a.slice(3)))}));
 const expanded=obstacles.map(({box})=>box.clone().expandByScalar(.014)),positions=[],colours=[],travel=[],phases=[],periods=[],edgeWeights=[],tracks=[];
 const colour=new T.Color();let omittedChords=0;
 // Unsampled outer context has one restrained tint; speed colours belong to
 // the recorded near-car field, not distance from a bounding box.
 const colourAt=()=>colour.set(0x4984a9);
 const seeds=[];
 for(let i=1;i<=116;i++)seeds.push({y:(halton(i,2)*2-1)*1.245,z:.030+halton(i,3)*1.94,phase:halton(i,5),nearWing:false});
 // Extra scattered approach bundles at the real wing height, including the
 // available gap below its source lower surface and the region just above it.
 for(let i=1;i<=32;i++)seeds.push({y:(halton(i,3)*2-1)*.73,z:i<=10?.012+halton(i,2)*.012:.318+halton(i,2)*.23,phase:halton(i+123,5),nearWing:true});
 const edgeAt=p=>ramp(-5,-4.55,p.x)*(1-ramp(4.40,4.8,p.x))*(1-ramp(1.10,1.3,Math.abs(p.y)))*ramp(-.018,.022,p.z)*(1-ramp(1.77,2,p.z));
 for(let id=0;id<seeds.length;id++){
  const seed=seeds[id],side=seed.y<0?-1:1,over=seed.z>.58,points=[],lengths=[0],speed=15,count=176;
  for(let i=0;i<=count;i++){
   const u=i/count,x=4.8-9.8*u,y=seed.y,z=seed.z;
   let dy=0,dz=0;
   for(const box of expanded){
    const w=ramp(box.min.x-.70,box.min.x-.018,x)*(1-ramp(box.max.x+.018,box.max.x+.70,x));if(w<1e-5)continue;
    const yz=ramp(box.min.y-.09,box.min.y,y)*(1-ramp(box.max.y,box.max.y+.09,y))*ramp(box.min.z-.05,box.min.z,z)*(1-ramp(box.max.z,box.max.z+.05,z));if(yz<1e-5)continue;
    if(over)dz=Math.max(dz,(box.max.z+.045-z)*w*yz);
    else dy=Math.max(dy,(side>0?box.max.y+.055-y:y-box.min.y+.055)*w*yz);
   }
   // Wake motion begins behind the car. The old sign put its oscillation
   // upstream of the nose; nearby seeds now share the same smooth wake turn.
   const downstream=Math.max(0,-1.42-x),wake=ramp(0,.55,downstream)*(1-ramp(2.6,3.5,downstream));
   const tipY=side*.42,tipZ=1.03,ry=y+side*dy-tipY,rz=z+dz-tipZ,influence=Math.exp(-(ry*ry+rz*rz)/.20),angle=side*downstream*.9;
   const spreadY=(ry*Math.cos(angle)-rz*Math.sin(angle)-ry)*influence*wake*.24,spreadZ=(ry*Math.sin(angle)+rz*Math.cos(angle)-rz)*influence*wake*.24;
   const p=V(x,T.MathUtils.clamp(y+side*dy+spreadY,-1.285,1.285),T.MathUtils.clamp(z+dz+spreadZ,-.012,1.986));
   if(points.length)lengths.push(lengths.at(-1)+p.distanceTo(points.at(-1)));points.push(p);
  }
  const period=.20+.055*halton(id+1,11),phase=seed.phase*period,start=positions.length/6;
  for(let i=0;i<points.length-1;i++){
   const a=points[i],b=points[i+1];if(obstacles.some(({box})=>chordHits(a,b,box))){omittedChords++;continue;}
   for(const [p,at]of [[a,i],[b,i+1]]){positions.push(p.x,p.y,p.z);colourAt(p);colours.push(colour.r,colour.g,colour.b);travel.push(lengths[at]/speed);phases.push(phase);periods.push(period);edgeWeights.push(edgeAt(p)*(seed.nearWing?.84:.65+.23*halton(id+1,19)));}
  }
  tracks.push({id,start,end:positions.length/6,period,phase,nearWing:seed.nearWing,maximumPackets:Math.ceil(lengths.at(-1)/speed/period)+1});
 }
 const geometry=new T.BufferGeometry();for(const [name,data,size]of [['position',positions,3],['flowColour',colours,3],['travel',travel,1],['seed',phases,1],['pathPeriod',periods,1],['emphasis',edgeWeights,1]])geometry.setAttribute(name,new T.Float32BufferAttribute(data,size));geometry.computeBoundingSphere();geometry.computeBoundingBox();
 const uniforms={phase:{value:0},strength:{value:0},packetDuration:{value:.055}},strokes=createFlowStrokes(geometry,{name:'wide-domain-airflow',width:1.15,baseline:0,gain:.46,uniforms});
 strokes.mesh.userData.illustrativeOverlay=true;root.add(strokes.mesh);
 const diagnostics={domain,displayOnly:true,validatedCFD:false,colourQuantity:'neutral outer-flow context; no sampled speed colour',paths:seeds.length,approachPaths:32,segments:positions.length/6,omittedNativeBoundsChords:omittedChords,avoidanceBasis:supplied.length?'native-body-and-wheel-bounds':'conservative-assembly-envelope',nativeAvoidanceParts:supplied.map(o=>o.id),gpuBytes:Object.values(geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0),maximumPacketsPerPath:Math.max(...tracks.map(t=>t.maximumPackets)),packetDuration:.055,packetPeriodRange:[.20,.255],timeScale:.16,strokeWidthPixels:1.15,upstreamWaves:false,wakeStartX:-1.42,staticLineAlpha:0,conditionTime:0,strength:0,framingPointCount:0};
 return {root,diagnostics,
  update(motion={},weight=0){const strength=clamp(Number(weight)||0),time=Number.isFinite(motion.conditionTime)?captureClock(motion):0;capturePeriodAttribute(geometry.attributes.pathPeriod,periods,.16,motion);uniforms.phase.value=time*.16;uniforms.strength.value=strength;strokes.material.opacity=strength;root.visible=strength>.0001;diagnostics.conditionTime=time;diagnostics.strength=strength;},
  dispose(){geometry.dispose();strokes.dispose();root.clear();root.visible=false;tracks.length=0;}
 };
}
