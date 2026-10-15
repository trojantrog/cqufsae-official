import * as T from './vendor/three.module.min.js';
import {explosionPosition,explosionOrientation} from './explosion-layout.js?v=747';
import {brakeCadRoutes} from './brake-hose-extraction.js?v=742';
import {createFramingTrack} from './camera-framing.js?v=742';
const whole={department:'all',mode:'all',variant:'c41',weight:1};
const geometryBoxes=new WeakMap();
function boxFor(g){let cached=geometryBoxes.get(g);const attribute=g.attributes.position,version=attribute.version;if(!cached||cached.attribute!==attribute||cached.version!==version){if(!g.boundingBox||cached||version>0)g.computeBoundingBox();const a=g.boundingBox;cached={attribute,version,box:[(a.min.x+a.max.x)/2,(a.min.y+a.max.y)/2,(a.min.z+a.max.z)/2,(a.max.x-a.min.x)/2,(a.max.y-a.min.y)/2,(a.max.z-a.min.z)/2]};geometryBoxes.set(g,cached);}return cached.box;}
function sphereBox(p,r){return [p.x,p.y,p.z,r,r,r];}
// Solve the physical pose once, then use rigid transforms and support planes.
// Source bounds remain geometry-backed; phase-dependent chain and wheel poses
// are rebuilt for this call. No camera result or operating phase is cached.
export function createExplosionCameraTrack({rig,camera,direction,time,restore}){
 const frames=[],diagnostics={samples:17,initial:0,sampling:0,restore:0},start=performance.now();
 try{
  rig.apply(time,[whole],0,{poseMotionWeight:0,poseTime:time,transitionStage:'overview',variant:'c41'});
  const motion=rig.getMotion(),native=rig.meshes.filter(m=>m.userData.variant!=='e74'),byId=new Map(native.map(m=>[m.userData.id,m])),bases=native.map(mesh=>({mesh,position:mesh.position.clone(),rotation:mesh.quaternion.clone(),scale:mesh.scale.clone(),box:boxFor(mesh.geometry),pivot:new T.Vector3(...(mesh.userData.presentationPivot||mesh.userData.center))}));
  const dir=direction.clone().normalize();if(dir.lengthSq()<1e-10)dir.set(0,1,0);const right=camera.up.clone().cross(dir);if(right.lengthSq()<1e-10)right.set(1,0,0);right.normalize();const up=dir.clone().cross(right).normalize(),tangent=Math.tan(camera.fov*Math.PI/360),tx=tangent*camera.aspect*.89,ty=tangent*.80;
  // Each transformed box has an exact support value along a frustum plane;
  // this is equivalent to visiting all eight corners without allocating them.
  const planes=[right.clone().addScaledVector(dir,tx),right.clone().addScaledVector(dir,-tx).negate(),up.clone().addScaledVector(dir,ty),up.clone().addScaledVector(dir,-ty).negate(),dir,dir.clone().negate()],support=new Float64Array(6),scratch=new T.Matrix4();
  function includeBox(b,m){const e=m.elements,cx=e[0]*b[0]+e[4]*b[1]+e[8]*b[2]+e[12],cy=e[1]*b[0]+e[5]*b[1]+e[9]*b[2]+e[13],cz=e[2]*b[0]+e[6]*b[1]+e[10]*b[2]+e[14];for(let i=0;i<6;i++){const n=planes[i],radius=Math.abs(n.x*e[0]+n.y*e[1]+n.z*e[2])*b[3]+Math.abs(n.x*e[4]+n.y*e[5]+n.z*e[6])*b[4]+Math.abs(n.x*e[8]+n.y*e[9]+n.z*e[10])*b[5];support[i]=Math.max(support[i],n.x*cx+n.y*cy+n.z*cz+radius);}}
  const fixed=[],followers=[],hydraulic=rig.chassis.hydraulics;

  const bottleSource=byId.get(rig.completion.diagnostics().bottleAttachedTo);
  for(const mesh of rig.completion.items){if(!mesh.visible)continue;const source=bottleSource;if(source&&rig.completion.bottle.getObjectById(mesh.id))followers.push({box:boxFor(mesh.geometry),source,local:source.matrixWorld.clone().invert().multiply(mesh.matrixWorld)});else fixed.push({box:boxFor(mesh.geometry),matrix:mesh.matrixWorld.clone()});}
  // The dashboard and its original mounting panel stay on the welded-frame
  // datum. Their installed bounds remain part of every overview camera frame.
  for(const mesh of rig.instruments?.items||[])if(mesh.userData.variant==='c41'&&mesh.visible)fixed.push({box:boxFor(mesh.geometry),matrix:mesh.matrixWorld.clone()});
  // Fixed pipes, bounded withdrawing hoses and source-attached unions avoid
  // running the hydraulic solver just to prepare a camera path.
  hydraulic?.root.traverse(m=>{if(!m.isMesh||!m.visible||m.material.opacity<=.002)return;const role=m.name||'',source=byId.get(m.userData.hydraulicReferenceIds?.[0]);
   if(source&&(role.endsWith('-caliper-inlet-union')||role.endsWith('-exposed-union-spigot'))){followers.push({box:boxFor(m.geometry),source,local:source.matrixWorld.clone().invert().multiply(m.matrixWorld)});return;}
   const withdrawing=m.userData.hydraulicSourceFile&&(role.includes('-master-cad-hose')||role.includes('-left-flexible-brake-hose'));
   if(withdrawing){const record=brakeCadRoutes.find(r=>r.file===m.userData.hydraulicSourceFile);if(!record)throw new Error('Missing measured hydraulic route');const operation=role.includes('-master-cad-hose')?new T.Matrix4():source.matrix.clone(),b=hoseWithdrawalEnvelope({record,operation,reverse:role.includes('-master-cad-hose')});fixed.push({box:[(b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,(b.min.z+b.max.z)/2,(b.max.x-b.min.x)/2,(b.max.y-b.min.y)/2,(b.max.z-b.min.z)/2],matrix:m.matrixWorld.clone()});return;}

   const b=boxFor(m.geometry),matrix=m.matrixWorld.clone();if(role.endsWith('-hose-crimp-sleeve')||role.endsWith('-hose-swivel-nut')){const center=new T.Vector3(b[0],b[1],b[2]).applyMatrix4(matrix);fixed.push({box:sphereBox(center,.04),matrix:new T.Matrix4()});}else fixed.push({box:b,matrix});
  });
  support.fill(-Infinity);const moving=[];
  for(const b of bases){const d=b.mesh.userData,plain=(!d.presentationPath||d.presentationPath.every(p=>p.every(v=>Math.abs(v)<1e-12)))&&(!d.presentationRotations||d.presentationRotations.every(q=>Math.abs(q[0])+Math.abs(q[1])+Math.abs(q[2])<1e-12));const stationary=plain&&!rig.chainExtraction.has(b.mesh)&&[0,.5,1].every(p=>explosionPosition(d,p).lengthSq()<1e-20);
   if(stationary)includeBox(b.box,b.mesh.matrixWorld);else moving.push(b);}
  // Only paths with no translation or orientation change share fixed support.
  const fixedSupport=support.slice();diagnostics.movingNative=moving.length;diagnostics.cockpitMeshes=rig.cockpit.items.length;diagnostics.firewallMeshes=rig.firewall?.items.length||0;
  diagnostics.initial=performance.now()-start;const samplingStart=performance.now();
  for(let i=0;i<=16;i++){const p=i/16;support.set(fixedSupport);
   for(const b of moving){const m=b.mesh,d=m.userData;m.scale.copy(b.scale);if(!rig.chainExtraction.has(m)){m.position.copy(b.position);m.quaternion.copy(b.rotation);const q=explosionOrientation(d,p);if(q){m.position.applyQuaternion(q).add(b.pivot).sub(b.pivot.clone().applyQuaternion(q));m.quaternion.premultiply(q);}m.position.add(explosionPosition(d,p));}else rig.chainExtraction.apply(m,-motion.axleAngle*.0905,p);m.updateMatrix();m.matrixWorld.multiplyMatrices(m.parent.matrixWorld,m.matrix);includeBox(b.box,m.matrixWorld);}
   rig.cockpit.update(motion,[whole],p);for(const m of rig.cockpit.items)includeBox(boxFor(m.geometry),m.matrixWorld);
   rig.firewall?.update(motion,[whole],p);rig.firewall?.root.updateMatrixWorld(true);for(const m of rig.firewall?.items||[])if(m.visible&&m.material.opacity>.002)includeBox(boxFor(m.geometry),m.matrixWorld);
   for(const f of followers)includeBox(f.box,scratch.multiplyMatrices(f.source.matrixWorld,f.local));for(const f of fixed)includeBox(f.box,f.matrix);
   for(const point of rig.aeroExplosion?.framingPoints({progress:p,matrix:rig.assembly.matrixWorld})||[])for(let j=0;j<6;j++)support[j]=Math.max(support[j],planes[j].dot(point));
   const ax=support[0],bx=-support[1],ay=support[2],by=-support[3],zmax=support[4],zmin=-support[5],depth=(zmin+zmax)/2,distance=Math.max((ax-bx)/(2*tx),(ay-by)/(2*ty),zmax+Math.max(.04,camera.near*2)),target=right.clone().multiplyScalar((ax+bx)/2).addScaledVector(up,(ay+by)/2).addScaledVector(dir,depth),position=target.clone().addScaledVector(dir,(distance-depth)*1.025);frames.push({position,target,zoom:1});
  }
  diagnostics.sampling=performance.now()-samplingStart;
 }finally{const r=performance.now();restore();diagnostics.restore=performance.now()-r;}
 const track=createFramingTrack(frames);track.diagnostics=diagnostics;return track;
}

const V = (...p) => new T.Vector3(...p);

// Exact resampling used by brake-hydraulics.js. No length solve or tube rebuild.
const resampledRoutes=new WeakMap();
function resample(record, reverse) {
 const prior=resampledRoutes.get(record)?.[reverse?1:0];if(prior)return prior;
 const raw = record.points.map(p => V(...p));
 if (reverse) raw.reverse();
 const arc = [0];
 for (let i = 1; i < raw.length; i++) arc.push(arc.at(-1) + raw[i].distanceTo(raw[i - 1]));
 const steps = Math.max(96, Math.min(512, Math.ceil(arc.at(-1) / .003))), points = [];
 let j = 0;
 for (let i = 0; i <= steps; i++) {
  const distance = arc.at(-1) * i / steps;
  while (j < raw.length - 2 && arc[j + 1] < distance) j++;
  points.push(raw[j].clone().lerp(raw[j + 1], (distance - arc[j]) / Math.max(1e-20, arc[j + 1] - arc[j])));
 }
 const cached=resampledRoutes.get(record)||[];cached[reverse?1:0]=points;resampledRoutes.set(record,cached);return points;
}

/**
 * Bounds every rendered vertex of one withdrawing production hose over p=[0,.02].
 * The same bounds apply thereafter because withdrawal is clamped at 14 mm.
 * operation is the frozen upright rigid transform; use identity for the master.
 * reverse=true selects the master MtoS route and its original normalStart.
 * Only the hose is bounded: native-side unions and sleeve/nut need separate bounds.
 * The guarantee uses the implementation ranges, not successful length conservation:
 * amplitude in [-3,4], tension in [.1,1], withdrawal in [0,.014].
 */
function hoseWithdrawalEnvelope({record, operation = new T.Matrix4(), reverse = false}) {
 const base = resample(record, reverse), steps = base.length - 1;
 let targetLength = 0;
 for (let i = 1; i < base.length; i++) targetLength += base[i].distanceTo(base[i - 1]);
 const first = Math.max(2, Math.ceil(.018 / targetLength * steps));
 const last = steps - Math.max(2, Math.ceil(.008 / targetLength * steps));
 const span = last - first;
 if (!(span > 0)) throw new RangeError('Route is too short for the production rigid-end layout.');
 const end = base.at(-1), rotation = new T.Quaternion().setFromRotationMatrix(operation);
 const newEnd = end.clone().applyMatrix4(operation);
 const direction = V(...(reverse ? record.normalStart : record.normalEnd)).normalize().transformDirection(operation);
 const tangentA = base[first + 1].clone().sub(base[first - 1]).multiplyScalar(span * .5);
 const tangentB = base[last + 1].clone().sub(base[last - 1]).multiplyScalar(span * .5);
 const tail = base[last].clone().sub(end).applyQuaternion(rotation).add(newEnd);
 const tailTangent = tangentB.clone().applyQuaternion(rotation);
 const bounds = new T.Box3();
 for (let i = 0; i <= steps; i++) {
  if (i <= first) {
   bounds.expandByPoint(base[i]);
  } else if (i >= last) {
   const p = base[i].clone().sub(end).applyQuaternion(rotation).add(newEnd);
   bounds.expandByPoint(p);
   bounds.expandByPoint(p.clone().addScaledVector(direction, -.014));
  } else {
   const t = (i - first) / span, t2 = t * t, t3 = t2 * t;
   const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
   const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
   const reference = base[first].clone().multiplyScalar(h00).addScaledVector(tangentA, h10)
    .addScaledVector(base[last], h01).addScaledVector(tangentB, h11);
   const bend = base[i].clone().sub(reference);
   const constant = base[first].clone().multiplyScalar(h00).addScaledVector(tail, h01);
   const tension = tangentA.clone().multiplyScalar(h10).addScaledVector(tailTangent, h11);
   const withdrawal = direction.clone().multiplyScalar(-h01 * .014);
   const low = constant.clone(), high = constant.clone();
   for (const axis of ['x', 'y', 'z']) {
    low[axis] += Math.min(.1 * tension[axis], tension[axis])
     + Math.min(-3 * bend[axis], 4 * bend[axis]) + Math.min(0, withdrawal[axis]);
    high[axis] += Math.max(.1 * tension[axis], tension[axis])
     + Math.max(-3 * bend[axis], 4 * bend[axis]) + Math.max(0, withdrawal[axis]);
   }
   bounds.expandByPoint(low); bounds.expandByPoint(high);
  }
 }
 // Each production tube vertex is a centre point plus a unit normal * radius.
 // Account also for Float32 storage and the tiny floating-point normal drift.
 const coordinateScale = Math.max(1, ...bounds.min.toArray().map(Math.abs), ...bounds.max.toArray().map(Math.abs));
 return bounds.expandByScalar(record.radiusM + coordinateScale * 2 ** -22);
}
