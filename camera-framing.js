import * as THREE from './vendor/three.module.min.js';
const v=()=>new THREE.Vector3();
export function sampleGeometry(geometry,count=64){
 const a=geometry.attributes.position,points=[];const stride=Math.max(1,Math.floor(a.count/count));
 for(let i=0;i<a.count;i+=stride)points.push(v().fromBufferAttribute(a,i));
 return points;
}
export function visiblePoints(meshes,predicate=()=>true){
 const out=[];
 for(const m of meshes){if(!predicate(m))continue;m.updateWorldMatrix(true,false);const samples=m.userData.framingPoints||sampleGeometry(m.geometry);for(const p of samples)out.push(p.clone().applyMatrix4(m.matrixWorld));}
 return out;
}
// Solve the four perspective support planes together. A world-axis box centre
// leaves substantial empty screen space when the view is oblique.
export function fitPoints(points,camera,direction,padding={x:.92,y:.81}){
 if(!points.length)return {position:camera.position.clone(),target:v(),zoom:1};
 const dir=direction.clone().normalize();if(dir.lengthSq()<1e-10)dir.set(0,1,0);
 const right=camera.up.clone().cross(dir);if(right.lengthSq()<1e-10)right.set(1,0,0);right.normalize();
 const up=dir.clone().cross(right).normalize(),tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tx=tangent*camera.aspect*padding.x,ty=tangent*padding.y;
 let ax=-Infinity,bx=Infinity,ay=-Infinity,by=Infinity,zmin=Infinity,zmax=-Infinity;
 for(const p of points){const x=p.dot(right),y=p.dot(up),z=p.dot(dir);ax=Math.max(ax,x+tx*z);bx=Math.min(bx,x-tx*z);ay=Math.max(ay,y+ty*z);by=Math.min(by,y-ty*z);zmin=Math.min(zmin,z);zmax=Math.max(zmax,z);}
 const depth=(zmin+zmax)/2,distance=Math.max((ax-bx)/(2*tx),(ay-by)/(2*ty),zmax+Math.max(.04,camera.near*2));
 const target=right.multiplyScalar((ax+bx)/2).addScaledVector(up,(ay+by)/2).addScaledVector(dir,depth);
 return {position:target.clone().addScaledVector(dir,distance-depth),target,zoom:1};
}

// A continuous camera route follows the actual extraction poses. It does not
// impose an additional time easing on the part trajectories.
export function createFramingTrack(frames){
 const targets=frames.map(f=>f.target.clone()),positions=frames.map(f=>f.position.clone());
 const targetCurve=new THREE.CatmullRomCurve3(targets,false,'catmullrom',.35),positionCurve=new THREE.CatmullRomCurve3(positions,false,'catmullrom',.35);
 return progress=>{const t=THREE.MathUtils.clamp(progress,0,1);return {position:positionCurve.getPoint(t),target:targetCurve.getPoint(t),zoom:1};};
}
