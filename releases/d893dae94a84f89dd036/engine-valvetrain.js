import * as T from './vendor/three.module.min.js';

// Geometric mechanism illustration, not an OEM cam profile or valve timing.
// A convex support curve gives a flat tappet continuous contact at every angle.
const TAU=Math.PI*2,BASE=.018,LIFT=.006,HALF_WINDOW=Math.PI*5/12,K=1.2,EXP=2.5;
export function camSupport(phi){
 const a=Math.atan2(Math.sin(phi),Math.cos(phi));
 if(Math.abs(a)>=HALF_WINDOW)return {h:BASE,d:0,dd:0};
 const c=Math.cos(K*a),s=Math.sin(K*a);
 return {h:BASE+LIFT*c**EXP,d:-LIFT*EXP*K*c**(EXP-1)*s,
  dd:LIFT*EXP*K*K*((EXP-1)*c**(EXP-2)*s*s-c**EXP)};
}

// Rebuild only the preallocated vertex buffers: the spring wire stays circular
// and keeps its diameter while the closed end turns approach their seats.
export function createCompressionSpring({own,mesh,material,parent,radius=.0062,wire=.00065,turns=8,height=.02345,segments=216,sides=8}){
 const geometry=new T.BufferGeometry(),position=new Float32Array((segments+1)*(sides+1)*3),normal=new Float32Array(position.length),indices=[];
 for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){
  const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1);
 }
 geometry.setAttribute('position',new T.BufferAttribute(position,3).setUsage(T.DynamicDrawUsage));
 geometry.setAttribute('normal',new T.BufferAttribute(normal,3).setUsage(T.DynamicDrawUsage));geometry.setIndex(indices);
 const object=mesh(geometry,material,parent);object.name='valve-spring';
 object.userData.spring={radius,wire,turns,segments,sides,height};
 let previous=NaN;
 function update(nextHeight){
  if(nextHeight===previous)return;previous=nextHeight;object.userData.spring.height=nextHeight;
  const pitchBase=wire*2*turns,omega=TAU*turns;
  for(let i=0;i<=segments;i++){
   const t=i/segments,a=omega*t,c=Math.cos(a),s=Math.sin(a),z=pitchBase*t+(nextHeight-pitchBase)*(t-Math.sin(TAU*t)/TAU);
   const dz=pitchBase+(nextHeight-pitchBase)*(1-Math.cos(TAU*t)),length=Math.hypot(radius*omega,dz);
   // Binormal = unit tangent cross outward radial normal.
   const bx=-dz*s/length,by=dz*c/length,bz=-radius*omega/length;
   for(let j=0;j<=sides;j++){
    const b=TAU*j/sides,cb=Math.cos(b),sb=Math.sin(b),nx=cb*c+sb*bx,ny=cb*s+sb*by,nz=sb*bz,o=(i*(sides+1)+j)*3;
    position[o]=radius*c+wire*nx;position[o+1]=radius*s+wire*ny;position[o+2]=z+wire*nz;
    normal[o]=nx;normal[o+1]=ny;normal[o+2]=nz;
   }
  }
  geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();
 }
 update(height);return {object,update};
}

export function createValveTrain({root,own,mesh,cyl,annular,bright,steel,alloy,bronze}){
 const cams=[],valves=[],diagnostics=[],camZ=.258;
 const shape=new T.Shape(),samples=720;
 for(let i=0;i<samples;i++){
  const phi=TAU*i/samples,{h,d}=camSupport(phi),x=h*Math.cos(phi)-d*Math.sin(phi),z=h*Math.sin(phi)+d*Math.cos(phi);
  if(i===0)shape.moveTo(x,z);else shape.lineTo(x,z);
 }
 shape.closePath();
 const lobeGeometry=own(new T.ExtrudeGeometry(shape,{depth:.010,bevelEnabled:false,steps:1,curveSegments:1}));lobeGeometry.translate(0,0,-.005);
 // Smooth only the swept side, leaving the two machined end faces hard.
 const lp=lobeGeometry.attributes.position,ln=lobeGeometry.attributes.normal,radial=new Map();
 for(let i=0;i<samples;i++){const phi=TAU*i/samples,{h,d}=camSupport(phi),x=h*Math.cos(phi)-d*Math.sin(phi),y=h*Math.sin(phi)+d*Math.cos(phi);radial.set(Math.round(x*1e8)+','+Math.round(y*1e8),[Math.cos(phi),Math.sin(phi)]);}
 for(let i=0;i<lp.count;i++)if(Math.abs(ln.getZ(i))<.1){const n=radial.get(Math.round(lp.getX(i)*1e8)+','+Math.round(lp.getY(i)*1e8));if(n)ln.setXYZ(i,n[0],n[1],0);}
 for(const side of [-1,1]){
  const cam=new T.Group();cam.name=side<0?'intake-camshaft':'exhaust-camshaft';cam.position.set(side*.026,0,camZ);root.add(cam);
  const phase=side<0?Math.PI/4-.22:Math.PI*3/4+.22;cams.push({cam,side,phase});cyl(.006,.107,bright,cam);
  for(const y of [-.018,.018]){
   const lobe=mesh(lobeGeometry,bronze,cam);lobe.name=side<0?'intake-cam-lobe':'exhaust-cam-lobe';lobe.rotation.x=Math.PI/2;lobe.position.y=y;
   // Extrusion +90deg about X maps profile (x,z) into (x,0,z).
   const u=new T.Vector3(side*Math.sin(.22),0,Math.cos(.22)),center=new T.Vector3(side*.026,y,camZ);
   const mount=new T.Group();mount.name='valve-guide-mount';mount.position.copy(center).addScaledVector(u,-(BASE+.044));mount.rotation.y=side*.22;root.add(mount);
   const valve=new T.Group();valve.name=side<0?'intake-valve':'exhaust-valve';mount.add(valve);
   cyl(.003,.045,bright,valve,[0,0,.019],'z',24);cyl(.012,.003,steel,valve,[0,0,-.003],'z');
   const bucket=cyl(.010,.006,alloy,valve,[0,0,.041],'z');bucket.name='flat-bucket-follower';bucket.userData.contactFace=.003;
   const retainer=annular(.0085,.0031,.002,steel,valve,[0,0,.0365],'z');retainer.name='moving-spring-retainer';
   annular(.0045,.0032,.018,bronze,mount,[0,0,.0195],'z').name='valve-guide';
   const seat=annular(.0085,.0046,.0015,steel,mount,[0,0,.010],'z');seat.name='fixed-spring-seat';
   const spring=createCompressionSpring({own,mesh,material:bright,parent:mount});spring.object.position.z=.0114;
   const d={side,y,lift:0,camAngle:0,axis:u.clone(),camCenter:center.clone(),bucketCenter:new T.Vector3(),contactPoint:new T.Vector3(),normal:u.clone().negate(),baseRadius:BASE,bucketRadius:.010,lobeWidth:.010,springWire:.00065};
   diagnostics.push(d);valves.push({valve,spring,side,cam,phase,lobe,mount,bucket,diagnostic:d});
  }
 }
 function update(angle){
  for(const {cam,phase}of cams)cam.rotation.y=angle*.5+phase;
  for(const entry of valves){
   const {valve,spring,cam,diagnostic:d}=entry,phi=Math.atan2(-d.axis.z,-d.axis.x)+cam.rotation.y,{h,d:dh}=camSupport(phi),lift=h-BASE;
   valve.position.z=-lift;spring.update(.02345-lift);d.lift=lift;d.camAngle=cam.rotation.y;
   d.bucketCenter.copy(d.camCenter).addScaledVector(d.axis,-h);
   const px=h*Math.cos(phi)-dh*Math.sin(phi),pz=h*Math.sin(phi)+dh*Math.cos(phi),c=Math.cos(cam.rotation.y),s=Math.sin(cam.rotation.y);
   d.contactPoint.set(d.camCenter.x+px*c+pz*s,d.y,d.camCenter.z-px*s+pz*c);
  }
 }
 return {cams,valves,diagnostics,camZ,update};
}
