import * as T from './vendor/three.module.min.js';

// Native DC26 pin-neighbour cycle, from 744-electric-mechanism-evidence.json.
// Its clockwise X/Z order matches the output sprocket's positive +Y rotation.
const sequence=[35,54,62,77,37,38,59,67,69,75,86,85,47,45,43,49,48,42,66,56,80,70,51,72,84,81,46,79,63,53,40,44,78,55,36,41,83,71,74,73,64,76,60,57,61,52,68,65,50,58,39,82].map(n=>`dc26-drive-${String(n).padStart(3,'0')}`);
const ids=new Set(sequence),pitch=.015875,teeth=37,metresPerRadian=teeth*pitch/(2*Math.PI);
const V=()=>new T.Vector3(),clamp=x=>T.MathUtils.clamp(Number(x)||0,0,1);

export function createNativeElectricChain(meshes=[]){
 const registry=new Map();let bindings=[],curve=null,length=0,disposed=false;
 let state={rearAxleAngle:0,weight:0,distanceM:0,phaseM:0,moving:0};
 const point=V(),tangent=V(),offset=V(),target=V(),rotation=new T.Quaternion();
 const current=new T.Matrix4(),delta=new T.Matrix4(),back=new T.Matrix4();
 function append(list=[]){
  if(disposed)return 0;
  let added=0;
  for(const mesh of list){const d=mesh.userData||{};
   if(d.role!=='chain-link'||!ids.has(d.id)||registry.has(d.id))continue;
   const rest=d.nativeRestMatrix||d.installationMatrix;
   if(!rest||rest.length!==16||!Array.from(rest).every(Number.isFinite)||!d.center?.every(Number.isFinite))continue;
   registry.set(d.id,{mesh,centre:new T.Vector3(...d.center),rest:new T.Matrix4().fromArray(rest)});added++;
  }
  if(!added||registry.size!==sequence.length)return added;
  bindings=sequence.map(id=>registry.get(id));
  curve=new T.CatmullRomCurve3(bindings.map(b=>b.centre.clone()),true,'centripetal');curve.arcLengthDivisions=4096;
  const lengths=curve.getLengths();length=lengths.at(-1);
  bindings.forEach((b,i)=>{
   const at=i/bindings.length*(lengths.length-1),j=Math.floor(at);
   b.s=T.MathUtils.lerp(lengths[j],lengths[Math.min(j+1,lengths.length-1)],at-j);
   b.basePoint=curve.getPointAt(b.s/length);b.baseTangent=curve.getTangentAt(b.s/length);
   b.offset=b.centre.clone().sub(b.basePoint);b.inverse=b.rest.clone().invert();
  });
  return added;
 }
 append(meshes);
 return {append,
  update(inputs={},weight=1){
   const angle=inputs.rearAxleAngle,w=clamp(weight);
   if(disposed||!curve||!Number.isFinite(angle)){state={...state,moving:0,invalidInput:!Number.isFinite(angle)};return;}
   const nominalSpan=inputs.cycleRearAngleSpan*metresPerRadian,cycleGain=inputs.loopPeriod>0&&nominalSpan?Math.round(nominalSpan/length)*length/nominalSpan:1;
   const distance=angle*metresPerRadian*w*cycleGain;
   let phase=((distance%length)+length)%length;
   if(inputs.loopPeriod>0)phase=Math.round(phase*1e9)/1e9;
   if(phase<1e-12||length-phase<1e-12)phase=0;
   state={rearAxleAngle:angle,weight:w,distanceM:distance,phaseM:phase,moving:phase===0?0:bindings.length,invalidInput:false};
   // The caller restores each installed pose before this call. Preserve its
   // surrounding car/explosion transform and apply only native chain travel.
   if(phase===0)return;
   for(const b of bindings){
    const s=(b.s+phase)%length;curve.getPointAt(s/length,point);curve.getTangentAt(s/length,tangent);
    rotation.setFromUnitVectors(b.baseTangent,tangent);
    target.copy(point).add(offset.copy(b.offset).applyQuaternion(rotation));
    delta.makeRotationFromQuaternion(rotation).setPosition(target);
    back.makeTranslation(-b.centre.x,-b.centre.y,-b.centre.z);delta.multiply(back);
    b.mesh.updateMatrix();current.copy(b.mesh.matrix).multiply(b.inverse).multiply(delta).multiply(b.rest);
    current.decompose(b.mesh.position,b.mesh.quaternion,b.mesh.scale);b.mesh.updateMatrix();
   }
  },
  diagnostics(){return {...state,registered:!!curve&&!disposed,links:registry.size,closedSequence:sequence.slice(),
   pitchM:pitch,outputTeeth:teeth,metresPerAxleRadian:metresPerRadian,loopLengthM:length,
   sourcePinGapMaximumMm:.21783054317281053,weightSemantics:'absolute axle phase multiplier; use 1 for an already blended axle angle',
   model:'rigid native links travelling on the original installed-centre closed curve',
   qualification:'Illustrative kinematics; native CAD installation gaps are retained at zero phase. Tooth contact, tension and dynamic mating-pin closure are not validated.'};},
  dispose(){disposed=true;registry.clear();bindings=[];curve=null;}
 };
}
