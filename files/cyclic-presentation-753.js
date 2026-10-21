import {mooseManeuver} from './moose-maneuver.js?v=761';

const TAU=Math.PI*2,clamp=x=>Math.max(0,Math.min(1,x));
export function captureClock(motion,time=motion?.conditionTime||0){
 const period=motion?.loopPeriod,start=motion?.loopStart;
 if(!(period>0)||!Number.isFinite(start))return time;
 let phase=((time-start)%period+period)%period;
 if(phase<1e-8||period-phase<1e-8)phase=0;
 return start+phase;
}
export function captureFrequency(rate,motion){const p=motion?.loopPeriod;return p>0?Math.max(1,Math.round(rate*p))/p:rate;}
export function captureAngularFrequency(rate,motion){const p=motion?.loopPeriod;return p>0?Math.max(1,Math.round(rate*p/TAU))*TAU/p:rate;}
export function captureInterval(interval,rate,motion){const span=motion?.loopPeriod*rate;return span>0?span/Math.max(1,Math.round(span/interval)):interval;}
const periodCache=new WeakMap();
export function capturePeriodAttribute(attribute,original,rate,motion){
 const period=motion?.loopPeriod||0;if(!period&&!periodCache.has(attribute)||periodCache.get(attribute)===period)return;
 const a=attribute.array;for(let i=0;i<a.length;i++)a[i]=captureInterval(original[i],rate,motion);
 attribute.needsUpdate=true;periodCache.set(attribute,period);
}

// Optional offline presentation phases. The source manoeuvre and source CAD
// remain unchanged; ordinary 3D use takes the original branches verbatim.
export function createCyclicPresentation(corners,initialProfile=null){
 let profile={},enabled=false,period=36,loopStart=null,previousWeight=0,exit=false,exitWeight=1;
 const scales=new Map(),targets=new Map();let rearTurns=0,periodDistance=0;
 function configure(next=null){
  profile=next?{...next}:{};enabled=profile.enabled===true;period=profile.cyclePeriod||36;
  if(enabled&&Math.abs(period/36-Math.round(period/36))>1e-9)throw new Error('Capture cycle must contain complete 36-second source manoeuvres.');
  loopStart=Number.isFinite(profile.loopStart)?profile.loopStart:null;previousWeight=0;exit=false;targets.clear();scales.clear();
  periodDistance=mooseManeuver(period).distance-mooseManeuver(0).distance;
  const rear=corners.filter(c=>!c.front),turns=rear.reduce((n,c)=>n+periodDistance/Math.max(.16,c.radius)/TAU,0)/Math.max(1,rear.length),multiple=profile.driveVariant==='e74'?11:5;
  rearTurns=Math.max(multiple,Math.round(turns/multiple)*multiple);
  for(const c of corners){const sourceTurns=periodDistance/Math.max(.16,c.radius)/TAU,target=c.front?Math.max(1,Math.round(sourceTurns)):rearTurns;scales.set(c,enabled?target/sourceTurns:1);}
  return diagnostics();
 }
 function beginFrame(weight,stage,rawAngle=null){
  if(!enabled)return;
  if(stage==='assemble'&&weight<previousWeight-1e-10&&!exit){
   const at=c=>rawAngle?rawAngle(c):c.spin||0;exit=true;exitWeight=previousWeight;const rear=corners.filter(c=>!c.front),rearAngle=rear.reduce((n,c)=>n+at(c),0)/Math.max(1,rear.length),rearTarget=TAU*5*Math.round(rearAngle/(TAU*5));
   for(const c of corners)targets.set(c,c.front?TAU*Math.round(at(c)/TAU):rearTarget);
  }
  if(weight>previousWeight+1e-10&&stage!=='assemble')exit=false;
  previousWeight=weight;
 }
 function angle(c,raw,weight){
  if(!enabled)return raw;
  if(weight<1e-12)return 0;
  if(!exit)return raw;
  const a=clamp(weight/Math.max(1e-12,exitWeight)),target=targets.get(c)||0;
  return target+(raw-target)*a;
 }
 function chainDistance(angle,metresPerRadian,length){
  const raw=angle*metresPerRadian;if(!enabled||!(length>0))return raw;
  const span=rearTurns*TAU*metresPerRadian,closed=Math.round(span/length)*length;
  if(!span)return raw;let travel=raw*closed/span;
  if(exit){
   if(previousWeight<1e-12)return 0;
   const rear=corners.find(c=>!c.front),target=(targets.get(rear)||0)*metresPerRadian*closed/span,a=clamp(previousWeight/Math.max(1e-12,exitWeight));
   travel+=(Math.round(target/length)*length-target)*(1-a);
  }
  let phase=((travel%length)+length)%length;if(phase<1e-8||length-phase<1e-8)phase=0;return Math.round(phase*1e9)/1e9;
 }
 function motion(time){return enabled?{loopPeriod:period,loopStart,loopDistanceM:periodDistance,loopDistanceStart:Number.isFinite(loopStart)?mooseManeuver(loopStart).distance:null,captureTime:captureClock({loopPeriod:period,loopStart},time)}:{};}
 function phase(value,span=TAU){if(!enabled)return value;let a=((value%span)+span)%span;if(a<1e-8||span-a<1e-8)a=0;return Math.round(a*1e9)/1e9;}
 function condition(time,wheelbase){const original=mooseManeuver(time,wheelbase);if(!enabled||!Number.isFinite(loopStart))return original;const displayed=mooseManeuver(captureClock({loopPeriod:period,loopStart},time),wheelbase);return {...displayed,distance:original.distance};}
 function diagnostics(){return {enabled,cyclePeriod:period,loopStart,driveVariant:profile.driveVariant||'c41',rearTurnsPerCycle:rearTurns,sourceDistancePerCycleM:periodDistance,exitCanonicalising:exit,wheelPhaseScales:corners.map((c,i)=>({corner:i,front:c.front,side:c.side,scale:scales.get(c)||1})),sourceClockModified:false,sourceDistanceModified:false};}
 configure(initialProfile);
 return {configure,beginFrame,angle,phase,condition,scale:c=>scales.get(c)||1,chainDistance,motion,
  beginCycle(time){if(!enabled)throw new Error('Capture profile is disabled');loopStart=time;return diagnostics();},
  electricInputs(angle){return enabled?{rearAxleAngle:angle,loopPeriod:period,cycleRearAngleSpan:rearTurns*TAU}:{rearAxleAngle:angle};},
  get enabled(){return enabled;},get profile(){return profile;},diagnostics};
}
