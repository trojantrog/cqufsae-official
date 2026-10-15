import * as T from './vendor/three.module.min.js';
import {createBottleSource} from './bottle-source.js?v=746';
import {createClutchCompletion} from './clutch-completion.js?v=743';

export function createPowertrainCompletion(sources){
 const root=new T.Group(),bottleSource=createBottleSource(sources),bottle=bottleSource.root,clutchControl=createClutchCompletion(),clutch=clutchControl.root;
 root.name='powertrain-completion';root.add(bottle,clutch);
 const nativeClutch=sources.filter(mesh=>mesh.userData.nativeEngine&&mesh.userData.mechanism==='mo-clutch-control');
 let state={};
 function update(motion,focus,exploded){
  bottleSource.update(motion,focus,exploded);clutchControl.update(motion,focus,exploded);
  root.visible=bottle.visible||clutch.visible;state={...bottleSource.diagnostics(),...clutchControl.diagnostics(),sourceShiftLeverRetained:sources.some(m=>m.userData.id==='transmission-016'||m.userData.sourceOriginalId==='transmission-016')};
  if(nativeClutch.length)Object.assign(state,{clutchControlSource:'original-cad',clutchControlMeshes:nativeClutch.length,clutchActuation:'external-hand-control-only'});
 }
 return {root,items:bottleSource.items,bottle,clutch,update,diagnostics:()=>state,dispose(){bottleSource.dispose();clutchControl.dispose();root.clear();}};
}
