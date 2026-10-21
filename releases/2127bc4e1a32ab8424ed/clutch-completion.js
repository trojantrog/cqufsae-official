import * as T from './vendor/three.module.min.js';

// The supplied C41 assembly identifies a shift lever and its cable. It has no
// independently identified clutch hand control or verified release anchors.
export function createClutchCompletion(){
 const root=new T.Group();root.name='clutch-hand-control';root.visible=false;
 const state=Object.freeze({clutchControlSource:'unavailable',clutchControlMeshes:0,clutchControlAnchors:null,clutchActuation:null});
 return {root,items:[],update(){root.visible=false;},diagnostics:()=>({...state}),dispose(){root.clear();}};
}
