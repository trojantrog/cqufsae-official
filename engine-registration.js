import * as T from './vendor/three.module.min.js';

// Measured from native casting-008-near/far vertices in c41.bin. These bounds
// register a mechanism illustration; shaft positions are presentation choices.
export const engineRegistration=Object.freeze({
 origin:[-.711,-.002,.233],cylinderAxis:[.544,0,.839],windowY:-.002,nearSide:1,
 caseEnvelope:{min:[-.1638315,-.0915006,-.1524217],max:[.1609477,.0915005,.1182040]},
 shafts:{crank:[0,0,0],input:[.029,0,-.060],output:[-.081,0,-.074],balance:[.072,0,.048],oilPump:[.095,0,-.040]},
 drive:{primaryDriverTeeth:20,primaryDrivenTeeth:60,engagedDriverTeeth:25,engagedDrivenTeeth:40,totalRatio:4.8}
});

export function registerEngineCore(core){
 core.root.position.fromArray(engineRegistration.origin);
 core.root.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(...engineRegistration.cylinderAxis).normalize());
 return core;
}
