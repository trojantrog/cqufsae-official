import * as T from './vendor/three.module.min.js';

// The original STEP cable has two 8 mm circular terminal faces. The hand
// terminal is coaxial with the original housing port. Only the display copy
// bends when that housing follows its presentation path; the source stays intact.
const TERMINALS=Object.freeze({
 hand:[-.10413804849564356,.24180127727802844,.5198953308176653],
 engine:[-.7435213211130989,.08435548990529654,.2747331031603921]
});
const ENGINE_AXIS=[-.6912480708475228,-.6804138181807423,-.24333750343452418];
const CASE_CONTACT=[-.7498759825996414,.07810042798519135,.2724960951649689];
const V=value=>new T.Vector3(...value),smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};

export function createClutchCableConnection(sources=[]){
 const cable=sources.find(m=>m.userData.role==='clutch-cable-fixed');
 const housing=sources.find(m=>m.userData.role==='clutch-housing-fixed');
 const engineHost=sources.find(m=>m.userData.id==='casting-008-near');
 const root=new T.Group();root.name='clutch-cable-terminal';
 let state={ready:false,sourceCable:cable?.userData.id||null,handHost:housing?.userData.id||null,
  sourceGeometryPreserved:true,additionalMeshes:0,engineReleaseHost:null,engineTerminalSource:'native-cable-end-face',
  engineReleaseConnection:'source-installation-preserved',runtimeFlexibleGeometry:false};
 if(!cable||!housing)return {root,items:[],update(){root.visible=false;},diagnostics:()=>({...state}),framingPoints:()=>[],labels:()=>[],dispose(){}};
 const restCable=new T.Matrix4().fromArray(cable.userData.nativeRestMatrix||cable.userData.installationMatrix);
 const restHousing=new T.Matrix4().fromArray(housing.userData.nativeRestMatrix||housing.userData.installationMatrix);
 const restHousingInverse=restHousing.clone().invert(),restCableInverse=restCable.clone().invert();
 engineHost?.updateMatrix();const engineRest=engineHost?.matrix.clone()||new T.Matrix4(),engineRestInverse=engineRest.clone().invert();
 const original=cable.geometry,geometry=original.clone(),position=geometry.attributes.position;
 const base=original.attributes.position.array.slice(),baseNormal=original.attributes.normal.array.slice();
 const installed=new Float64Array(base.length),weights=new Float64Array(position.count),p=new T.Vector3();
 const start=TERMINALS.engine[0]+.025,end=TERMINALS.hand[0]-.025;
 for(let i=0;i<position.count;i++){
  p.fromArray(base,i*3).applyMatrix4(restCable);p.toArray(installed,i*3);
  weights[i]=smooth((p.x-start)/(end-start));
 }
 cable.geometry=geometry;position.setUsage(T.DynamicDrawUsage);
 const handLocal=V(TERMINALS.hand).applyMatrix4(restHousingInverse),handCableLocal=V(TERMINALS.hand).applyMatrix4(restCableInverse);
 const engineCableLocal=V(TERMINALS.engine).applyMatrix4(restCableInverse);
 const handDelta=new T.Matrix4(),engineDelta=new T.Matrix4(),identity=new T.Matrix4(),inverseCurrent=new T.Matrix4(),target=new T.Vector3();
 const handRest=V(TERMINALS.hand),engineTerminalRest=V(TERMINALS.engine),axis=V(ENGINE_AXIS);
 // A display ferrule fills the source's 9.193 mm axial clearance to the
 // verified case surface. It does not add or identify a clutch release actuator.
 const sleeveGeometry=new T.CylinderGeometry(.0046,.0046,1,18,1,false);
 const sleeveMaterial=new T.MeshPhysicalMaterial({color:0xb9bdbc,metalness:.74,roughness:.30,clearcoat:.15});
 sleeveMaterial.userData.presentation='polished-steel';
 const sleeve=new T.Mesh(sleeveGeometry,sleeveMaterial);sleeve.name='clutch-engine-terminal-sleeve';
 sleeve.userData={group:'engine',mechanism:'mo-clutch-control',role:'clutch-terminal-display',partCounted:false,illustrative:true,defocusWeight:0};
 sleeve.castShadow=sleeve.receiveShadow=true;root.add(sleeve);
 const sleeveStart=engineTerminalRest.clone().addScaledVector(axis,-.002),sleeveEnd=V(CASE_CONTACT).addScaledVector(axis,.0015);
 const up=new T.Vector3(0,1,0),sa=new T.Vector3(),sb=new T.Vector3(),direction=new T.Vector3();
 let changed=false;
 function syncPresentation(){
  const alpha=cable.material.opacity,material=sleeve.material;root.visible=!!engineHost&&cable.visible&&alpha>.002;material.opacity=alpha;material.depthWrite=alpha>.9999;
  sleeve.castShadow=!!cable.castShadow&&alpha>.9999;sleeve.renderOrder=cable.renderOrder;sleeve.userData.defocusWeight=cable.userData.defocusWeight||0;
  if(alpha<.9999&&!material.transparent){material.transparent=true;material.needsUpdate=true;}
 }
 function update(){
  cable.updateMatrix();housing.updateMatrix();
  handDelta.multiplyMatrices(housing.matrix,restHousingInverse);inverseCurrent.copy(cable.matrix).invert();
  if(engineHost){engineHost.updateMatrix();engineDelta.multiplyMatrices(engineHost.matrix,engineRestInverse);}else engineDelta.identity();
  const active=handDelta.elements.some((v,i)=>Math.abs(v-identity.elements[i])>1e-11)
   ||engineDelta.elements.some((v,i)=>Math.abs(v-identity.elements[i])>1e-11)
   ||cable.matrix.elements.some((v,i)=>Math.abs(v-restCable.elements[i])>1e-11);
  if(active){
   for(let i=0;i<position.count;i++){
    p.fromArray(installed,i*3);target.copy(p).applyMatrix4(handDelta);p.applyMatrix4(engineDelta).lerp(target,weights[i]);
    p.applyMatrix4(inverseCurrent).toArray(position.array,i*3);
   }
   position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();changed=true;
  }else if(changed){
   position.array.set(base);position.needsUpdate=true;geometry.attributes.normal.array.set(baseNormal);geometry.attributes.normal.needsUpdate=true;
   geometry.computeBoundingBox();geometry.computeBoundingSphere();changed=false;
  }
  const handTarget=handLocal.clone().applyMatrix4(housing.matrix);
  const handPoint=handRest.clone().applyMatrix4(handDelta),enginePoint=engineTerminalRest.clone().applyMatrix4(engineDelta);
  const handInCable=handPoint.clone().applyMatrix4(inverseCurrent),engineInCable=enginePoint.clone().applyMatrix4(inverseCurrent);
  sa.copy(sleeveStart).applyMatrix4(engineDelta);sb.copy(sleeveEnd).applyMatrix4(engineDelta);direction.subVectors(sb,sa);
  sleeve.position.copy(sa).add(sb).multiplyScalar(.5);sleeve.quaternion.setFromUnitVectors(up,direction.clone().normalize());sleeve.scale.set(1,direction.length(),1);
  syncPresentation();
  state={...state,ready:true,runtimeFlexibleGeometry:active,handEndpointError:handPoint.distanceTo(handTarget),
   handEndpoint:handPoint.toArray(),engineEndpoint:enginePoint.toArray(),
   handEndpointLocal:handInCable.toArray(),engineEndpointLocal:engineInCable.toArray(),
   nativeHandEndpointLocal:handCableLocal.toArray(),nativeEngineEndpointLocal:engineCableLocal.toArray(),
   enginePresentationHost:engineHost?.userData.id||null,additionalMeshes:engineHost?1:0,
   engineReleaseConnection:engineHost?'display-terminal-to-verified-case-surface':'source-installation-preserved',
   terminalBasis:'native-end-face-axis-and-raycast-case-contact',displayTerminalAdded:!!engineHost,
   caseContact:V(CASE_CONTACT).applyMatrix4(engineDelta).toArray(),nativeAxialGap:.009193025998251588,
   releaseActuatorAdded:false};
 }
 update();
 return {root,items:[cable,sleeve],update,syncPresentation,diagnostics:()=>({...state}),
  framingPoints(){return [handRest.clone(),engineTerminalRest.clone(),V(CASE_CONTACT)];},labels:()=>[],
  dispose(){if(cable.geometry===geometry)cable.geometry=original;geometry.dispose();sleeveGeometry.dispose();sleeveMaterial.dispose();root.clear();}
 };
}
