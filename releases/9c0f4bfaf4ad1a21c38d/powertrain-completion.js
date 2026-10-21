import * as T from './vendor/three.module.min.js';
import {createBottleSource} from './bottle-source.js?v=761';
import {createClutchCompletion} from './clutch-completion.js?v=743';
import {createClutchCableConnection} from './clutch-cable-connection.js?v=771';

export function createPowertrainCompletion(sources){
 const root=new T.Group(),bottleSource=createBottleSource(sources),bottle=bottleSource.root,clutchControl=createClutchCompletion(),clutch=clutchControl.root,clutchCable=createClutchCableConnection(sources);
 root.name='powertrain-completion';root.add(bottle,clutch,clutchCable.root);
 const nativeClutch=sources.filter(mesh=>mesh.userData.nativeEngine&&mesh.userData.mechanism==='mo-clutch-control');
 let state={};
 function update(motion,focus,exploded){
  bottleSource.update(motion,focus,exploded);clutchControl.update(motion,focus,exploded);clutchCable.update(motion,focus,exploded);
  root.visible=bottle.visible||clutch.visible||clutchCable.root.visible;state={...bottleSource.diagnostics(),...clutchControl.diagnostics(),sourceShiftLeverRetained:sources.some(m=>m.userData.id==='transmission-016'||m.userData.sourceOriginalId==='transmission-016')};
  if(nativeClutch.length)Object.assign(state,{clutchControlSource:'original-cad',clutchControlMeshes:nativeClutch.length,clutchActuation:'external-hand-control-only'});
  state.clutchCable=clutchCable.diagnostics();
 }
 return {root,items:bottleSource.items,bottle,clutch,clutchCable,update,diagnostics:()=>state,dispose(){bottleSource.dispose();clutchControl.dispose();clutchCable.dispose();root.clear();}};
}
