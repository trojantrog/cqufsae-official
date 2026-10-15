import * as T from './vendor/three.module.min.js';
import {vehicleMaterial} from './presentation-materials.js?v=742';
import {buildAxialMotor} from './motor-detail.js?v=742';
import {configureNativeElectricPart} from './electric-native-details.js?v=746';
export {updateNativeElectricParts} from './electric-native-details.js?v=746';

// Presentation geometry follows the imported equipment envelopes. Housing,
// cooling and connector details illustrate construction; they are not CAD parts.
export function detailElectricPart(base){
 if(base.userData.sourceNative)return configureNativeElectricPart(base);
 const sourceGeometry=base.geometry;
 sourceGeometry.computeBoundingBox();
 const box=sourceGeometry.boundingBox,c=box.getCenter(new T.Vector3()),s=box.getSize(new T.Vector3());
 const group=base.userData.group,details=[],materials=new Map(),Z=new T.Vector3(0,0,1);
 const material=tag=>{
  if(!materials.has(tag))materials.set(tag,vehicleMaterial(tag));
  return materials.get(tag);
 };
 const at=(x=0,y=0,z=0)=>c.clone().add(new T.Vector3(x,y,z));
 function mesh(g,tag,p,parent=base){
  g.computeBoundingBox();g.computeBoundingSphere();
  const m=new T.Mesh(g,material(tag));m.position.copy(p);parent.add(m);details.push(m);return m;
 }
 function rectangle(w,d,r){
  r=Math.max(.00005,Math.min(r,w/4,d/4));
  const shape=new T.Shape(),x=-w/2,y=-d/2;
  shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);
  shape.lineTo(x+w,y+d-r);shape.quadraticCurveTo(x+w,y+d,x+w-r,y+d);
  shape.lineTo(x+r,y+d);shape.quadraticCurveTo(x,y+d,x,y+d-r);
  shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);return shape;
 }
 function extrude(shape,h,bevel=0){
  bevel=Math.min(bevel,h/4);
  const depth=h-2*bevel,g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,
   bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:5,steps:1});
  g.translate(0,0,-depth/2);return g;
 }
 function rounded(w,d,h,r=.0012,bevel=.00022){
  bevel=Math.min(bevel,h/4,r/3);
  return extrude(rectangle(w-2*bevel,d-2*bevel,Math.max(.00005,r-bevel)),h,bevel);
 }
 function rim(w,d,h,wall,r=.0015){
  const shape=rectangle(w,d,r),hole=rectangle(w-2*wall,d-2*wall,Math.max(.0003,r-wall));
  shape.holes.push(new T.Path(hole.getPoints(5)));return extrude(shape,h);
 }
 function annulus(outer,inner,h,segments=64){
  const shape=new T.Shape();shape.absarc(0,0,outer,0,Math.PI*2,false);
  const hole=new T.Path();hole.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(hole);
  const g=new T.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,curveSegments:Math.ceil(segments/2),steps:1});
  const position=g.attributes.position,normal=g.attributes.normal;
  // Smooth the two cylindrical walls analytically; keep both end faces hard.
  for(let i=0;i<position.count;i++){
   if(Math.abs(normal.getZ(i))>=.5)continue;
   const x=position.getX(i),y=position.getY(i),radius=Math.hypot(x,y);
   if(radius<1e-12)continue;
   const sign=normal.getX(i)*x+normal.getY(i)*y<0?-1:1;
   normal.setXYZ(i,sign*x/radius,sign*y/radius,0);
  }
  normal.needsUpdate=true;
  g.translate(0,0,-h/2);return g;
 }
 function orient(m,axis){m.quaternion.setFromUnitVectors(Z,axis);return m;}
 function cylinder(r,h,tag,p,axis=Z,parent=base,segments=32){
  const g=new T.CylinderGeometry(r,r,h,segments);g.rotateX(Math.PI/2);
  return orient(mesh(g,tag,p,parent),axis);
 }
 function ring(outer,inner,h,tag,p,axis=Z,parent=base){
  return orient(mesh(annulus(outer,inner,h),tag,p,parent),axis);
 }
 function screw(p,axis=Z,r=.003,parent=base){
  const washer=.00045,head=.0022;
  ring(r*1.3,r*.62,washer,'brushed-steel',p.clone().addScaledVector(axis,washer/2),axis,parent);
  const shape=new T.Shape();shape.absarc(0,0,r,0,Math.PI*2,false);
  const socket=new T.Path();
  for(let i=0;i<=6;i++){
   const a=-i*Math.PI/3,x=Math.cos(a)*r*.49,y=Math.sin(a)*r*.49;
   if(i===0)socket.moveTo(x,y);else socket.lineTo(x,y);
  }
  shape.holes.push(socket);
  const cap=orient(mesh(extrude(shape,head,.00012),'polished-steel',p.clone().addScaledVector(axis,washer+head/2),parent),axis);
  cylinder(r*.49,.00018,'soft-black',p.clone().addScaledVector(axis,washer+.00018),axis,parent,6);
  return cap;
 }
 function lidScrews(w,d,z,spacing=.15,inset=.013,r=.003){
  const nx=Math.max(1,Math.ceil((w-2*inset)/spacing)),ny=Math.max(1,Math.ceil((d-2*inset)/spacing));
  for(let i=0;i<=nx;i++)for(const sign of [-1,1])screw(at((i/nx-.5)*(w-2*inset),sign*(d/2-inset),z),Z,r);
  for(let i=1;i<ny;i++)for(const sign of [-1,1])screw(at(sign*(w/2-inset),(i/ny-.5)*(d-2*inset),z),Z,r);
 }
 function sealedSocket(p,axis,r=.010){
  // Locknut, moulded collar and recessed contact leave the mating face readable.
  cylinder(r*1.15,.003,'satin-titanium',p.clone().addScaledVector(axis,.0015),axis,base,6);
  cylinder(r,.009,'soft-black',p.clone().addScaledVector(axis,.007),axis);
  for(const distance of [.0045,.0085])ring(r*1.03,r*.90,.0007,'soft-black',p.clone().addScaledVector(axis,distance),axis);
  ring(r*.86,r*.67,.002,'dark-titanium',p.clone().addScaledVector(axis,.0125),axis);
  cylinder(r*.65,.0006,'soft-black',p.clone().addScaledVector(axis,.0117),axis);
  ring(r*.39,r*.23,.0012,'copper-satin',p.clone().addScaledVector(axis,.0123),axis);
  // A single key on the collar suggests orientation without adding cables.
  const key=mesh(rounded(r*.35,.004,.002,.00025,.00008),'soft-black',p);
  key.quaternion.setFromUnitVectors(Z,axis);key.position.copy(p).addScaledVector(axis,.009).add(new T.Vector3(r*.86,0,0));
 }
 function signalSocket(p,axis,w=.032,h=.017,columns=4){
  const depth=.014,q=new T.Quaternion().setFromUnitVectors(Z,axis);
  const place=(g,tag,x,y,z)=>{
   const m=mesh(g,tag,new T.Vector3(x,y,z).applyQuaternion(q).add(p));m.quaternion.copy(q);return m;
  };
  place(rounded(w+.004,h+.004,.002,.001),'dark-titanium',0,0,.001);
  place(rim(w,h,depth,.002,.0012),'soft-black',0,0,depth/2+.002);
  place(rounded(w-.004,h-.004,.001,.0008),'soft-black',0,0,.007);
  for(let row=0;row<2;row++)for(let col=0;col<columns;col++){
   const pin=cylinder(.0007,.0028,'brushed-steel',new T.Vector3((col-(columns-1)/2)*(w-.009)/columns,(row-.5)*(h-.006)/2,.0085).applyQuaternion(q).add(p),axis,base,12);
   pin.name='signal-contact';
  }
  place(rounded(w*.43,.003,.0015,.0003,.0001),'soft-black',0,h/2+.0008,.0065);
 }
 function enclosure(w,d,bodyTop,tag,lidTag,wall=.002){
  const bottom=-s.z/2+.002,bodyHeight=bodyTop-bottom;
  base.geometry=rim(w,d,bodyHeight,wall,.0015);base.geometry.translate(c.x,c.y,c.z+bottom+bodyHeight/2);
  base.material.dispose();base.material=vehicleMaterial(tag);
  mesh(rounded(w-2*wall-.0002,d-2*wall-.0002,.0018,.0005),tag==='soft-black'?'soft-black':'satin-titanium',at(0,0,bottom+.0009));
  mesh(rim(w-.0006,d-.0006,.0006,.004,.0012),'soft-black',at(0,0,bodyTop+.0004));
  mesh(rounded(w-.0004,d-.0004,.0024,.0012),lidTag,at(0,0,bodyTop+.00195));
  return {bottom,lidTop:bodyTop+.00315};
 }
 function mountingFlanges(w,d,bottom){
  const flangeWidth=(s.x-w)/2+.004;
  for(const sign of [-1,1]){
   const shape=rectangle(flangeWidth,d*.80,.001);
   for(const y of [-1,1]){
    const hole=new T.Path();hole.absarc(0,y*d*.29,.0028,0,Math.PI*2,true);shape.holes.push(hole);
   }
   mesh(extrude(shape,.0018),'satin-titanium',at(sign*(w/2+flangeWidth/2-.004),0,bottom-.00095));
  }
 }

 sourceGeometry.dispose();
 if(group==='transmission'){
  const motor=buildAxialMotor(base,{center:c,size:s,material});details.push(...motor.details);
 }else if(group==='battery'){
  const w=s.x-.022,d=s.y-.032,{bottom,lidTop}=enclosure(w,d,s.z/2-.0062,'satin-titanium','satin-titanium',.0022);
  lidScrews(w,d,lidTop,.15,.012,.003);
  mountingFlanges(w,d,bottom);
  const Y=new T.Vector3(0,1,0),portZ=s.z*.23;
  for(const x of [-.037,.037])sealedSocket(at(x,d/2,portZ),Y,.010);
  signalSocket(at(w*.29,d/2,portZ),Y,.027,.016,3);
 }else if(group==='ecu'){
  const w=s.x-.022,d=s.y-.050,finHeight=.008,bodyTop=s.z/2-.013;
  const {bottom,lidTop}=enclosure(w,d,bodyTop,'satin-titanium','satin-titanium',.0025);
  lidScrews(w,d,lidTop,.16,.011,.0028);mountingFlanges(w,d,bottom);
  const finWidth=.0015,finLength=d*.75,usable=w-.052,count=22;
  mesh(rounded(usable+.006,finLength+.006,.0018,.0007),'satin-titanium',at(0,0,lidTop+.0009));
  for(let i=0;i<count;i++)mesh(rounded(finWidth,finLength,finHeight,.0003,.00012),'bright-alloy',at((i/(count-1)-.5)*usable,0,lidTop+.0018+finHeight/2));
  const Y=new T.Vector3(0,1,0);
  for(let i=0;i<5;i++)sealedSocket(at((i-2)*w*.17,d/2,-s.z*.05),Y,.0095);
  signalSocket(at(w*.19,-d/2,-s.z*.07),Y.clone().negate(),.041,.019,5);
 }else{
  const lowVoltage=s.x<.16,w=s.x-.014,d=s.y-.032;
  const {bottom,lidTop}=enclosure(w,d,s.z/2-.0062,lowVoltage?'soft-black':'dark-titanium',lowVoltage?'soft-black':'satin-titanium',.002);
  lidScrews(w,d,lidTop,.13,.009,lowVoltage?.0025:.0028);mountingFlanges(w,d,bottom);
  const Y=new T.Vector3(0,1,0);
  if(lowVoltage){
   signalSocket(at(0,d/2,-s.z*.02),Y,.037,.024,4);
   signalSocket(at(0,-d/2,-s.z*.08),Y.clone().negate(),.030,.020,3);
  }else{
   for(const x of [-w*.25,w*.25])sealedSocket(at(x,d/2,-s.z*.04),Y,.011);
   signalSocket(at(0,-d/2,-s.z*.06),Y.clone().negate(),.031,.018,4);
  }
 }
 base.geometry.computeBoundingBox();base.geometry.computeBoundingSphere();
 base.userData.framingPoints=null;base.userData.baseColor=base.material.color.clone();base.userData.detailMeshes=details;
 return base;
}
