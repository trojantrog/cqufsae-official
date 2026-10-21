// Geometry builders yield between bounded pieces, leaving the current vehicle
// presentation free to animate while the next system is prepared.
const clock=()=>globalThis.performance?.now?.()??Date.now();
export const yieldPreparation=()=>globalThis.scheduler?.yield?globalThis.scheduler.yield():new Promise(resolve=>setTimeout(resolve,0));
export async function prepareInSlices(iterator,{budgetMs=2,yieldTask=yieldPreparation,stopped=()=>false,onSlice=()=>{}}={}){
 let done=false,steps=0,slices=0,maxSliceMs=0;
 while(!done&&!stopped()){
  const start=clock();let sliceSteps=0;
  do{done=iterator.next().done;steps++;sliceSteps++;}while(!done&&!stopped()&&clock()-start<budgetMs);
  const duration=clock()-start;maxSliceMs=Math.max(maxSliceMs,duration);slices++;onSlice({duration,steps:sliceSteps,done});
  if(!done&&!stopped())await yieldTask();
 }
 return {ready:done&&!stopped(),steps,slices,maxSliceMs};
}
