import * as T from './vendor/three.module.min.js';
import {vehicleMaterial} from './presentation-materials.js?v=742';
import {engineRegistration} from './engine-registration.js?v=742';
import {createValveTrain,createCompressionSpring} from './engine-valvetrain.js?v=742';
// A coherent mechanism illustration registered to measured native case bounds.
// Internal dimensions and the six example gear pairs are presentation choices;
// they do not describe OEM CAD or a measured gearbox ratio.
export function createEngineCore(){
 const root=new T.Group();root.name='engine-internals';
 const resources=new Set(),Y=new T.Vector3(0,1,0),V=(...a)=>new T.Vector3(...a);
 const own=x=>(resources.add(x),x),mat=tag=>own(vehicleMaterial(tag));
 const alloy=mat('bright-alloy'),steel=mat('brushed-steel'),bright=mat('polished-steel'),bronze=mat('warm-alloy'),dark=mat('cast-ceramic'),seal=mat('soft-black');
 function mesh(geometry,material,parent=root){
  const n=geometry.attributes.normal;if(n)for(let i=0;i<n.count;i++){const length=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));if(length>1e-12)n.setXYZ(i,n.getX(i)/length,n.getY(i)/length,n.getZ(i)/length);}
  const m=new T.Mesh(own(geometry),material);parent.add(m);return m;
 }
 function cyl(r,h,material,parent,at=[0,0,0],axis='y',segments=48){const m=mesh(new T.CylinderGeometry(r,r,h,segments),material,parent);m.position.set(...at);if(axis==='z')m.rotation.x=Math.PI/2;return m;}
 function ring(r,tube,material,parent,at=[0,0,0],axis='y'){const m=mesh(new T.TorusGeometry(r,tube,8,64),material,parent);m.position.set(...at);if(axis==='y')m.rotation.x=Math.PI/2;return m;}
 function extrusion(shape,depth,material,parent){
  const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.0003,bevelThickness:.0003,bevelSegments:2,curveSegments:64,steps:1});g.translate(0,0,-depth/2);
  const p=g.attributes.position,n=g.attributes.normal,averages=new Map();
  const key=i=>Math.round(p.getX(i)*1e7)+','+Math.round(p.getY(i)*1e7);
  // Match duplicated side vertices around each swept curve while retaining
  // independent cap and bevel normals. Gear flanks use a separate hard profile.
  for(let i=0;i<p.count;i++)if(Math.abs(n.getZ(i))<.1){const k=key(i),sum=averages.get(k)||V();sum.x+=n.getX(i);sum.y+=n.getY(i);averages.set(k,sum);}
  for(let i=0;i<p.count;i++)if(Math.abs(n.getZ(i))<.1){const sum=averages.get(key(i)).clone().normalize();n.setXYZ(i,sum.x,sum.y,0);}
  return mesh(g,material,parent);
 }
 const nearWebMaterial=own(steel.clone()),nearPistonMaterial=own(alloy.clone());
 const R=.036,L=.115;const crank=new T.Group();crank.name='working-crank';root.add(crank);
 const webShape=new T.Shape();webShape.moveTo(-.035,.02);webShape.bezierCurveTo(-.061,-.025,-.055,-.057,0,-.060);webShape.bezierCurveTo(.055,-.057,.061,-.025,.035,.02);webShape.quadraticCurveTo(0,.059,-.035,.02);
 for(const sign of [-1,1]){const web=extrusion(webShape,.014,sign>0?nearWebMaterial:steel,crank);web.name=sign>0?'crank-web-near':'crank-web-far';if(sign>0)web.userData.detailOpacity=.12;web.rotation.x=Math.PI/2;web.position.y=sign*.025;cyl(.016,.024,bright,crank,[0,sign*.045,0]);ring(.017,.003,bronze,crank,[0,sign*.05,0]);}
 cyl(.012,.052,bright,crank,[0,0,R]);
 // The timing pinion sits on a reduced journal between the web and bearing.
 cyl(.014,.110,bright,crank);cyl(.007,.178,bright,crank);
 for(const sign of [-1,1])cyl(.014,.023,bright,crank,[0,sign*.075,0]);
 const piston=new T.Group();piston.name='working-piston';root.add(piston);
 // Turned crown, ring grooves, relieved skirt and a separate wrist pin.
 const profile=[new T.Vector2(.036,-.017),new T.Vector2(.040,-.015),new T.Vector2(.041,.012),new T.Vector2(.041,.016),new T.Vector2(.0395,.0167),new T.Vector2(.0395,.018),new T.Vector2(.041,.0187),new T.Vector2(.041,.021),new T.Vector2(.0395,.0217),new T.Vector2(.0395,.023),new T.Vector2(.041,.0237),new T.Vector2(.041,.028),new T.Vector2(.038,.031),new T.Vector2(0,.031)];
 for(const near of [false,true]){const crown=mesh(new T.LatheGeometry(profile,40,near?Math.PI/2:-Math.PI/2,Math.PI),near?nearPistonMaterial:alloy,piston);crown.name=near?'piston-shell-near':'piston-shell-far';crown.rotation.x=Math.PI/2;if(near)crown.userData.detailOpacity=.18;}
 for(const z of [.011,.0174,.0224])ring(.0403,.00075,seal,piston,[0,0,z],'z');
 cyl(.009,.088,bright,piston);for(const sign of [-1,1])ring(.009,.0012,bronze,piston,[0,sign*.044,0]);
 // The I-section rod has real large/small bores. Its length stays constant.
 const rod=new T.Group();rod.name='working-connecting-rod';root.add(rod);
 const rs=new T.Shape();rs.moveTo(-.018,0);rs.bezierCurveTo(-.018,-.025,.018,-.025,.018,0);rs.bezierCurveTo(.018,.012,.010,.018,.008,.030);rs.lineTo(.005,L-.017);rs.bezierCurveTo(.017,L-.007,.015,L+.014,0,L+.014);rs.bezierCurveTo(-.015,L+.014,-.017,L-.007,-.005,L-.017);rs.lineTo(-.008,.030);rs.bezierCurveTo(-.010,.018,-.018,.012,-.018,0);
 const big=new T.Path();big.absarc(0,0,.0125,0,Math.PI*2,true);rs.holes.push(big);const small=new T.Path();small.absarc(0,L,.0092,0,Math.PI*2,true);rs.holes.push(small);
 extrusion(rs,.013,bronze,rod);
 const recess=new T.Shape();recess.moveTo(-.004,.028);recess.lineTo(.004,.028);recess.lineTo(.0028,L-.02);recess.lineTo(-.0028,L-.02);recess.closePath();
 for(const sign of [-1,1]){const web=extrusion(recess,.001,steel,rod);web.position.z=sign*.0067;}
 // The cylinder bore is open in front; the native case supplies the outer wall.
 const sleeve=mesh(new T.CylinderGeometry(.042,.042,.132,72,1,true,-Math.PI/2,Math.PI),dark);sleeve.rotation.x=Math.PI/2;sleeve.position.z=.133;sleeve.name='cylinder-sleeve';
 const valvetrain=createValveTrain({root,own,mesh,cyl,annular,bright,steel,alloy,bronze});
 const {cams,valves,camZ}=valvetrain;
 cyl(.0042,.034,bright,root,[0,0,.228],'z',24);cyl(.006,.016,seal,root,[0,0,.25],'z');

 // Circular machined walls retain analytic radial normals and hard end faces.
 function annular(outer,inner,depth,material,parent=root,at=[0,0,0],axis='y'){
  const shape=new T.Shape();shape.absarc(0,0,outer,0,Math.PI*2,false);
  const hole=new T.Path();hole.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(hole);
  const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:48,steps:1});g.translate(0,0,-depth/2);
  const p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<p.count;i++)if(Math.abs(n.getZ(i))<.5){const x=p.getX(i),y=p.getY(i),r=Math.hypot(x,y),sign=n.getX(i)*x+n.getY(i)*y<0?-1:1;n.setXYZ(i,sign*x/r,sign*y/r,0);}
  const m=mesh(g,material,parent);m.position.set(...at);if(axis==='y')m.rotation.x=Math.PI/2;return m;
 }
 function joinStatic(objects,material,parent,name){
  const pieces=objects.map(o=>{o.updateMatrix();return o.geometry.clone().applyMatrix4(o.matrix);}),count=pieces.reduce((n,g)=>n+g.attributes.position.count,0),g=new T.BufferGeometry();
  for(const [key,width]of [['position',3],['normal',3]]){const data=new Float32Array(count*width);let offset=0;for(const p of pieces){data.set(p.attributes[key].array,offset);offset+=p.attributes.position.count*width;}g.setAttribute(key,new T.BufferAttribute(data,width));}
  const indices=[];let start=0;for(const p of pieces){const length=p.index?.count??p.attributes.position.count;for(let i=0;i<length;i++)indices.push(start+(p.index?p.index.getX(i):i));start+=p.attributes.position.count;p.dispose();}g.setIndex(indices);
  for(const o of objects){o.removeFromParent();resources.delete(o.geometry);o.geometry.dispose();}
  const m=mesh(g,material,parent);m.name=name;return m;
 }
 const nearSealMaterial=own(seal.clone()),nearRaceMaterial=own(steel.clone());
 const bearingBallGeometry=own(new T.SphereGeometry(.003,14,10));
 function bearing(name,axis,outer,bore,y,sign){
  const parent=new T.Group();parent.position.set(axis[0],sign*y,axis[2]);root.add(parent);
  const innerOuter=bore+(outer-bore)*.23,outerInner=outer-(outer-bore)*.23,ballRadius=(outerInner-innerOuter)*.475,ballTrack=(innerOuter+outerInner)/2;
  const raceMaterial=sign>0?nearRaceMaterial:steel;
  const races=joinStatic([annular(outer,outerInner,.007,raceMaterial,parent),annular(innerOuter,bore,.007,raceMaterial,parent)],raceMaterial,parent,name+(sign>0?'-near':'-far'));
  if(sign>0)races.userData.detailOpacity=.52;
  const count=12,balls=new T.InstancedMesh(bearingBallGeometry,bright,count),matrix=new T.Matrix4(),q=new T.Quaternion(),scale=V(ballRadius/.003,ballRadius/.003,ballRadius/.003);
  balls.name=name+'-rolling-elements';parent.add(balls);
  for(let i=0;i<count;i++){const a=i*Math.PI*2/count;matrix.compose(V(Math.cos(a)*ballTrack,0,Math.sin(a)*ballTrack),q,scale);balls.setMatrixAt(i,matrix);}
  const cageParts=[ring(ballTrack,.00055,bronze,parent,[0,-ballRadius-.00055,0]),ring(ballTrack,.00055,bronze,parent,[0,ballRadius+.00055,0])];
  for(let i=0;i<count;i++){const a=(i+.5)*Math.PI*2/count;cageParts.push(cyl(.00055,2*(ballRadius+.00055),bronze,parent,[Math.cos(a)*ballTrack,0,Math.sin(a)*ballTrack],'y',8));}
  const cage=joinStatic(cageParts,bronze,parent,name+'-cage');
  cage.userData.structure='stationary bearing section; rolling motion not simulated';
  const sealY=sign*.0044;
  const lips=joinStatic([annular(outer,outer-.00085,.0012,seal,parent,[0,sealY,0]),annular(bore+.0008,bore,.0012,seal,parent,[0,sealY,0])],seal,parent,name+'-seal-lips');
  const membrane=annular(outer-.00085,bore+.0008,.00055,sign>0?nearSealMaterial:seal,parent,[0,sealY,0]);membrane.name=name+'-seal-membrane';
  if(sign>0)membrane.userData.detailOpacity=.065;
 }
 function support(name,axis){for(const sign of [-1,1])bearing(name,axis,.020,.010,.076,sign);}
 for(const sign of [-1,1])bearing('main-bearing',[0,0,0],.025,.014,.074,sign);
 // Wrist-pin bosses and bolted big-end caps sit on the moving rod.
 for(const sign of [-1,1]){
  cyl(.006,.010,steel,rod,[sign*.013,.005,0],'z',24);
  cyl(.0045,.014,bright,rod,[sign*.013,.006,0],'z',24);
  annular(.013,.0092,.003,steel,piston,[0,sign*.030,0]);
 }
 for(const side of [-1,1]){
  const bridge=mesh(new T.BoxGeometry(.068,.010,.011),alloy);bridge.position.set(0,side*.046,camZ+.009);
  for(const x of [-.026,.026])annular(.011,.0061,.008,steel,root,[x,side*.045,camZ]);
 }
 // The small near-side timing loop drives both camshafts at half crank speed.
 const timing=new T.Group();timing.name='timing-chain';root.add(timing);
 function gear(teeth,pitch,width,material,parent,at=[0,0,0],bore=.009){
  const shape=new T.Shape(),add=Math.min(.0015,pitch*.085),deduct=add*1.25;
  for(let tooth=0;tooth<teeth;tooth++)for(const [phase,r]of [[-.5,pitch-deduct],[-.30,pitch-deduct],[-.17,pitch+add],[.17,pitch+add],[.30,pitch-deduct]]){
   const a=(tooth+phase)*Math.PI*2/teeth,x=Math.cos(a)*r,y=Math.sin(a)*r;
   if(tooth===0&&phase===-.5)shape.moveTo(x,y);else shape.lineTo(x,y);
  }
  shape.closePath();const hole=new T.Path();hole.absarc(0,0,bore,0,Math.PI*2,true);shape.holes.push(hole);
  const g=new T.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false,curveSegments:32,steps:1});g.translate(0,0,-width/2);
  const m=mesh(g,material,parent);m.position.set(...at);m.rotation.x=Math.PI/2;m.userData.gearTeeth=teeth;m.userData.pitchRadius=pitch;
  return m;
 }
 const timingPitch=.0105;
 const timingDriver=gear(12,timingPitch,.004,steel,crank,[0,.061,0],.0071);timingDriver.name='crank-timing-sprocket';
 for(const {cam}of cams)gear(24,timingPitch*2,.004,steel,cam,[0,.061,0],.0061);
 // The convex tangent envelope of three sprockets is a continuous closed loop.
 const circlePoints=[];
 for(const [x,z,r]of [[0,0,timingPitch],[-.026,camZ,timingPitch*2],[.026,camZ,timingPitch*2]])for(let i=0;i<96;i++){const a=i*Math.PI/48;circlePoints.push({x:x+Math.cos(a)*r,z:z+Math.sin(a)*r});}
 circlePoints.sort((a,b)=>a.x-b.x||a.z-b.z);
 const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x),lower=[],upper=[];
 for(const p of circlePoints){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
 for(const p of circlePoints.slice().reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
 const outline=lower.slice(0,-1).concat(upper.slice(0,-1)),chainCurve=new T.CatmullRomCurve3(outline.map(p=>V(p.x,.061,p.z)),true,'centripetal');
 chainCurve.arcLengthDivisions=2048;const chainLength=chainCurve.getLength(),linkCount=Math.round(chainLength/(Math.PI*2*timingPitch/12)),linkLength=chainLength/linkCount;
 const linkGeometry=own(new T.BoxGeometry(linkLength*.79,.00075,.0022)),pinGeometry=own(new T.CylinderGeometry(.00085,.00085,.0078,16)),chains=[];
 for(const side of [-1,1]){const m=new T.InstancedMesh(linkGeometry,steel,linkCount);m.name='timing-link-plates';timing.add(m);chains.push({m,side});}
 const chainPins=new T.InstancedMesh(pinGeometry,bright,linkCount);timing.add(chainPins);
 const matrix=new T.Matrix4(),quaternion=new T.Quaternion(),unitScale=V(1,1,1),chainX=V(1,0,0);
 function updateTiming(angle){
  for(let i=0;i<linkCount;i++){
   const u=((i/linkCount-angle*timingPitch/chainLength)%1+1)%1,p=chainCurve.getPointAt(u),t=chainCurve.getTangentAt(u);
   quaternion.setFromUnitVectors(chainX,t);
   for(const {m,side}of chains){const at=p.clone();at.y+=side*.0032;matrix.compose(at,quaternion,unitScale);m.setMatrixAt(i,matrix);}
   matrix.compose(p,new T.Quaternion(),unitScale);chainPins.setMatrixAt(i,matrix);
  }
  for(const {m}of chains){m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();}
  chainPins.instanceMatrix.needsUpdate=true;chainPins.computeBoundingSphere();
 }
 const axes=engineRegistration.shafts;
 function shaftGroup(name,at){const g=new T.Group();g.name=name;g.position.fromArray(at);root.add(g);cyl(.0095,.164,bright,g);return g;}
 const input=shaftGroup('working-transmission-input',axes.input),output=shaftGroup('working-transmission-output',axes.output),balance=shaftGroup('balance-shaft',axes.balance);
 support('input-bearing',axes.input);support('output-bearing',axes.output);support('balance-bearing',axes.balance);
 const clutch=new T.Group();clutch.name='working-clutch';clutch.position.set(axes.input[0],.045,axes.input[2]);root.add(clutch);
 // Engaged multi-plate clutch: basket fingers locate friction tabs; alternating
 // steel plates locate on the splined inner hub. No unmodelled release motion.
 const basketParts=[annular(.055,.014,.002,alloy,clutch,[0,-.013,0]),annular(.055,.051,.002,alloy,clutch,[0,.013,0])];
 for(let i=0;i<12;i++){const a=i*Math.PI/6,f=mesh(new T.BoxGeometry(.003,.025,.007),alloy,clutch);f.position.set(Math.cos(a)*.053,0,Math.sin(a)*.053);f.rotation.y=-a;basketParts.push(f);}
 joinStatic(basketParts,alloy,clutch,'clutch-windowed-basket');
 const hubParts=[annular(.029,.014,.027,steel,clutch),annular(.048,.014,.002,steel,clutch,[0,-.00125,0])];
 for(let i=0;i<16;i++){const a=i*Math.PI/8,t=mesh(new T.BoxGeometry(.003,.024,.003),steel,clutch);t.position.set(Math.cos(a)*.0295,0,Math.sin(a)*.0295);t.rotation.y=-a;hubParts.push(t);}
 joinStatic(hubParts,steel,clutch,'clutch-splined-hub');
 const frictionParts=[],plateParts=[];
 for(let i=0;i<7;i++){
  const friction=i%2===0,material=friction?bronze:steel,parts=friction?frictionParts:plateParts,y=(i-3)*.00165+.0055;
  parts.push(annular(.048,.031,.0016,material,clutch,[0,y,0]));
  for(let j=0;j<(friction?12:16);j++){
   const a=(j+.5)*Math.PI*2/(friction?12:16),r=friction?.0504:.0303;
   const tab=mesh(new T.BoxGeometry(friction?.006:.0024,.0016,friction?.005:.0028),material,clutch);tab.position.set(Math.cos(a)*r,y,Math.sin(a)*r);tab.rotation.y=-a;parts.push(tab);
  }
 }
 joinStatic(frictionParts,bronze,clutch,'clutch-friction-discs');joinStatic(plateParts,steel,clutch,'clutch-driven-steel-plates');
 const pressureMaterial=own(alloy.clone()),pressure=annular(.043,.014,.0025,pressureMaterial,clutch,[0,.0125,0]);pressure.name='clutch-pressure-plate';pressure.userData.detailOpacity=.30;
 const clutchSpringParts=[],clutchBoltParts=[];
 for(let i=0;i<6;i++){
  const a=i*Math.PI/3,x=Math.cos(a)*.034,z=Math.sin(a)*.034;
  const seat=annular(.0055,.0021,.001,steel,clutch,[x,.0145,z]);clutchBoltParts.push(seat);
  const s=createCompressionSpring({own,mesh,material:bright,parent:clutch,radius:.0036,wire:.00055,turns:4,height:.0085,segments:72,sides:8}).object;
  s.name='clutch-pressure-spring';s.rotation.x=-Math.PI/2;s.position.set(x,.0156,z);clutchSpringParts.push(s);
  clutchBoltParts.push(cyl(.0018,.013,bright,clutch,[x,.020,z],'y',20));clutchBoltParts.push(cyl(.0048,.002,bright,clutch,[x,.02565,z],'y',6));
 }
 joinStatic(clutchSpringParts,bright,clutch,'clutch-pressure-springs');joinStatic(clutchBoltParts,bright,clutch,'clutch-spring-fasteners');
 function distance(a,b){return Math.hypot(a[0]-b[0],a[2]-b[2]);}
 function phaseFor(a,b,n1,n2){const phi=Math.atan2(b[2]-a[2],b[0]-a[0]);return (Math.PI-(n1+n2)*phi-n2*Math.PI)/n2;}
 const primaryDistance=distance(axes.crank,axes.input),primaryPhase=phaseFor(axes.crank,axes.input,20,60);
 gear(20,primaryDistance/4,.007,steel,crank,[0,.031,0],.0141);
 const primaryDriven=gear(60,primaryDistance*3/4,.007,steel,input,[0,.031,0],.0096);
 const primaryPhaseGroup=new T.Group();primaryPhaseGroup.rotation.y=primaryPhase;input.add(primaryPhaseGroup);primaryPhaseGroup.add(primaryDriven);
 const pairs=[],gearDistance=distance(axes.input,axes.output),pairTeeth=[[25,40],[27,38],[29,36],[31,34],[33,32],[35,30]];
 for(let i=0;i<pairTeeth.length;i++){
  const [driverTeeth,drivenTeeth]=pairTeeth[i],y=-.049+i*.013,driverPitch=gearDistance*driverTeeth/65,drivenPitch=gearDistance*drivenTeeth/65;
  const driver=gear(driverTeeth,driverPitch,.006,steel,input,[0,y,0]),carrier=new T.Group();carrier.position.set(0,y,0);output.add(carrier);
  driver.name='transmission-input-gear-'+i;
  const driven=gear(drivenTeeth,drivenPitch,.006,steel,carrier,[0,0,0]),phase=phaseFor(axes.input,axes.output,driverTeeth,drivenTeeth);
  driven.name='transmission-output-gear-'+i;
  carrier.rotation.y=phase;annular(.015,.0097,.007,bright,input,[0,y,0]);annular(.015,.0097,.007,bright,output,[0,y,0]);
  pairs.push({driver,carrier,driven,driverTeeth,drivenTeeth,phase,engaged:i===0});
 }
 // One dog sleeve fixes the illustrated ratio; the other mating gears freewheel.
 annular(.021,.010,.005,alloy,output,[0,-.0425,0]);
 for(let i=0;i<6;i++){const a=i*Math.PI/3,lug=mesh(new T.BoxGeometry(.004,.006,.003),steel,output);lug.position.set(Math.cos(a)*.017,-.0465,Math.sin(a)*.017);lug.rotation.y=-a;}
 const fork=mesh(new T.TorusGeometry(.022,.0022,8,64,Math.PI*1.35),bronze);fork.rotation.x=Math.PI/2;fork.position.set(axes.output[0],-.0425,axes.output[2]);
 cyl(.004,.156,bright,root,[axes.output[0]+.023,0,axes.output[2]+.080]);
 const forkArm=mesh(new T.BoxGeometry(.006,.003,.060),steel);forkArm.position.set(axes.output[0]+.023,-.0425,axes.output[2]+.050);
 const balanceDistance=distance(axes.crank,axes.balance),balancePhase=phaseFor(axes.crank,axes.balance,36,36);
 gear(36,balanceDistance/2,.006,steel,crank,[0,-.062,0],.0141);
 const balanceCarrier=new T.Group();balanceCarrier.rotation.y=balancePhase;balance.add(balanceCarrier);gear(36,balanceDistance/2,.006,steel,balanceCarrier,[0,-.062,0]);
 const weight=mesh(new T.CylinderGeometry(.018,.018,.018,64,1,false,0,Math.PI),steel,balance);weight.position.set(0,-.010,.009);
 const pump=shaftGroup('oil-pump-shaft',axes.oilPump);support('oil-pump-bearing',axes.oilPump);
 const pumpDistance=distance(axes.input,axes.oilPump),pumpPhase=phaseFor(axes.input,axes.oilPump,30,20);
 gear(30,pumpDistance*.6,.004,steel,input,[0,-.068,0]);
 const pumpCarrier=new T.Group();pumpCarrier.rotation.y=pumpPhase;pump.add(pumpCarrier);gear(20,pumpDistance*.4,.004,steel,pumpCarrier,[0,-.068,0]);
 annular(.021,.010,.010,dark,pump,[0,.055,0]);
 const flywheel=annular(.061,.0142,.004,steel,crank,[0,-.088,0]);flywheel.name='crank-flywheel';
 // Fixed lubrication drillings, cylinder studs and bearing seats connect the
 // rotating parts to the case rather than leaving isolated decorative gears.
 for(const x of [-.044,.044])for(const y of [-.043,.043])cyl(.0026,.142,bright,root,[x,y,.150],'z',24);
 const oilCurve=new T.CatmullRomCurve3([V(axes.oilPump[0],.060,axes.oilPump[2]),V(.065,.060,-.105),V(0,.060,-.025),V(-.041,.052,.074)]);
 mesh(new T.TubeGeometry(oilCurve,40,.0018,10,false),bronze);

 const state={valvetrain:valvetrain.diagnostics,angle:0,pin:V(),crankPin:V(),rodLength:L,outputAngle:0,
  drive:{primaryRatio:3,gearRatio:1.6,totalRatio:4.8,clutchAngle:0,outputAngle:0,gearPairs:[]},axes};

 function update(angle){
  state.angle=angle;const x=R*Math.sin(angle),z=R*Math.cos(angle),height=z+Math.sqrt(L*L-x*x);piston.position.z=height;crank.rotation.y=angle;
  state.crankPin.set(x,0,z);state.pin.set(0,0,height);rod.position.copy(state.crankPin);rod.quaternion.setFromUnitVectors(Y,state.pin.clone().sub(state.crankPin).normalize());
  valvetrain.update(angle);
  const inputAngle=-angle/3,outputAngle=angle/4.8;
  input.rotation.y=inputAngle;clutch.rotation.y=inputAngle+primaryPhase;output.rotation.y=outputAngle;balance.rotation.y=-angle;pump.rotation.y=-inputAngle*1.5;
  state.outputAngle=outputAngle;state.drive.clutchAngle=inputAngle;state.drive.outputAngle=outputAngle;
  state.drive.gearPairs=pairs.map(pair=>{
   const drivenAngle=-inputAngle*pair.driverTeeth/pair.drivenTeeth;
   pair.carrier.rotation.y=pair.phase+drivenAngle-outputAngle;
   return {driverTeeth:pair.driverTeeth,drivenTeeth:pair.drivenTeeth,driverAngle:inputAngle,drivenAngle,engaged:pair.engaged};
  });
  updateTiming(angle);

 }
 update(0);return {root,state,update,registration:engineRegistration,dispose(){resources.forEach(x=>x.dispose());root.clear();}};
}
