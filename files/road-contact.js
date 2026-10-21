import * as T from './vendor/three.module.min.js';
import {solveCorner,solveTieRod} from './source-kinematics.js?v=761';
import {tyreSupportIndices} from './tyre-support-points.js?v=742';
const V=()=>new T.Vector3(),Q=()=>new T.Quaternion(),unit=new T.Vector3(1,1,1);
const tolerance=2e-6,cacheTolerance=1e-6;
function fingerprint(array){
 if(!(array instanceof Float32Array))return null;
 const words=new Uint32Array(array.buffer,array.byteOffset,array.length);let h=2166136261;
 for(const word of words)h=Math.imul(h^word,16777619)>>>0;return h;
}
// The displayed body attitude is prescribed. Only the four rigid, closed
// suspension mechanisms move to put an actual source tyre vertex on the road.
// This is geometric contact, not a tyre force/compliance or vehicle dynamics model.
export function createRoadContact(tyres,{corners,wheels,ground,roadHeight,roadHeightMaximum=null}){
 const front=corners.filter(c=>c.front&&c.tie),body=new T.Matrix4(),local=new T.Matrix4(),world=new T.Matrix4();
 const frame=Q(),wheelQ=Q(),worldCentre=V(),offset=V();let condition,previousCondition=null,stats={status:'not-run',corners:[]};
 const rows=tyres.map(mesh=>{
  const c=corners.find(c=>(mesh.userData.center[0]>0)===c.front&&Math.sign(mesh.userData.center[1])===c.side),source=wheels.find(w=>w.sourceId===mesh.userData.id);
  if(!c||!source)return null;
  const values=mesh.geometry.attributes.position.array,saved=tyreSupportIndices[mesh.userData.id],verified=saved?.count*3===values.length&&saved.fingerprint===fingerprint(values);
  const vertexIndices=Array.from({length:values.length/3},(_,i)=>i);
  function partition(indices){
   const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];for(const i of indices)for(let a=0;a<3;a++){const value=values[i*3+a];low[a]=Math.min(low[a],value);high[a]=Math.max(high[a],value);}
   const node={low,high};if(indices.length<=12){node.indices=indices;return node;}
   let axis=0;for(let a=1;a<3;a++)if(high[a]-low[a]>high[axis]-low[axis])axis=a;
   indices.sort((a,b)=>values[a*3+axis]-values[b*3+axis]);const half=indices.length>>>1;node.left=partition(indices.slice(0,half));node.right=partition(indices.slice(half));return node;
  }
  return {id:mesh.userData.id,c,values,tree:roadHeightMaximum?partition(vertexIndices):null,indices:verified?saved.indices:null,axis:new T.Vector3(...source.sourceAxis),centre:new T.Vector3(...source.sourceAxlePoint),kingpin:c.upper.outer.clone().sub(c.lower.outer).normalize(),exact:!verified};
 }).filter(Boolean);
 function pose(row,travel,rack){
  const c=row.c;c.travel=travel;c.solved=solveCorner(c,travel);c.camber=c.solved.camber;c.steer=0;
  if(c.tie)solveTieRod(c,c.front?rack:0);
  frame.copy(c.solved.uprightQ).multiply(Q().setFromAxisAngle(row.kingpin,c.steer));
  wheelQ.copy(frame).multiply(Q().setFromAxisAngle(row.axis,c.spin));
  worldCentre.copy(row.centre).sub(c.lower.outer).applyQuaternion(frame).add(c.solved.lower);
  offset.copy(worldCentre).sub(row.centre.clone().applyQuaternion(wheelQ));
  local.compose(offset,wheelQ,unit);world.multiplyMatrices(body,local);
 }
 function gap(row,travel,rack,full=false,bruteForce=false){
  pose(row,travel,rack);const a=row.values,e=world.elements,indices=full||row.exact?null:row.indices;
  let minimum=Infinity,supportIndex=-1;
  if(row.tree&&!bruteForce){
   const coordinate=(node,axis,maximum)=>{let value=e[12+axis];for(let j=0;j<3;j++){const coefficient=e[j*4+axis];value+=coefficient*((coefficient>=0)===maximum?node.high[j]:node.low[j]);}return value;};
   const bound=node=>coordinate(node,2,false)-ground-roadHeightMaximum(condition.x+coordinate(node,0,false),condition.x+coordinate(node,0,true),condition.y+coordinate(node,1,false),condition.y+coordinate(node,1,true));
   function visit(node,lower){
    if(lower>=minimum-1e-14)return;
    if(node.indices){for(const i of node.indices){const p=i*3,x=a[p],y=a[p+1],z=a[p+2],wx=e[0]*x+e[4]*y+e[8]*z+e[12],wy=e[1]*x+e[5]*y+e[9]*z+e[13],wz=e[2]*x+e[6]*y+e[10]*z+e[14],value=wz-ground-roadHeight(condition.x+wx,condition.y+wy);if(value<minimum){minimum=value;supportIndex=i;}}stats.vertexEvaluations+=node.indices.length;return;}
    const left=bound(node.left),right=bound(node.right);if(left<right){visit(node.left,left);visit(node.right,right);}else{visit(node.right,right);visit(node.left,left);}
   }
   visit(row.tree,bound(row.tree));stats.evaluations++;row.supportIndex=supportIndex;return minimum;
  }
  const count=indices?indices.length:a.length/3;stats.vertexEvaluations+=count;stats.evaluations++;
  for(let j=0;j<count;j++){
   const i=indices?indices[j]:j,p=i*3,x=a[p],y=a[p+1],z=a[p+2];
   const wx=e[0]*x+e[4]*y+e[8]*z+e[12],wy=e[1]*x+e[5]*y+e[9]*z+e[13],wz=e[2]*x+e[6]*y+e[10]*z+e[14];
   const value=wz-ground-roadHeight(condition.x+wx,condition.y+wy);
   if(value<minimum){minimum=value;supportIndex=i;}
  }
  row.supportIndex=supportIndex;return minimum;
 }
 function coordinateRack(rack,target){
  const average=r=>{front.forEach(c=>{c.steer=0;solveTieRod(c,r);});return front.reduce((s,c)=>s+c.steer,0)/Math.max(1,front.length);};
  for(let i=0;i<6&&front.length;i++){
   const value=average(rack);if(Math.abs(value-target)<1e-10)break;
   const slope=(average(rack+1e-4)-value)/1e-4;if(!Number.isFinite(slope)||Math.abs(slope)<.01)break;
   rack=T.MathUtils.clamp(rack+(target-value)/slope,-.028,.028);
  }
  stats.steeringResidual=average(rack)-target;return rack;
 }
 function solveRow(row,rack){
  let travel=row.c.travel,best=travel,bestError=Infinity;
  for(let i=0;i<7;i++){
   const error=gap(row,travel,rack)-row.target,valid=row.c.solved.feasible!==false&&Number.isFinite(error);
   if(valid&&Math.abs(error)<bestError){best=travel;bestError=Math.abs(error);}
   if(valid&&Math.abs(error)<tolerance*.1)break;
   if(!valid)break;
   const derivative=(gap(row,travel+1e-4,rack)-row.target-error)/1e-4;
   if(!Number.isFinite(derivative)||derivative<.2||derivative>3)break;
   const next=T.MathUtils.clamp(travel-T.MathUtils.clamp(error/derivative,-.008,.008),row.seed-.020,row.seed+.020);
   if(Math.abs(next-travel)<1e-10)break;travel=next;
  }
  pose(row,best,rack);
 }
 function solve({bodyQuaternion,bodyPosition,x,y,weight=1,rack=0,targetSteer=0}){
  stats={status:'solving',weight,expectedWheels:4,availableWheels:rows.length,iterations:0,fullPasses:0,evaluations:0,vertexEvaluations:0,steeringResidual:0,maxResidual:0,maxSubsetOverestimate:0,corners:[]};
  if(weight<=0){stats.status='inactive';return {rack,state:stats};}
  if(rows.length!==4||corners.length!==4||tyres.length!==4){stats.status='unavailable';stats.reason='incomplete-wheel-registration';return {rack,state:stats};}
  condition={x,y};body.compose(bodyPosition,bodyQuaternion,unit);const warm=previousCondition&&previousCondition.weight===weight&&Math.abs(x-previousCondition.x)<.1&&Math.abs(y-previousCondition.y)<.1;
  for(const row of rows){
   row.seed=row.c.travel;row.exact=!row.indices;row.target=0;row.cacheError=0;
   // During the overview/work transfer, contact is released continuously into
   // the exact source pose. At weight zero no source transform is corrected.
   if(weight<1){row.target=(1-weight)*gap(row,0,0,true);pose(row,row.seed,rack);}
   if(warm&&Number.isFinite(row.previousTravel))row.c.travel=T.MathUtils.clamp(row.previousTravel+row.seed-row.previousSeed,row.seed-.020,row.seed+.020);
  }
  rack=coordinateRack(rack,targetSteer);
  for(let pass=0;pass<6;pass++){
   stats.iterations=pass+1;for(const row of rows)solveRow(row,rack);
   rack=coordinateRack(rack,targetSteer);let complete=Math.abs(stats.steeringResidual)<1e-8;
   stats.maxResidual=0;
   // Full native-vertex verification makes the directional cache an accelerator,
   // not an assumption about the road normal, spin phase or geometry version.
   for(const row of rows){
    const travel=row.c.travel,candidate=gap(row,travel,rack),actual=gap(row,travel,rack,true);
    row.cacheError=Math.max(row.cacheError,candidate-actual);stats.maxSubsetOverestimate=Math.max(stats.maxSubsetOverestimate,candidate-actual);
    row.actual=actual;row.error=actual-row.target;stats.maxResidual=Math.max(stats.maxResidual,Math.abs(row.error));
    if(candidate-actual>cacheTolerance)row.exact=true;
    if(!Number.isFinite(actual)||Math.abs(row.error)>tolerance||row.c.solved.feasible===false||(row.c.tie?.error||0)>1e-7)complete=false;
   }
   stats.fullPasses++;
   if(complete){stats.status='converged';break;}
  }
  if(stats.status!=='converged')stats.status='unresolved';
  stats.rack=rack;stats.corners=rows.map(r=>{r.previousTravel=r.c.travel;r.previousSeed=r.seed;return {id:r.id,seedTravel:r.seed,travel:r.c.travel,correction:r.c.travel-r.seed,targetGap:r.target,actualGap:r.actual,residual:r.error,feasible:r.c.solved.feasible!==false,tieError:r.c.tie?.error||0,supportIndex:r.supportIndex,sourceVertices:r.values.length/3,cachedVertices:r.indices?.length||0,fullFallback:r.exact,maxSubsetOverestimate:r.cacheError};});previousCondition={x,y,weight};
  return {rack,state:stats};
 }
 function verify(){if(!condition||stats.weight<=0)return [];const rack=stats.rack??0;return rows.map(row=>{const accelerated=gap(row,row.c.travel,rack,true),full=gap(row,row.c.travel,rack,true,true);return {id:row.id,acceleratedGap:accelerated,fullGap:full,difference:Math.abs(accelerated-full),residual:Math.abs(full-(row.target??0))};});}
 return {solve,verify,diagnostics:()=>stats};
}
