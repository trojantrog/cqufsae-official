import * as T from './vendor/three.module.min.js';
const v=()=>new T.Vector3(),q=()=>new T.Quaternion();
const X=new T.Vector3(1,0,0);
function circles(a,ra,b,rb,reference){
 const dy=b.y-a.y,dz=b.z-a.z,d=Math.hypot(dy,dz);
 const along=(ra*ra-rb*rb+d*d)/(2*d),height=Math.sqrt(Math.max(0,ra*ra-along*along));
 const cy=a.y+along*dy/d,cz=a.z+along*dz/d;
 const p1=new T.Vector3(reference.x,cy-height*dz/d,cz+height*dy/d);
 const p2=new T.Vector3(reference.x,cy+height*dz/d,cz-height*dy/d);
 return p1.distanceToSquared(reference)<p2.distanceToSquared(reference)?p1:p2;
}
// A constrained four-bar in the measured arm plane. This is a slow mechanism
// illustration, with hard points inferred from the public outer geometry.
export function solveCorner(c,travel){
 if(c.lower.hingeAxis&&c.upper.hingeAxis)return solveSpatialCorner(c,travel);
 const lower=c.lower,upper=c.upper;
 const l0=lower.outer.clone().sub(lower.inner),u0=upper.outer.clone().sub(upper.inner);
 const angle0=Math.atan2(l0.z,l0.y),radius=Math.hypot(l0.y,l0.z);
 const targetZ=T.MathUtils.clamp(l0.z+travel,-radius*.98,radius*.98);
 const targetY=Math.sign(l0.y)*Math.sqrt(Math.max(0,radius*radius-targetZ*targetZ));
 const a=Math.atan2(targetZ,targetY)-angle0;
 const low=l0.clone().applyAxisAngle(X,a).add(lower.inner);
 const upright0=upper.outer.clone().sub(lower.outer);
 const up=circles(upper.inner,Math.hypot(u0.y,u0.z),low,Math.hypot(upright0.y,upright0.z),upper.outer);
 const upperAngle=Math.atan2(up.z-upper.inner.z,up.y-upper.inner.y)-Math.atan2(u0.z,u0.y);
 const camber=Math.atan2(up.z-low.z,up.y-low.y)-Math.atan2(upright0.z,upright0.y);
 const uprightQ=q().setFromAxisAngle(X,camber);
 const centre=c.c.clone().sub(lower.outer).applyQuaternion(uprightQ).add(low);
 return {lower:low,upper:up,lowerAngle:a,upperAngle,camber,uprightQ,centre,
  armError:Math.abs(low.distanceTo(lower.inner)-lower.outer.distanceTo(lower.inner)),
  upperError:Math.abs(up.distanceTo(upper.inner)-upper.outer.distanceTo(upper.inner)),
  uprightError:Math.abs(up.distanceTo(low)-upper.outer.distanceTo(lower.outer))};
}
// Rotation about the line through the two source inboard joint centres keeps
// both frame attachments fixed. The source arms need not lie in a YZ plane.
function closestAngle(a,b,target){
 const radius=Math.hypot(a,b),ratio=radius>1e-14?target/radius:0;
 const phase=Math.atan2(b,a),offset=Math.acos(T.MathUtils.clamp(ratio,-1,1));
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),first=wrap(phase+offset),second=wrap(phase-offset);
 return {angle:Math.abs(first)<Math.abs(second)?first:second,feasible:Math.abs(ratio)<=1+1e-9};
}
function solveSpatialCorner(c,travel){
 const lower=c.lower,upper=c.upper,l=lower.outer.clone().sub(lower.inner),la=lower.hingeAxis;
 const lp=la.clone().multiplyScalar(l.dot(la)),lr=l.clone().sub(lp),lc=la.clone().cross(lr);
 const lo=closestAngle(lr.z,lc.z,l.z+travel-lp.z),lowerQ=q().setFromAxisAngle(la,lo.angle);
 const low=l.clone().applyQuaternion(lowerQ).add(lower.inner),u=upper.outer.clone().sub(upper.inner),ua=upper.hingeAxis;
 const up=ua.clone().multiplyScalar(u.dot(ua)),ur=u.clone().sub(up),uc=ua.clone().cross(ur),delta=upper.inner.clone().add(up).sub(low),upright0=upper.outer.clone().sub(lower.outer);
 const hi=closestAngle(2*delta.dot(ur),2*delta.dot(uc),upright0.lengthSq()-delta.lengthSq()-ur.lengthSq()),upperQ=q().setFromAxisAngle(ua,hi.angle);
 const high=u.clone().applyQuaternion(upperQ).add(upper.inner),uprightQ=q().setFromUnitVectors(upright0.clone().normalize(),high.clone().sub(low).normalize());
 const centre=c.c.clone().sub(lower.outer).applyQuaternion(uprightQ).add(low),camber=Math.atan2(high.z-low.z,high.y-low.y)-Math.atan2(upright0.z,upright0.y);
 return {lower:low,upper:high,lowerAngle:lo.angle,upperAngle:hi.angle,lowerQ,upperQ,camber,uprightQ,centre,feasible:lo.feasible&&hi.feasible,
  armError:Math.abs(low.distanceTo(lower.inner)-lower.outer.distanceTo(lower.inner)),upperError:Math.abs(high.distanceTo(upper.inner)-upper.outer.distanceTo(upper.inner)),uprightError:Math.abs(high.distanceTo(low)-upright0.length())};
}
export function uprightPose(mesh,c,spin=0){
 const s=c.solved,axis=c.upper.outer.clone().sub(c.lower.outer).normalize();
 const turn=q().setFromAxisAngle(axis,c.steer),rotate=q().setFromAxisAngle(new T.Vector3(0,1,0),spin);
 const total=s.uprightQ.clone().multiply(turn).multiply(rotate);
 const spunOrigin=c.c.clone().sub(c.c.clone().applyQuaternion(rotate));
 const shift=spunOrigin.sub(c.lower.outer).applyQuaternion(turn).add(c.lower.outer);
 const offset=shift.sub(c.lower.outer).applyQuaternion(s.uprightQ).add(s.lower);
 mesh.quaternion.copy(total);mesh.position.copy(offset);
}
export function solveTieRod(c,rackShift){
 if(!c.tie)return;
 const {inner,outer}=c.tie,baseLength=inner.distanceTo(outer),s=c.solved;
 const fixed=inner.clone().add(new T.Vector3(0,rackShift,0));
 const axis=c.upper.outer.clone().sub(c.lower.outer).normalize();
 function end(angle){return outer.clone().sub(c.lower.outer).applyAxisAngle(axis,angle).applyQuaternion(s.uprightQ).add(s.lower);}
 let angle=c.steer;
 for(let i=0;i<12;i++){
  const error=end(angle).distanceTo(fixed)-baseLength;
  const gradient=(end(angle+1e-4).distanceTo(fixed)-end(angle-1e-4).distanceTo(fixed))/2e-4;
  if(Math.abs(gradient)<1e-8)break;
  angle=T.MathUtils.clamp(angle-error/gradient,-.55,.55);
 }
 c.steer=angle;c.tie.currentInner=fixed;c.tie.currentOuter=end(angle);
 c.tie.error=Math.abs(fixed.distanceTo(c.tie.currentOuter)-baseLength);
}
export function tieRodPose(mesh,c){
 const {inner,outer,currentInner,currentOuter}=c.tie;
 const rotation=q().setFromUnitVectors(outer.clone().sub(inner).normalize(),currentOuter.clone().sub(currentInner).normalize());
 mesh.quaternion.copy(rotation);mesh.position.copy(currentInner).sub(inner.clone().applyQuaternion(rotation));
}
