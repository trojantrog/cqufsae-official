// Optional WebGL2 GPU timing. A GPU interval is not a RAF frame-rate measure.
// https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/
export function createRenderTelemetry(renderer,{enabled=false}={}){
 const limit=4,windowSize=60;
 let gl=null,ext=null,supported=false,status=enabled?'unsupported':'disabled';
 let disposed=false,faulted=false,lost=false,label=null,active=null,pending=[];
 let recent=[],lastMs=null,count=0;
 function clearHistory(){recent=[];lastMs=null;count=0;}
 function remove(query){try{if(gl&&!gl.isContextLost())gl.deleteQuery(query);}catch{}}
 function clearPending(){for(const query of pending)remove(query);pending=[];}
 function release(){
  if(active){
   try{if(gl&&!gl.isContextLost()&&ext&&gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)===active.query)gl.endQuery(ext.TIME_ELAPSED_EXT);}catch{}
   remove(active.query);active=null;
  }
  clearPending();
 }
 function fail(){release();clearHistory();faulted=true;status='error';}
 function extension(){
  ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');supported=!!ext;
  status=supported?'ready':'unsupported';
 }
 if(enabled){
  try{
   gl=renderer.getContext();
   const methods=['getExtension','isContextLost','createQuery','deleteQuery','beginQuery','endQuery','getQuery','getQueryParameter','getParameter'];
   if(gl&&methods.every(name=>typeof gl[name]==='function')){
    if(gl.isContextLost()){lost=true;status='context_lost';}else extension();
   }else gl=null;
  }catch{fail();}
 }
 function ready(){
  if(!enabled||disposed||faulted||!gl)return false;
  if(gl.isContextLost()){
   // Context loss invalidates all query objects; do not submit cleanup calls.
   active=null;pending=[];clearHistory();lost=true;status='context_lost';return false;
  }
  if(lost){lost=false;extension();}
  return supported;
 }
 function disjoint(){
  if(!gl.getParameter(ext.GPU_DISJOINT_EXT))return false;
  clearPending();clearHistory();if(active)active.invalid=true;status='disjoint';return true;
 }
 function poll(){
  if(!ready()||disjoint())return false;
  const waiting=[],available=[];
  for(const query of pending){
   // Availability is checked first: QUERY_RESULT must never force a GPU wait.
   (gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)?available:waiting).push(query);
  }
  // A disjoint event may have arrived while availability was being checked.
  if(available.length&&disjoint())return false;
  for(const query of available){
   const ns=gl.getQueryParameter(query,gl.QUERY_RESULT);remove(query);
   if(Number.isFinite(ns)&&ns>=0){
    lastMs=ns/1e6;count++;recent.push(lastMs);if(recent.length>windowSize)recent.shift();
   }
  }
  pending=waiting;status=active?'active':pending.length?'pending':'ready';return true;
 }
 function begin(scope='render'){
  try{
   if(!poll())return false;
   if(active){status='busy';return false;}
   const nextLabel=String(scope);
   if(nextLabel!==label){clearPending();clearHistory();label=nextLabel;}
   if(pending.length>=limit){status='pending_full';return false;}
   // Respect timer queries created by another renderer feature or profiler.
   if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){status='busy';return false;}
   const query=gl.createQuery();if(!query){fail();return false;}
   active={query,invalid:false};gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
   if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)!==query){fail();return false;}
   status='active';return true;
  }catch{fail();return false;}
 }
 function end(){
  try{
   if(!ready()||!active)return false;
   const entry=active;
   if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)!==entry.query){fail();return false;}
   gl.endQuery(ext.TIME_ELAPSED_EXT);active=null;
   if(disjoint()||entry.invalid){remove(entry.query);status='disjoint';}
   else{pending.push(entry.query);status='pending';}
   return true;
  }catch{fail();return false;}
 }
 function snapshot(){
  try{poll();}catch{fail();}
  const values=[...recent].sort((a,b)=>a-b),n=values.length,middle=n>>1;
  return {enabled:!!enabled,supported,status,label,lastMs,count,
   medianMs:n?(n%2?values[middle]:(values[middle-1]+values[middle])/2):null,
   p95Ms:n?values[Math.ceil(n*.95)-1]:null,pending:pending.length};
 }
 function dispose(){
  if(disposed)return;
  release();clearHistory();disposed=true;status='disposed';
 }
 return {begin,end,snapshot,dispose};
}
