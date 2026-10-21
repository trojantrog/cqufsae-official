import * as T from './vendor/three.module.min.js';

const V=a=>new T.Vector3(...a),Q=()=>new T.Quaternion();
export const columnMembers=new Set(['lower','middle','upper','lower-cross','upper-cross']);
const unit=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite)&&V(a).lengthSq()>1e-16?V(a).normalize():null;
const point=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite)?V(a):null;

// Native shaft bores, cross trunnions and their installed phase define both
// Cardan joints. The output angle is solved from perpendicular trunnion axes.
export function readColumnMotion(spec){
 if(!spec)return null;
 const lower=point(spec.lowerPivot),upper=point(spec.upperPivot),input=unit(spec.inputAxis),middle=unit(spec.middleAxis),output=unit(spec.upperAxis),pin=unit(spec.inputPin),middlePin=unit(spec.middlePin),upperPin=unit(spec.upperPin);
 if(!lower||!upper||!input||!middle||!output||!pin||!middlePin||!upperPin||!Number.isFinite(spec.pitchRadiusMeters)||spec.pitchRadiusMeters<=0)return null;
 if(Math.max(Math.abs(input.dot(pin)),Math.abs(middle.dot(middlePin)),Math.abs(output.dot(upperPin)),Math.abs(pin.dot(middlePin)),Math.abs(middlePin.dot(upperPin)))>1e-7)return null;
 return {...spec,lower,upper,input,middle,output,pin,middlePin,upperPin,key:spec.id||JSON.stringify(spec)};
}

function rotary(axis,angle,pivot){
 const q=Q().setFromAxisAngle(axis,angle),p=pivot.clone().sub(pivot.clone().applyQuaternion(q));
 return new T.Matrix4().compose(p,q,new T.Vector3(1,1,1));
}

function outputAngle(angle,inputAxis,outputAxis,inputPin,outputPin){
 const moved=inputPin.clone().applyAxisAngle(inputAxis,angle),side=outputAxis.clone().cross(outputPin),sign=Math.sign(inputPin.dot(side))||1;
 const phase=Math.atan2(-sign*moved.dot(outputPin),sign*moved.dot(side));
 // Retain turn count at atan2's branch cut, including reversals and seeking.
 return phase+2*Math.PI*Math.round((angle-phase)/(2*Math.PI));
}

function crossPose(pivot,a,b,aa,bb){
 const rest=new T.Matrix4().makeBasis(a,b,a.clone().cross(b));
 const current=new T.Matrix4().makeBasis(aa,bb,aa.clone().cross(bb));
 const rotation=current.multiply(rest.transpose());
 const q=Q().setFromRotationMatrix(rotation).normalize(),p=pivot.clone().sub(pivot.clone().applyQuaternion(q));
 return new T.Matrix4().compose(p,q,new T.Vector3(1,1,1));
}

export function solveColumnMotion(chain,rack){
 const lowerAngle=rack/chain.pitchRadiusMeters;
 const middleAngle=outputAngle(lowerAngle,chain.input,chain.middle,chain.pin,chain.middlePin);
 const upperAngle=outputAngle(middleAngle,chain.middle,chain.output,chain.middlePin,chain.upperPin);
 const lowerPin=chain.pin.clone().applyAxisAngle(chain.input,lowerAngle),middlePin=chain.middlePin.clone().applyAxisAngle(chain.middle,middleAngle),upperPin=chain.upperPin.clone().applyAxisAngle(chain.output,upperAngle);
 const poses={lower:rotary(chain.input,lowerAngle,chain.lower),middle:rotary(chain.middle,middleAngle,chain.lower),upper:rotary(chain.output,upperAngle,chain.upper),
  'lower-cross':crossPose(chain.lower,chain.pin,chain.middlePin,lowerPin,middlePin),
  'upper-cross':crossPose(chain.upper,chain.middlePin,chain.upperPin,middlePin,upperPin)};
 return {poses,lowerAngle,middleAngle,upperAngle,maximumTrunnionDot:Math.max(Math.abs(lowerPin.dot(middlePin)),Math.abs(middlePin.dot(upperPin)))};
}
