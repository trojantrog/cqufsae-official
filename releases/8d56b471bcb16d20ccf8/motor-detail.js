import * as T from './vendor/three.module.min.js';

// Axial-flux construction study. The source contributes placement and envelope;
// winding turns, tooth profiles and small fasteners are illustrative, not OEM CAD.
// The two discs and outer drum share one rotor; the wound stator stays fixed.
export function buildAxialMotor(base,{center:proxyCenter,size:s,material}){
 const V=(...a)=>new T.Vector3(...a),Y=V(0,1,0),Z=V(0,0,1),details=[],batches=new Map();
 // The public equipment proxy also contained a sprocket guard. Its centre and
 // axial extent cannot locate this motor. These are the independently fitted
 // motor surface frame, expressed through the original public export transform.
 // Mapping and source hashes: research/motor-source-map-737.json.
 const c=V(-.8031376251,.0000198678,.1938515190),axis=V(.0000127883,.99999998449,-.0001756549).normalize(),orientation=new T.Quaternion().setFromUnitVectors(Y,axis);
 const radius=.1129,bodyLength=.086,half=bodyLength/2,shaftMin=-.04358816-c.y,shaftMax=.05842084-c.y;
 const mount=new T.Group();mount.name='native-motor-installation-frame';mount.position.copy(c);mount.quaternion.copy(orientation);base.add(mount);
 const rotor=new T.Group();rotor.name='axial-flux-dual-rotor';mount.add(rotor);base.userData.presentationRotor=rotor;
 const stator=new T.Group();stator.name='axial-flux-wound-stator';mount.add(stator);
 base.userData.presentationCenter=c.toArray();base.userData.motorAxis=axis.toArray();
 base.userData.motorOutputPoint=V(0,shaftMax,0).applyQuaternion(orientation).add(c).toArray();
 function add(g,tag,parent=stator,opacity=1,label=tag){
  const key=[parent.id,tag,opacity,label].join('/');let b=batches.get(key);if(!b){b={parts:[],tag,parent,opacity,label};batches.set(key,b);}b.parts.push(g);return g;
 }
 function transform(g,p=V(),q=null){if(q)g.applyQuaternion(q);g.translate(...p.toArray());return g;}
 function box(w,h,d,p,tag,parent=stator,q=null,label=tag){return add(transform(new T.BoxGeometry(w,h,d),p,q),tag,parent,1,label);}
 function cylinder(r,h,p,tag,parent=stator,segments=48){return add(transform(new T.CylinderGeometry(r,r,h,segments),p),tag,parent);}
 function sector(ro,ri,h,start=0,span=Math.PI*2){
  const shape=new T.Shape(),end=start+span;shape.absarc(0,0,ro,start,end,false);
  if(span>=Math.PI*2-1e-6){const hole=new T.Path();hole.absarc(0,0,ri,0,Math.PI*2,true);shape.holes.push(hole);}
  else{shape.lineTo(ri*Math.cos(end),ri*Math.sin(end));shape.absarc(0,0,ri,end,start,true);shape.closePath();}
  const g=new T.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,steps:1,curveSegments:Math.max(3,Math.ceil(40*span/(Math.PI*2)))}),p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<p.count;i++){if(Math.abs(n.getZ(i))>.5)continue;const r=Math.hypot(p.getX(i),p.getY(i)),dot=(n.getX(i)*p.getX(i)+n.getY(i)*p.getY(i))/r;if(Math.abs(dot)>.75)n.setXYZ(i,Math.sign(dot)*p.getX(i)/r,Math.sign(dot)*p.getY(i)/r,0);}
  g.translate(0,0,-h/2);g.rotateX(Math.PI/2);return g;
 }
 function ring(ro,ri,h,y,tag,parent=stator,opacity=1,label=tag){return add(transform(sector(ro,ri,h),V(0,y,0)),tag,parent,opacity,label);}
 function tube(points,r,tag,parent=stator,label=tag,segments=null){return add(new T.TubeGeometry(new T.CatmullRomCurve3(points,false,'centripetal'),segments??Math.max(24,points.length*2),r,6,false),tag,parent,1,label);}
 function roundRect(w,h,r){const a=[];for(const [x,z,angle]of [[w/2-r,h/2-r,0],[-w/2+r,h/2-r,Math.PI/2],[-w/2+r,-h/2+r,Math.PI],[w/2-r,-h/2+r,Math.PI*1.5]])for(let k=0;k<5;k++){const t=angle+k/4*Math.PI/2;a.push([x+r*Math.cos(t),z+r*Math.sin(t)]);}return a;}
 function oriented(g,a,p){g.rotateY(-a);g.translate(...p.toArray());return g;}
 // Stationary centre support. A hollow support leaves the rotating output shaft
 // visibly separate from the mounting sleeve and the bearing seats.
 base.geometry=sector(radius*.39,.0258,bodyLength*.48);base.geometry.applyQuaternion(orientation);base.geometry.translate(...c.toArray());
 base.material.dispose();base.material=material('dark-titanium').clone();
 ring(radius*.45,radius*.35,.006,-.002,'dark-titanium',stator,1,'stator-support');
 ring(radius*.36,.0258,half+.007,(half+.007)/2,'dark-titanium',stator,1,'stationary-rear-neck');
 for(let i=0;i<6;i++){const a=i*Math.PI/3,q=new T.Quaternion().setFromAxisAngle(Y,-a);box(radius*.35,.006,.008,V(Math.cos(a)*radius*.43,0,Math.sin(a)*radius*.43),'dark-titanium',stator,q,'stator-support');}
 // Central stator teeth and concentrated coils. Each winding is one continuous
 // rounded helical wire, including end turns and a lead-out to the phase bus.
 const coils=18,turns=12,coilR=radius*.745,coilRadial=radius*.32,coilTangential=radius*.115,wire=radius*.00425,coilDepth=bodyLength*.31;
 const loop=roundRect(coilRadial,coilTangential,radius*.022);
 for(let i=0;i<coils;i++){
  const a=i*Math.PI*2/coils,ca=Math.cos(a),sa=Math.sin(a),p=V(ca*coilR,0,sa*coilR);
  const tooth=new T.BoxGeometry(coilRadial*.73,coilDepth*.91,coilTangential*.56);add(oriented(tooth,a,p),'brushed-steel',stator,1,'stator-tooth-stack');
  const bobbin=new T.BoxGeometry(coilRadial*.81,coilDepth*.99,coilTangential*.67);add(oriented(bobbin,a,p),'soft-black',stator,1,'coil-insulation');
  for(const y of [-1,1])add(oriented(new T.BoxGeometry(coilRadial*.73,.00055,coilTangential*.56),a,p.clone().add(V(0,y*coilDepth*.54,0))),'brushed-steel',stator,1,'stator-tooth-faces');
  const points=[];for(let turn=0;turn<turns;turn++)for(let k=0;k<loop.length;k++){
   const [x,z]=loop[k],t=(turn+k/loop.length)/(turns-1/loop.length);points.push(V(ca*(coilR+x)-sa*z,(t-.5)*coilDepth,sa*(coilR+x)+ca*z));
  }
  tube(points,wire,'copper-satin',stator,'continuous-copper-windings',turns*32);
  // Fine exposed stack edges and paper separators make the flat tooth faces
  // readable without inventing separate rotating radial laminations.
  for(let j=0;j<7;j++){
   const x=(j-3)*coilRadial*.09,local=V(ca*(coilR+x),coilDepth*.545,sa*(coilR+x));
   add(oriented(new T.BoxGeometry(.00023,.00010,coilTangential*.53),a,local),'dark-titanium',stator,1,'lamination-edges');
  }
  const lead=points[points.length-1].clone(),mid=V(ca*radius*.97,coilDepth*.50,sa*radius*.97),end=V(ca*radius*.975,-coilDepth*.35,sa*radius*.975);
  tube([lead,lead.clone().lerp(mid,.5).add(V(0,.002,0)),mid,end],wire*1.12,'copper-satin',stator,'winding-leadouts',16);
 }
 for(let k=0;k<3;k++){
  const pts=[];for(let j=0;j<=90;j++){const a=j/90*Math.PI*2;pts.push(V(Math.cos(a)*radius*.967,(k-1)*.0018,Math.sin(a)*radius*.967));}tube(pts,.00070,'copper-satin',stator,'phase-bus-rings',100);
 }
 // Two axial rotor discs carry opposing magnet arrays. The forward carrier and
 // magnets use a transparent inspection face, preserving a complete rotating
 // disc instead of leaving a rotating cut-out sector in the mechanism.
 const discY=bodyLength*.31,magnetOuter=radius*.91,magnetInner=radius*.52,poles=20;
 for(const sign of [-1,1]){
  const front=sign>0,face=sign*discY;
  ring(radius*.965,front?radius*.47:.024,.0036,face,'brushed-steel',rotor,front?.15:1,front?'front-inspection-rotor':'rear-rotor-disc');
  ring(radius*.978,radius*.941,.0048,face,'bright-alloy',rotor,1,'rotor-edge-lips');
  ring(front?.0225:.029,.0128,.0054,face,'brushed-steel',rotor,1,'rotor-hub-flanges');
  for(let i=0;i<poles;i++){
   const a=i*Math.PI*2/poles,span=Math.PI*2/poles*.87,g=sector(magnetOuter,magnetInner,.0032,a-span/2,span);
   add(transform(g,V(0,face-sign*.0034,0)),i%2?'dark-titanium':'engine-cover',rotor,front?.26:1,front?'front-inspection-magnets':'rear-permanent-magnets');
  }
  for(let i=0;i<10;i++){
   const a=i*Math.PI/5,p=V(Math.cos(a)*radius*.92,face+sign*.004,Math.sin(a)*radius*.92);
   cylinder(.0019,.0017,p,'polished-steel',rotor,12);
   cylinder(.0010,.0002,p.clone().add(V(0,sign*.001,0)),'soft-black',rotor,6);
  }
 }
 // Outer rotating return path and shallow machining grooves. Its inspection
 // transparency exposes the axial stack from oblique views as well.
 ring(radius,radius-.0016,bodyLength*.78,0,'dark-titanium',rotor,.12,'rotor-drum-inspection');
 for(const sign of [-1,1])for(let k=0;k<3;k++)ring(radius+.00010,radius-.00038,.00045,sign*(half-.002-k*.0016),'brushed-steel',rotor,1,'machined-edge-grooves');
 for(const sign of [-1,1]){
  ring(radius+.0011,radius-.0042,.002,sign*(half-.001),'satin-titanium',rotor,1,'housing-joint-rings');
  ring(radius-.002,radius-.0035,.00065,sign*(half-.002),'soft-black',rotor,1,'housing-seals');
  const bearingY=sign*bodyLength*.21;
  ring(.026,.0235,.0040,bearingY,'brushed-steel',stator,1,'bearing-outer-races');
  ring(.0195,.013,.0042,bearingY,'polished-steel',rotor,1,'bearing-inner-races');
  for(let i=0;i<12;i++){const a=i*Math.PI/6,g=new T.SphereGeometry(.0019,8,6);g.translate(Math.cos(a)*.0215,bearingY,Math.sin(a)*.0215);add(g,'polished-steel',stator,1,'bearing-rolling-elements');}
  ring(.024,.018,.00065,bearingY+sign*.0025,'champagne',stator,1,'bearing-cages');
 }
 cylinder(.0125,shaftMax-shaftMin,V(0,(shaftMax+shaftMin)/2,0),'polished-steel',rotor,64);
 for(const sign of [-1,1]){ring(.014,.0122,.0010,sign*(half-.0018),'dark-titanium',rotor,1,'shaft-retaining-rings');for(let j=0;j<2;j++)ring(.0127,.0122,.0003,sign*(half-.002-j*.0012),'brushed-steel',rotor,1,'shaft-machining');}
 box(.0015,.011,.0035,V(.012,shaftMax-.006,0),'brushed-steel',rotor,null,'output-key');
 // Three phase studs sit on a fixed terminal block; no leads attach to a rotor.
 const terminalZ=radius*.48,terminalY=half+.009;
 box(.020,.006,.030,V(0,half+.004,.035),'dark-titanium',stator,null,'fixed-terminal-support');
 box(.042,.010,.014,V(0,terminalY,terminalZ),'dark-titanium',stator,null,'terminal-block');
 box(.041,.009,.0014,V(0,terminalY,terminalZ+.0078),'satin-titanium',stator,null,'terminal-lid');
 for(let i=0;i<3;i++){
  const x=(i-1)*.014,p=V(x,terminalY,terminalZ+.013);
  let g=new T.CylinderGeometry(.0048,.0048,.006,20);g.rotateX(Math.PI/2);g.translate(...p.toArray());add(g,'soft-black',stator,1,'terminal-insulators');
  g=new T.CylinderGeometry(.0025,.0025,.003,16);g.rotateX(Math.PI/2);g.translate(x,terminalY,terminalZ+.0158);add(g,'copper-satin',stator,1,'phase-studs');
  tube([V((i-1)*.005,0,.092),V((i-1)*.005,0,.035),V((i-1)*.005,terminalY,.035),V(x,terminalY,terminalZ-.007)],.00135,'soft-black',stator,'insulated-phase-leads',36);
 }
 base.userData.motorConnectionPoint=V(0,terminalY,terminalZ+.0173).applyQuaternion(orientation).add(c).toArray();
 function merge(parts){
  const count=parts.reduce((n,g)=>n+g.attributes.position.count,0),indexCount=parts.reduce((n,g)=>n+(g.index?.count??g.attributes.position.count),0),out=new T.BufferGeometry();
  for(const [name,width]of [['position',3],['normal',3],['uv',2]]){const a=new Float32Array(count*width);let offset=0;for(const g of parts){const source=g.attributes[name];if(source)a.set(source.array,offset);offset+=g.attributes.position.count*width;}out.setAttribute(name,new T.BufferAttribute(a,width));}
  const indices=new Uint32Array(indexCount);let offset=0,vertex=0;for(const g of parts){const length=g.index?.count??g.attributes.position.count;for(let i=0;i<length;i++)indices[offset++]=vertex+(g.index?g.index.getX(i):i);vertex+=g.attributes.position.count;}out.setIndex(new T.BufferAttribute(indices,1));
  out.computeBoundingBox();out.computeBoundingSphere();for(const g of parts)g.dispose();return out;
 }
 // Each material/visibility layer is a single draw call regardless of the number
 // of turns, magnet sectors, fasteners, or bearings it contains.
 for(const b of batches.values()){
  const m=new T.Mesh(merge(b.parts),material(b.tag).clone());m.name=b.label;m.userData.detailOpacity=b.opacity;
  if(b.opacity<1){m.material.transparent=true;m.material.opacity=b.opacity;m.material.depthWrite=false;}
  b.parent.add(m);details.push(m);
 }
 base.userData.motorDetail={architecture:'axial-flux / one wound stator between two rotor discs / outer rotor',modelStatus:'structural presentation model; internal dimensions, terminal layout and winding detail are illustrative',axis:axis.toArray(),center:c.toArray(),replacedProxyCenter:proxyCenter.toArray(),bodyDiameter:.228,bodyLength,shaftAxialBounds:[shaftMin,shaftMax],shaftExtentBasis:'bounded by source motor overall axial extent; shaft diameter and key remain illustrative',bearingMotion:'race/support structure shown; rolling-element kinematics are not simulated',coilCount:coils,displayedTurnsPerCoil:turns,magnetPolesPerDisc:poles,rotorDiscOffsets:[-discY,discY],drawCalls:details.length+1};
 return {details,rotor,stator};
}
