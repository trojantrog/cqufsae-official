import * as T from './vendor/three.module.min.js';
import {vehicleMaterial} from './presentation-materials.js?v=742';
import {solveCorner,solveTieRod,uprightPose,tieRodPose} from './source-kinematics.js?v=761';
import {createBrakeHydraulics} from './brake-hydraulics.js?v=761';
import {createRearDecoupler752,sourcePinCentre} from './rear-decoupler-752.js?v=752.2';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion(),Y=V(0,1,0),X=V(1,0,0);
const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
const point=m=>V(...m.userData.center);
function rigid(m,q,base,current=base){m.quaternion.copy(q);m.position.copy(current).sub(base.clone().applyQuaternion(q));}
function armPoint(c,p,upper=false){const a=upper?c.upper:c.lower,rotation=upper?c.solved.upperQ:c.solved.lowerQ;return rotation?p.clone().sub(a.inner).applyQuaternion(rotation).add(a.inner):p.clone().sub(a.inner).applyAxisAngle(X,upper?c.solved.upperAngle:c.solved.lowerAngle).add(a.inner);}
function axisPose(a,b,aa,bb){return Q().setFromUnitVectors(b.clone().sub(a).normalize(),bb.clone().sub(aa).normalize());}

// C41 source IDs identify joints and bearings. Labels alone include a stationary
// bearing bracket labelled "steering wheel" and an entire rear decoupler assembly.
export function createChassisMotion(meshes,{corners=[]}={}){
 const root=new T.Group();root.name='native-chassis-motion-details';
 const byId=new Map(meshes.map(m=>[m.userData.id,m])),bindings=new Map(),resources=new Set(),dampers=[],rearRockers=[],halfshafts=[];
 const get=id=>byId.get(id),at=id=>point(get(id)),s=n=>`suspension-${String(n).padStart(3,'0')}`;
 const own=x=>(resources.add(x),x),fixed=new Set(),nativeSprings=new Set(),replacedParts=new Set();let state={rack:0,steer:0,angle:0},explosion=0;
 const upperPivot=get('steering-007')&&get('steering-008')?at('steering-007').add(at('steering-008')).multiplyScalar(.5):V(.235385,0,.479131);
 const upperAxis=get('steering-007')&&get('steering-008')?at('steering-008').sub(at('steering-007')).normalize():V(-.9917,0,.1289).normalize();
 const lowerPivot=get('steering-004')?at('steering-004'):V(.324044,0,.436589);
 const lowerAxis=get('steering-023')?lowerPivot.clone().sub(at('steering-023')).normalize():V(-.69,0,.724).normalize();
 const upperIds=new Set([1,3,6,9,10,11,12,13,14,15,16,18,19,20,21]);
 const lowerIds=new Set([2,4,5,22,23,25,26,27,28,29]);
 const rackIds=new Set([36,38,39,40,41,42,43,44,45,46,47]);
 const pedalPivot=V(.91983147,.08,.132068145);
 // Chassis plates include mirrored pieces whose exported labels say control arm.
 for(const n of [7,8,9,10,24,26,27,28,175,176,177,178,184,186,187,188])if(get(s(n))){bindings.set(get(s(n)),{type:'fixed'});fixed.add(s(n));}
 // The two inboard ball centres define each wishbone hinge. The points are
 // inferred from the paired native spacers, not from the arm silhouette. Right
 // source arms are the reflected assembly; their sparse export omits spacers.
 const jointMid=(a,b)=>at(s(a)).add(at(s(b))).multiplyScalar(.5),mirror=(p,side)=>p.clone().multiply(V(1,side,1));
 const jointSource={
  front:{upper:{front:[11,13],rear:[17,19],outer:[98,100]},lower:{front:[14,16],rear:[20,22],outer:[102,104]}},
  rear:{upper:{front:[29,31],rear:[35,37],outer:[79,81]},lower:{front:[32,34],rear:[41,43],outer:[87,89]}}
 };
 const registration=[];
 for(const c of corners){
  const definition=jointSource[c.front?'front':'rear'];
  if(Object.values(definition).some(d=>[...d.front,...d.rear,...d.outer].some(n=>!get(s(n)))))continue;
  for(const name of ['upper','lower']){const d=definition[name],front=mirror(jointMid(...d.front),c.side),rear=mirror(jointMid(...d.rear),c.side),outer=mirror(jointMid(...d.outer),c.side),hingeAxis=front.clone().sub(rear).normalize();
   c[name]={inner:rear,secondInner:front,outer,hingeAxis};registration.push({front:c.front,side:c.side,arm:name,sourceSpacers:d,inner:rear.toArray(),secondInner:front.toArray(),outer:outer.toArray(),axis:hingeAxis.toArray(),basis:'paired native spacer centres; reflected right assembly'});
  }
  c.solved=solveCorner(c,c.travel||0);
  for(const m of meshes){const mechanism=m.userData.mechanism||'';if(bindings.has(m)||Math.sign(m.userData.center[1])!==c.side||!mechanism.startsWith(c.front?'su-front_':'su-rear_'))continue;
   if(mechanism.includes('uca')||mechanism.includes('lca'))bindings.set(m,{type:'wishbone',corner:c,upper:mechanism.includes('uca')});
  }
  if(!c.front&&get(s(38))&&get(s(40))&&get(s(84))){
   c.tie={inner:mirror(jointMid(38,40),c.side),outer:mirror(at(s(84)),c.side),source:'native rear toe-link inner spacer pair and outboard bolt axis'};
   for(const n of c.side>0?[114,115,116,117,118,119]:[264,265,266,267,268,269])if(get(s(n)))bindings.set(get(s(n)),{type:'rear-tie',corner:c});
   const bracket=get(s(c.side>0?25:185));if(bracket){bindings.set(bracket,{type:'fixed'});fixed.add(bracket.userData.id);}
  }
 }
 // Native 5 mm bore and concentric 10 mm outer cylinder agree on this axis.
 // The balance bar follows the upper pedal bore; master-cylinder bodies stay.
 for(const n of [84,88,89,90,91,92,93,96]){const id=`brakes-${String(n).padStart(3,'0')}`;if(get(id))bindings.set(get(id),{type:'pedal'});}
 for(const m of meshes){const r=m.userData.mechanism||'',id=m.userData.id;
  if(!r.startsWith('st-')||r==='st-tie_rods')continue;
  const n=Number(id.split('-')[1]),type=upperIds.has(n)?'upper':lowerIds.has(n)?'lower':rackIds.has(n)?'rack':'fixed';
  bindings.set(m,{type});if(type==='fixed')fixed.add(id);
 }
 // Pinion travel is linked to the actual rack/tie-rod convention. Positive wheel
 // steer must move the top of the steering wheel toward vehicle +Y (driver left).
 for(const c of corners.filter(c=>c.front&&!c.tie?.inner)){
  const donor=corners.find(o=>o.front&&o.side===-c.side&&o.tie?.inner);
  if(donor)c.tie={inner:donor.tie.inner.clone().multiply(V(1,-1,1)),outer:donor.tie.outer.clone().multiply(V(1,-1,1)),inferredMirror:true};
 }
 let rackSense=1;
 if(corners.some(c=>c.front&&c.tie?.inner)){
  const probes=corners.filter(c=>c.front&&c.tie?.inner).map(c=>({...c,steer:0,tie:{inner:c.tie.inner.clone(),outer:c.tie.outer.clone()},solved:solveCorner(c,0)}));
  probes.forEach(c=>solveTieRod(c,.0001));rackSense=Math.sign(probes.reduce((a,c)=>a+c.steer,0))||1;
 }
 const material=tag=>own(vehicleMaterial(tag));
 const mesh=(geometry,mat,parent)=>{const m=new T.Mesh(own(geometry),mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
 const cylinder=(radius,mat,parent)=>mesh(new T.CylinderGeometry(radius,radius,1,24),mat,parent);
 function segment(m,a,b){const delta=b.clone().sub(a);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(Y,delta.clone().normalize());m.scale.set(1,Math.max(.001,delta.length()),1);}
 function sourceProjection(m,a,axis){const p=m.geometry.attributes.position;let min=Infinity,max=-Infinity,rmin=Infinity,rmax=0;
  for(let i=0;i<p.count;i++){const x=p.getX(i)-a.x,y=p.getY(i)-a.y,z=p.getZ(i)-a.z,t=x*axis.x+y*axis.y+z*axis.z,r=Math.sqrt(Math.max(0,x*x+y*y+z*z-t*t));min=Math.min(min,t);max=Math.max(max,t);rmin=Math.min(rmin,r);rmax=Math.max(rmax,r);}
  return {min,max,rmin,rmax};
 }
 function annulus(inner,outer,height,mat,parent,name){const h=height*.5,edge=Math.min(.0006,height*.2),profile=[[inner,-h],[outer-edge,-h],[outer,-h+edge],[outer,h-edge],[outer-edge,h],[inner,h],[inner,-h]].map(p=>new T.Vector2(...p));
  const m=mesh(new T.LatheGeometry(profile,48),mat,parent);m.name=name;m.geometry.computeBoundingBox();return m;
 }
 // Closed end turns retain one wire diameter of pitch and a round section. Only the
 // active pitch changes; position and normal buffers are reused every frame.
 function springGeometry(radius,wire,height){const steps=528,radial=16,turns=8.25,closed=1,ramp=.35,active=turns-2*closed,integral=active-ramp,stride=radial+1,rings=steps+1,sideCount=rings*stride,capStride=radial+2,closedPitch=wire*2,closedSlope=closedPitch/(Math.PI*2),groundWire=wire*radius/Math.hypot(radius,closedSlope);
  const geometry=new T.BufferGeometry(),positions=new Float32Array((sideCount+2*capStride)*3),normals=new Float32Array(positions.length),indices=[],cs=[],ss=[],levels=[],slopes=[],baseLevels=[],cr=[],sr=[];
  const ease=t=>t*t*(3-2*t),area=t=>t*t*t*(1-t*.5);
  for(let j=0;j<=radial;j++){cr.push(Math.cos(j/radial*Math.PI*2));sr.push(Math.sin(j/radial*Math.PI*2));}
  for(let i=0;i<=steps;i++){const u=i/steps*turns-closed,theta=i/steps*turns*Math.PI*2;cs.push(Math.cos(theta));ss.push(Math.sin(theta));let h=0,pitch=0;
   if(u>=active)h=integral;else if(u>0){if(u<ramp){const t=u/ramp;h=ramp*area(t);pitch=ease(t);}else if(u>active-ramp){const t=(active-u)/ramp;h=integral-ramp*area(t);pitch=ease(t);}else{h=u-ramp*.5;pitch=1;}}
   levels.push(h/integral);baseLevels.push(closedPitch*(i/steps*turns-turns*h/integral));slopes.push(pitch/(integral*Math.PI*2));
   if(i<steps)for(let j=0;j<radial;j++){const a=i*stride+j,b=a+stride;indices.push(a,b,a+1,b,b+1,a+1);}
  }
  for(let end=0;end<2;end++){const first=sideCount+end*capStride,centre=first+radial+1;for(let j=0;j<radial;j++)end?indices.push(centre,first+j,first+j+1):indices.push(centre,first+j+1,first+j);}
  const position=new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage),normal=new T.BufferAttribute(normals,3).setUsage(T.DynamicDrawUsage);geometry.setAttribute('position',position);geometry.setAttribute('normal',normal);geometry.setIndex(indices);
  geometry.userData={longitudinalSegments:steps,radialSegments:radial,wireRadius:wire,radius,turns,closedTurns:closed,closedPitch};let last=NaN;
  function update(h){if(Math.abs(h-last)<1e-9)return;last=h;const span=h-2*groundWire;
   for(let i=0;i<=steps;i++){const slope=closedSlope+(span-closedPitch*turns)*slopes[i],length=Math.hypot(radius,slope),bx=slope*ss[i]/length,by=radius/length,bz=-slope*cs[i]/length,cy=groundWire+baseLevels[i]+span*levels[i];
    for(let j=0;j<=radial;j++){const k=(i*stride+j)*3,nx=cr[j]*cs[i]+sr[j]*bx,ny=sr[j]*by,nz=cr[j]*ss[i]+sr[j]*bz;positions[k]=radius*cs[i]+wire*nx;positions[k+1]=cy+wire*ny;positions[k+2]=radius*ss[i]+wire*nz;normals[k]=nx;normals[k+1]=ny;normals[k+2]=nz;}
   }
   for(let end=0;end<2;end++){const i=end?steps:0,first=sideCount+end*capStride,sign=end?1:-1,cx=radius*cs[i],cy=groundWire+baseLevels[i]+span*levels[i],cz=radius*ss[i],capLength=Math.hypot(radius,closedSlope);
    for(let j=0;j<=radial+1;j++){const k=(first+j)*3,from=(i*stride+Math.min(j,radial))*3;if(j===radial+1){positions[k]=cx;positions[k+1]=cy;positions[k+2]=cz;}else{positions[k]=positions[from];positions[k+1]=positions[from+1];positions[k+2]=positions[from+2];}normals[k]=-sign*ss[i]*radius/capLength;normals[k+1]=sign*closedSlope/capLength;normals[k+2]=sign*cs[i]*radius/capLength;}
   }
   position.needsUpdate=true;normal.needsUpdate=true;geometry.boundingBox=new T.Box3(V(-radius-wire,0,-radius-wire),V(radius+wire,h,radius+wire));geometry.boundingSphere=new T.Sphere(V(0,h*.5,0),Math.hypot(radius+wire,h*.5));
  }
  update(height);return {geometry,update,activePitch:h=>closedPitch+(h-2*groundWire-closedPitch*turns)/integral};
 }
 // Native CV housings provide the plunge space. Each shaft stays rigid and
 // slides at its inboard spline while the outer joint follows the upright.
 for(const [side,innerId,shaftId,outerId] of [[1,79,80,81],[-1,84,82,83]]){
  const id=n=>`transmission-${String(n).padStart(3,'0')}`,innerMesh=get(id(innerId)),body=get(id(shaftId)),outerMesh=get(id(outerId)),corner=corners.find(c=>!c.front&&c.side===side);
  if(!innerMesh||!body||!outerMesh||!corner)continue;
  const inner=V(-.962,innerMesh.userData.center[1],.270),outer=V(corner.c.x,outerMesh.userData.center[1],corner.c.z),axis=outer.clone().sub(inner).normalize();
  const group=new T.Group();group.name=`rear-${side>0?'left':'right'}-plunging-spline`;root.add(group);
  const sleeve=cylinder(.0083,material('brushed-steel'),group);
  const shaft={side,inner,outer,axis,baseLength:inner.distanceTo(outer),currentOuter:outer.clone(),corner,q:Q(),plunge:0,sleeve,group,reference:body};halfshafts.push(shaft);
  bindings.set(innerMesh,{type:'cv-inner',shaft});bindings.set(body,{type:'shaft-body',shaft});bindings.set(outerMesh,{type:'cv-outer',shaft});
 }
 function addDamper(name,a,b,parts,spring,move,shaftNumbers=[],mounts={a:[],b:[],reservoir:null}){if(!spring||!parts.length)return;
  const group=new T.Group();group.name=name;root.add(group);
  const metal=material('brushed-steel'),bodyMat=material('dark-titanium'),springMat=material('frame-graphite'),rodMat=material('polished-steel'),sealMat=material('soft-black'),axis=b.clone().sub(a).normalize(),length=a.distanceTo(b);
  const inventory=parts.map(m=>({id:m.userData.id,label:m.userData.label,...sourceProjection(m,a,axis),number:Number(m.userData.id.split('-').at(-1))})),springBounds=inventory.find(p=>p.id===spring.userData.id);
  const seats={start:Math.max(.012,springBounds.min),end:Math.max(.012,length-springBounds.max),radius:(springBounds.rmin+springBounds.rmax)*.5},springLength=length-seats.start-seats.end,wire=.0019;
  const rodSource=inventory.find(p=>p.label.includes('筒体')&&p.rmax<.012&&p.max-p.min>.05),bodyEnd=rodSource&&(rodSource.min+rodSource.max)*.5<length*.5?'b':'a';
  const barrelStart=.014,barrelLength=(bodyEnd==='a'?rodSource?.min:length-(rodSource?.max??length*.5))-(barrelStart),barrelRadius=Math.min(.0126,seats.radius-wire-.0015),rodRadius=Math.min(.0043,rodSource?.rmax??.0043);
  const springShape=springGeometry(seats.radius,wire,springLength),coil=mesh(springShape.geometry,springMat,group);coil.name=name+'-helical-spring';
  const barrel=cylinder(barrelRadius,bodyMat,group),rod=cylinder(rodRadius,rodMat,group);barrel.name=name+'-barrel';rod.name=name+'-piston-rod';barrel.userData.damperCore=rod.userData.damperCore=true;
  const seatThickness=.003,seatsMeshes=[annulus(bodyEnd==='a'?barrelRadius+.0006:rodRadius+.0007,seats.radius+wire+.0014,seatThickness,metal,group,name+'-spring-seat-a'),annulus(bodyEnd==='b'?barrelRadius+.0006:rodRadius+.0007,seats.radius+wire+.0014,seatThickness,metal,group,name+'-spring-seat-b')];
  const gland=annulus(rodRadius+.0002,barrelRadius+.0005,.0032,metal,group,name+'-rod-gland'),seal=annulus(rodRadius,rodRadius+.001,.002,sealMat,group,name+'-rod-seal'),neck=cylinder(rodRadius+.0018,metal,group);neck.name=name+'-rod-end-neck';neck.userData.damperCore=true;
  // The reservoir is a separate, intentional parallel cylinder. Its centre and
  // extent come from the native piggyback body; native duplicates are hidden.
  const reservoirSource=inventory.find(p=>p.number===mounts.reservoir);let reservoir;
  if(reservoirSource){const m=parts.find(m=>m.userData.id===reservoirSource.id),local=point(m).sub(a).applyQuaternion(Q().setFromUnitVectors(axis,Y)),r=(reservoirSource.rmax-reservoirSource.rmin)*.5;
   const can=cylinder(r,material('champagne'),group);can.name=name+'-piggyback-reservoir';can.position.copy(local);can.scale.y=reservoirSource.max-reservoirSource.min;
   const bridge=cylinder(.0055,metal,group),returnNeck=cylinder(.0055,metal,group),fixedY=bodyEnd==='a'?seats.start-seatThickness-.005:length-seats.end+seatThickness+.005,endY=bodyEnd==='a'?reservoirSource.min:reservoirSource.max;
   segment(bridge,V(0,fixedY,0),V(local.x,fixedY,local.z));segment(returnNeck,V(local.x,fixedY,local.z),V(local.x,endY,local.z));bridge.name=name+'-reservoir-union';returnNeck.name=name+'-reservoir-return-neck';
   const caps=[-1,1].map(sign=>{const cap=cylinder(r+.0004,metal,group);cap.scale.y=.002;cap.position.set(local.x,local.y+sign*can.scale.y*.5,local.z);cap.name=name+'-reservoir-cap';return cap;});reservoir={local,can,bridge,returnNeck,caps,baseY:fixedY,endY};
  }
  const reference=parts.find(m=>mounts.a.includes(Number(m.userData.id.split('-').at(-1))))||parts.find(m=>mounts.b.includes(Number(m.userData.id.split('-').at(-1))));
  // A damper is one extraction unit. Its piston and spring retain their working
  // motion inside that unit; source piece paths must not separate its hardware.
  const explosionAssembly={id:name,group:'suspension',label:'减振器',mechanism:spring.userData.mechanism,variant:spring.userData.variant,center:a.clone().add(b).multiplyScalar(.5).toArray()};
  const d={name,a,b,aa:a.clone(),bb:b.clone(),parts,spring,move,seats,length,springLength,coil,barrel,rod,seatsMeshes,gland,seal,neck,group,reference,q:Q(),compression:0,error:0,barrelStart,barrelLength,bodyEnd,springShape,wire,seatThickness,rodOverlap:.012,rodRadius,reservoir,inventory,currentSpringLength:springLength,explosionAssembly};
  nativeSprings.add(spring);dampers.push(d);
  for(const m of parts){const p=inventory.find(p=>p.id===m.userData.id),n=p.number,isA=mounts.a.includes(n),isB=mounts.b.includes(n),isRod=p===rodSource,nearMoving=Math.abs((p.min+p.max)*.5-(bodyEnd==='a'?springBounds.max:springBounds.min))<.012;
   p.role=isA?'mount-a':isB?'mount-b':m===spring?'spring':isRod?'piston-rod':p.number===mounts.reservoir?'reservoir':p.rmin>seats.radius-wire&&p.rmax<.03?'adjuster-collar':nearMoving?'moving-seat/seal':p.label.includes('筒体')?'barrel/union':'cap/seal/retainer';p.replaced=!isA&&!isB;
   if(p.replaced)replacedParts.add(m);const anchor=isA?'a':isB?'b':isRod||nearMoving?(bodyEnd==='a'?'b':'a'):bodyEnd;
   bindings.set(m,{type:'damper',damper:d,anchor});
   m.userData.explosionAssembly=explosionAssembly;
  }
  d.materials=new Set();group.traverse(o=>{if(o.isMesh)d.materials.add(o.material);});
 }
 function bindRod(parts,a,b,current){const binding={type:'rod',a,b,aa:a.clone(),bb:b.clone(),q:Q(),current,error:0};parts.forEach(m=>bindings.set(m,binding));return binding;}
 const frontAssemblies=[];
 for(const [side,parent,base] of [[1,'damper-001',120],[-1,'damper-003',270]]){
  const parts=meshes.filter(m=>m.userData.sourceParent===parent),spring=parts.find(m=>m.userData.label==='减振器弹簧');
  if(!spring||!get(s(base+2)))continue;
  const lowerEye=side>0?12:13,a=at(`${parent}-piece-27`),b=at(`${parent}-piece-${lowerEye}`),wheel=at(s(base+2)),rodLength=b.distanceTo(wheel);
  const assembly={side,a,b,wheel,rodLength,aa:a.clone(),bb:b.clone(),cc:wheel.clone(),corner:null};frontAssemblies.push(assembly);
  const rod=bindRod([0,1,2,3,4,5].map(n=>get(s(base+n))).filter(Boolean),b,wheel,()=>[assembly.bb,assembly.cc]);assembly.rod=rod;
  addDamper(parent,a,b,parts,spring,()=>[assembly.aa,assembly.bb],[12,13,14,15,16,22],{a:[11,17,27,29,30],b:[lowerEye],reservoir:20});
  for(const id of side>0?[6,23]:[174,183])if(get(s(id))){bindings.set(get(s(id)),{type:'fixed'});fixed.add(s(id));}
 }
 for(const side of [1,-1]){
  const r0=side>0?133:139,r1=side>0?134:140,rod0=side>0?126:276;
  if(!get(s(r0))||!get(s(rod0)))continue;
  const pivot=at(s(r0)).add(at(s(r1))).multiplyScalar(.5),axis=at(s(r1)).sub(at(s(r0))).normalize(),inner=at(s(rod0)),outer=at(s(rod0+4));
  const rocker={side,pivot,axis,inner,outer,q:Q(),angle:0,rodLength:inner.distanceTo(outer),error:0};rearRockers.push(rocker);
  const pushrodParts=[...[0,1,2,3,4,5].map(n=>get(s(rod0+n))).filter(Boolean),...meshes.filter(m=>m.userData.sourceParent===(side>0?'rear-pushrod-left':'rear-pushrod-right'))];
  rocker.rod=bindRod(pushrodParts,inner,outer,()=>[rocker.currentInner||inner,rocker.currentOuter||outer]);
  for(const n of side>0?[132,135,136,137]:[138,141,142,143])if(get(s(n)))bindings.set(get(s(n)),{type:'rocker',rocker});
  for(const n of [r0,r1]){bindings.set(get(s(n)),{type:'fixed'});fixed.add(s(n));}
 }
 const rear=meshes.filter(m=>m.userData.sourceParent==='damper-002'),left=rearRockers.find(r=>r.side>0),right=rearRockers.find(r=>r.side<0),decoupler=createRearDecoupler752({get,left,right});
 const rockerPoint=(p,r)=>p.clone().sub(r.pivot).applyQuaternion(r.q).add(r.pivot);
 if(rear.length&&left&&right){
  const spring1=get('damper-002-piece-01'),spring2=get('damper-002-piece-77');
  const first=rear.filter(m=>Math.abs(m.userData.center[0]-spring1.userData.center[0])<=Math.abs(m.userData.center[0]-spring2.userData.center[0])),second=rear.filter(m=>!first.includes(m));
  const a1=at('damper-002-piece-22'),b1=at('damper-002-piece-25');
  const extensionAnchor=sourcePinCentre(get(s(143)),right.axis,a1),extensionLength=extensionAnchor.distanceTo(a1),extension={a:extensionAnchor,b:a1,aa:extensionAnchor.clone(),bb:a1.clone()};
  const extensionRod=bindRod([144,145,146,147,148].map(n=>get(s(n))).filter(Boolean),extensionAnchor,a1,()=>[extension.aa,extension.bb]);
  addDamper('rear-heave-damper',a1,b1,first,first.find(m=>m.userData.label==='减振器弹簧'),()=>{
   const b=rockerPoint(b1,left),base=rockerPoint(extensionAnchor,right),axis=b.clone().sub(base).normalize();extension.aa.copy(base);extension.bb.copy(base).addScaledVector(axis,extensionLength);return [extension.bb,b];
  },[20,21,22,24,26,28],{a:[22],b:[12,14,25,29,30],reservoir:13});
  const a2=at('damper-002-piece-57'),b2=at('damper-002-piece-64');
  addDamper('rear-roll-damper',a2,b2,second,second.find(m=>m.userData.label==='减振器弹簧'),()=>decoupler?[decoupler.point(a2,-1),decoupler.point(b2,1)]:[rockerPoint(a2,right),rockerPoint(b2,left)],[61,62,66,74],{a:[51,53,55,57,66,74],b:[52,54,64,73,75],reservoir:72});
  for(const m of decoupler?.meshes||[])bindings.set(m,{type:'decoupler'});
  extension.rod=extensionRod;
 }
 for(const m of meshes)if(m.userData.mechanism==='su-decoupler'&&!bindings.has(m)){bindings.set(m,{type:'fixed'});fixed.add(m.userData.id);}
 function applyPart(m){const b=bindings.get(m);if(!b)return false;
  if(b.type==='upper'||b.type==='lower')rigid(m,Q().setFromAxisAngle(b.type==='upper'?upperAxis:lowerAxis,state.angle),b.type==='upper'?upperPivot:lowerPivot);
  else if(b.type==='rack')m.position.y=state.rack;
  else if(b.type==='wishbone'){const arm=b.upper?b.corner.upper:b.corner.lower,rotation=b.upper?b.corner.solved.upperQ:b.corner.solved.lowerQ;rigid(m,rotation,arm.inner);}
  else if(b.type==='rear-tie')tieRodPose(m,b.corner);
  else if(b.type==='pedal')rigid(m,Q().setFromAxisAngle(Y,state.brake*.12),pedalPivot);
  else if(b.type==='cv-inner')rigid(m,Q().setFromAxisAngle(Y,b.shaft.corner.spin||0),b.shaft.inner);
  else if(b.type==='cv-outer')uprightPose(m,b.shaft.corner,b.shaft.corner.spin||0);
  else if(b.type==='shaft-body')rigid(m,b.shaft.q,b.shaft.outer,b.shaft.currentOuter);
  else if(b.type==='rod')rigid(m,b.q,b.a,b.aa);
  else if(b.type==='rocker')rigid(m,b.rocker.q,b.rocker.pivot);
  else if(b.type==='damper'){const d=b.damper;rigid(m,d.q,b.anchor==='b'?d.b:d.a,b.anchor==='b'?d.bb:d.aa);}
  else if(b.type==='decoupler')decoupler.applyPart(m);
  else {m.position.set(0,0,0);m.quaternion.identity();}
  return true;
 }
 const hydraulics=createBrakeHydraulics(meshes);root.add(hydraulics.root);
 function update(motion={},currentCorners=corners,exploded=0,{suspension=true,hydraulics:hydraulicMotion=true,appearance=true,forceGeometry=true}={}){corners=currentCorners;explosion=exploded;
  // The rear toe rod is fixed at the chassis end. Its length determines the
  // upright's small toe change during bump, before the wheel and CV poses run.
  for(const c of corners)if(!c.front&&c.tie?.source)solveTieRod(c,0);
  const steer=corners.filter(c=>c.front).reduce((n,c)=>n+c.steer,0)/Math.max(1,corners.filter(c=>c.front).length);
  state={rack:motion.rack??0,steer:steer||motion.steer||0,angle:motion.rack!==undefined?motion.rack*rackSense/.017:(steer||motion.steer||0)*7.5,brake:motion.brake??0};
  if(suspension){
  for(const a of frontAssemblies){const c=corners.find(c=>c.front&&c.side===a.side);if(!c?.solved)continue;
   a.corner=c;a.cc.copy(armPoint(c,a.wheel));const axis=a.cc.clone().sub(a.a).normalize(),total=a.a.distanceTo(a.cc);
   a.aa.copy(a.a);a.bb.copy(a.a).addScaledVector(axis,Math.max(.05,total-a.rodLength));
  }
  for(const r of rearRockers){const c=corners.find(c=>!c.front&&c.side===r.side);if(!c?.solved)continue;
   const end=armPoint(c,r.outer,true);let angle=0;
   const start=a=>r.inner.clone().sub(r.pivot).applyAxisAngle(r.axis,a).add(r.pivot);
   for(let i=0;i<16;i++){const error=start(angle).distanceTo(end)-r.rodLength,gradient=(start(angle+.0001).distanceTo(end)-start(angle-.0001).distanceTo(end))/.0002;if(Math.abs(gradient)<1e-7)break;angle=T.MathUtils.clamp(angle-error/gradient,-.65,.65);if(Math.abs(error)<1e-9)break;}
   r.angle=angle;r.q.setFromAxisAngle(r.axis,angle);r.currentInner=start(angle);r.currentOuter=end;r.error=Math.abs(r.currentInner.distanceTo(end)-r.rodLength);
  }
  decoupler?.update();
  for(const shaft of halfshafts){const c=corners.find(c=>!c.front&&c.side===shaft.side);if(!c?.solved)continue;shaft.corner=c;
   shaft.currentOuter.copy(shaft.outer).sub(c.lower.outer).applyQuaternion(c.solved.uprightQ).add(c.solved.lower);
   const axis=shaft.currentOuter.clone().sub(shaft.inner).normalize(),align=Q().setFromUnitVectors(shaft.axis,axis);
   shaft.q.copy(align).multiply(Q().setFromAxisAngle(shaft.axis,c.spin||0));
   shaft.plunge=shaft.inner.distanceTo(shaft.currentOuter)-shaft.baseLength;
   segment(shaft.sleeve,shaft.inner.clone().addScaledVector(axis,-.004),shaft.inner.clone().addScaledVector(axis,.029));
  }
  for(const d of dampers){const [a,b]=d.move();d.aa.copy(a);d.bb.copy(b);d.q.copy(axisPose(d.a,d.b,a,b));const axis=b.clone().sub(a).normalize(),length=a.distanceTo(b);d.compression=d.length-length;
   d.group.position.copy(a);d.group.quaternion.setFromUnitVectors(Y,axis);const start=d.seats.start,end=length-d.seats.end,height=end-start;d.currentSpringLength=height;
   d.coil.position.set(0,start,0);d.coil.quaternion.identity();d.coil.scale.setScalar(1);if(forceGeometry||d.coil.visible&&d.coil.material.visible!==false)d.springShape.update(height);
   d.seatsMeshes[0].position.set(0,start-d.seatThickness*.5,0);d.seatsMeshes[1].position.set(0,end+d.seatThickness*.5,0);
   const from=d.bodyEnd==='a'?d.barrelStart:length-d.barrelStart-d.barrelLength,to=from+d.barrelLength,exit=d.bodyEnd==='a'?to:from;segment(d.barrel,V(0,from,0),V(0,to,0));
   const rodFrom=d.bodyEnd==='a'?exit-d.rodOverlap:.002,rodTo=d.bodyEnd==='a'?length-.002:exit+d.rodOverlap;segment(d.rod,V(0,rodFrom,0),V(0,rodTo,0));
   d.gland.position.set(0,exit,0);d.seal.position.set(0,exit+(d.bodyEnd==='a'?.0017:-.0017),0);const rodEnd=d.bodyEnd==='a'?length:0;segment(d.neck,V(0,rodEnd-.005,0),V(0,rodEnd+.001,0));
   if(d.reservoir&&d.bodyEnd==='b'){const r=d.reservoir,shift=length-d.length;r.can.position.y=r.local.y+shift;r.caps.forEach((m,i)=>m.position.y=r.local.y+shift+(i?1:-1)*r.can.scale.y*.5);segment(r.bridge,V(0,r.baseY+shift,0),V(r.local.x,r.baseY+shift,r.local.z));segment(r.returnNeck,V(r.local.x,r.baseY+shift,r.local.z),V(r.local.x,r.endY+shift,r.local.z));}
  }
  for(const b of new Set(bindings.values()))if(b.type==='rod'){const [a,bb]=b.current();b.aa.copy(a);b.bb.copy(bb);b.q.copy(axisPose(b.a,b.b,a,bb));b.error=Math.abs(a.distanceTo(bb)-b.a.distanceTo(b.b));}
  }
  if(hydraulicMotion)hydraulics.update(motion,corners,exploded);if(appearance){syncAppearance(exploded);root.updateMatrixWorld(true);}
 }
 function syncAppearance(exploded=explosion,{connections=true}={}){for(const d of dampers){
  const alpha=(d.reference?.material.opacity??1)*(1-smooth(exploded/.12));d.group.visible=alpha>.002;
  for(const mat of d.materials){mat.opacity=alpha;if(!mat.transparent){mat.transparent=true;mat.needsUpdate=true;}mat.depthWrite=alpha>.9999;}
  d.group.traverse(o=>{if(o.isMesh){o.userData.group='suspension';o.userData.mechanism='su-damper';o.userData.defocusWeight=d.reference?.userData.defocusWeight||0;o.castShadow=alpha>.002;}});
 }for(const shaft of halfshafts){const alpha=(shaft.reference.material.opacity??1)*(1-smooth(exploded/.12)),m=shaft.sleeve;shaft.group.visible=alpha>.002;m.material.opacity=alpha;if(!m.material.transparent){m.material.transparent=true;m.material.needsUpdate=true;}m.material.depthWrite=alpha>.9999;m.castShadow=alpha>.002;m.userData.group='transmission';m.userData.mechanism='mo-halfshafts';m.userData.defocusWeight=shaft.reference.userData.defocusWeight||0;}hydraulics.syncAppearance(exploded,{connections});}
 const sourceVisibility=(m,e=explosion)=>replacedParts.has(m)?smooth(e/.12):1;
 const diagnostics=()=>({jointRegistration:registration,rearToeRods:corners.filter(c=>!c.front&&c.tie?.source).map(c=>({side:c.side,inner:c.tie.currentInner.toArray(),outer:c.tie.currentOuter.toArray(),toe:c.steer,length:c.tie.inner.distanceTo(c.tie.outer),error:c.tie.error,sourceIds:[...bindings].filter(([,b])=>b.type==='rear-tie'&&b.corner===c).map(([m])=>m.userData.id)})),steering:{upperPivot:upperPivot.toArray(),upperAxis:upperAxis.toArray(),lowerPivot:lowerPivot.toArray(),lowerAxis:lowerAxis.toArray(),rackSense,...state,rotating:[...bindings].filter(([,b])=>b.type==='upper'||b.type==='lower').map(([m])=>m.userData.id),fixed:[...fixed].filter(id=>id.startsWith('steering-'))},pedal:{pivot:pedalPivot.toArray(),angle:state.brake*.12},halfshafts:halfshafts.map(s=>({side:s.side,inner:s.inner.toArray(),outer:s.currentOuter.toArray(),baseLength:s.baseLength,length:s.inner.distanceTo(s.currentOuter),plunge:s.plunge,rigidScale:1})),dampers:dampers.map(d=>({name:d.name,length:d.aa.distanceTo(d.bb),baseLength:d.length,compression:d.compression,coilLength:d.currentSpringLength,sourceSpring:d.spring.userData.id,sourceParts:d.parts.length,a:d.aa.toArray(),b:d.bb.toArray(),seatDefinition:{fromA:d.seats.start,fromB:d.seats.end,sourceAxisSpan:d.springLength,bodyEnd:d.bodyEnd},wireDiameter:2*d.wire,baseWireDiameter:2*d.wire,activePitch:d.springShape.activePitch(d.currentSpringLength),rodOverlap:d.rodOverlap,sourceInventory:d.inventory.map(({number,...p})=>p),hiddenSourceIds:d.parts.filter(m=>replacedParts.has(m)).map(m=>m.userData.id)})),decoupler:decoupler?.diagnostics(),rearRockers:rearRockers.map(r=>({side:r.side,angle:r.angle,pushrodError:r.error})),pushrodErrors:[...new Set(bindings.values())].filter(b=>b.type==='rod').map(b=>b.error),ownedParts:bindings.size});
 // The native spring renderer reads only damper length. Keep the full public
 // diagnostic shape, while materialising inventories and linkage reports only
 // when an inspector requests those fields.
 const runtimeSteering={upperPivot:upperPivot.toArray(),upperAxis:upperAxis.toArray(),lowerPivot:lowerPivot.toArray(),lowerAxis:lowerAxis.toArray(),rackSense,rotating:[...bindings].filter(([,b])=>b.type==='upper'||b.type==='lower').map(([m])=>m.userData.id),fixed:[...fixed].filter(id=>id.startsWith('steering-'))};
 for(const key of ['rack','steer','angle','brake'])Object.defineProperty(runtimeSteering,key,{enumerable:true,get:()=>state[key]});
 const runtimeDampers=dampers.map(d=>({name:d.name,get length(){return d.aa.distanceTo(d.bb);},baseLength:d.length,get compression(){return d.compression;},get coilLength(){return d.currentSpringLength;},sourceSpring:d.spring.userData.id,sourceParts:d.parts.length,get a(){return d.aa.toArray();},get b(){return d.bb.toArray();},seatDefinition:{fromA:d.seats.start,fromB:d.seats.end,sourceAxisSpan:d.springLength,bodyEnd:d.bodyEnd},wireDiameter:2*d.wire,baseWireDiameter:2*d.wire,get activePitch(){return d.springShape.activePitch(d.currentSpringLength);},rodOverlap:d.rodOverlap,sourceInventory:d.inventory.map(({number,...p})=>p),hiddenSourceIds:d.parts.filter(m=>replacedParts.has(m)).map(m=>m.userData.id)}));
 const runtimeDiagnostics={jointRegistration:registration,steering:runtimeSteering,dampers:runtimeDampers,ownedParts:bindings.size};
 for(const key of ['rearToeRods','pedal','halfshafts','decoupler','rearRockers','pushrodErrors'])Object.defineProperty(runtimeDiagnostics,key,{enumerable:true,get:()=>diagnostics()[key]});
 update({},corners,0);
 return {root,owns:m=>bindings.has(m),isMoving:m=>{const binding=bindings.get(m);return !!binding&&binding.type!=='fixed';},applyPart,update,syncAppearance,sourceVisibility,diagnostics,runtimeDiagnostics:()=>runtimeDiagnostics,motionState:()=>state,nativeSprings,hydraulics,
  dispose(){for(const d of dampers)for(const m of d.parts)if(m.userData.explosionAssembly===d.explosionAssembly)delete m.userData.explosionAssembly;hydraulics.dispose();resources.forEach(r=>r.dispose());root.clear();}
 };
}
