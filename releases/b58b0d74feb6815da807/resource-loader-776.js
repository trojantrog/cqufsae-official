import {sha256} from './asset-checksum-767.js';
import {resourceCandidates,readTransfer,verifiedCache} from './transfer-780.js';

const root=new URL('./',import.meta.url);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const retryable=status=>status===408||status===429||status>=500;

export function unshuffleBytes(buffer){
 const source=new Uint8Array(buffer),result=new Uint8Array(source.length);
 const lane=Math.floor(source.length/4),aligned=lane*4;
 for(let i=0;i<lane;i++){const j=i*4;result[j]=source[i];result[j+1]=source[lane+i];result[j+2]=source[lane*2+i];result[j+3]=source[lane*3+i];}
 result.set(source.subarray(aligned),aligned);return result;
}

async function inflateChunk(buffer,length){
 if(typeof DecompressionStream!=='function'){
  const error=new Error('请更新浏览器后重新加载模型。');error.retryable=false;throw error;
 }
 const reader=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
 const result=new Uint8Array(length);let offset=0;
 try{
  for(;;){
   const {value,done}=await reader.read();if(done)break;
   if(offset+value.length>length)throw new Error('模型资源长度异常，请重新加载。');
   result.set(value,offset);offset+=value.length;
  }
  if(offset!==length)throw new Error('模型资源传输不完整，正在重试。');
  return result.buffer;
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

export function createAssetLoader({manifestURL=new URL('./model-stream-776/manifest.json',import.meta.url),baseURL=root,fetchImpl=globalThis.fetch.bind(globalThis),digest=sha256,nativeIntegrity=true,timeoutMs=20000,attempts=4,concurrency=4,retryDelay=350,candidates=resourceCandidates,cache=verifiedCache()}={}){
 let manifestPromise,active=0,disposed=false,completed=0,total=0,retries=0,received=0,cacheHits=0,resumedBytes=0,listener=()=>{};
 const pending=new Map(),queue=[],controllers=new Set(),registered=new Set(),completedChunks=new Set(),verifiedBuffers=new WeakMap();
 const partialProgress=new Map();
 const status=()=>({completed,total,active,retries,received,cacheHits,resumedBytes,progress:Math.min(total,completed+[...partialProgress.values()].reduce((a,b)=>a+b,0)),queued:queue.length});
 const emit=()=>listener(status());
 function schedule(task){
  return new Promise((resolve,reject)=>{queue.push({task,resolve,reject});drain();});
 }
 function drain(){
  while(!disposed&&active<concurrency&&queue.length){
   const job=queue.shift();active++;
   Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{active--;drain();emit();});
  }
 }
 function shared(key,task){
  if(pending.has(key))return pending.get(key);
  const result=task().finally(()=>pending.delete(key));pending.set(key,result);return result;
 }
 async function request(input,decode,integrity,options={}){
  const url=new URL(input,baseURL),sources=candidates(url),hash=integrity?Array.from(atob(integrity.slice(7)),c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(''):null;
  const responseFor=(bytes,type)=>new Response(bytes,{headers:{'Content-Type':type||'application/octet-stream'}});
  if(hash){
   const cached=await cache.get(hash);
   if(cached){
    if(cached.length===options.expectedBytes&&await digest(cached)===hash){cacheHits++;emit();return decode(responseFor(cached));}
    await cache.delete(hash);
   }
  }
  let partial=new Uint8Array(0),partialSource=null;
  for(let attempt=0;attempt<attempts;attempt++){
   if(disposed)throw new Error('资源读取已结束。');
   try{return await schedule(async()=>{
    const controller=new AbortController();controllers.add(controller);
    const source=partial.length?partialSource:sources[attempt%sources.length];
    const requestId=Symbol();let timer,lastSize=partial.length;
    const touch=(ms=timeoutMs)=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),ms);};
    touch();
    const hardLimit=setTimeout(()=>controller.abort(),600000);
    try{
     // Hash after streaming: native fetch SRI buffers the body before exposing progress.
     const response=await fetchImpl(source,{signal:controller.signal,cache:attempt?'reload':'default',...(partial.length?{headers:{Range:'bytes='+partial.length+'-'}}:{})});
     if(!response.ok){const error=new Error('资源读取失败，请稍后重试。');error.retryable=retryable(response.status)||(sources.length>1&&source!==url.href);await response.body?.cancel();throw error;}
     let prefix=new Uint8Array(0);
     if(response.status===206){
      const range=response.headers.get('Content-Range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      if(!partial.length||!range||Number(range[1])!==partial.length||Number(range[3])!==options.expectedBytes){await response.body?.cancel();partial=new Uint8Array(0);throw new Error('模型资源分段异常，正在重试。');}
      prefix=partial;resumedBytes+=partial.length;
     }else{partial=new Uint8Array(0);lastSize=0;}
     touch();
     let bytes;
     try{bytes=await readTransfer(response,{signal:controller.signal,prefix,limit:options.expectedBytes||536870912,touch,onProgress:size=>{
      received+=Math.max(0,size-lastSize);lastSize=size;
      if(options.rawBytes)partialProgress.set(requestId,size/options.expectedBytes*options.rawBytes);
      emit();
     }});}catch(error){
      // Explicit gzip model files support byte ranges; other HTTP encodings do not.
      if(hash&&options.expectedBytes&&!response.headers.get('Content-Encoding')&&error.partialBytes?.length<options.expectedBytes){partial=error.partialBytes;partialSource=source;}
      delete error.partialBytes;throw error;
     }
     partial=new Uint8Array(0);
     if(options.expectedBytes&&bytes.length!==options.expectedBytes)throw new Error('模型资源传输不完整，正在重试。');
     if(hash&&await digest(bytes)!==hash)throw new Error('模型资源校验失败，正在重试。');
     const value=await decode(responseFor(bytes,response.headers.get('Content-Type')));
     if(hash)await cache.put(hash,bytes);
     return value;
    }finally{clearTimeout(timer);clearTimeout(hardLimit);controllers.delete(controller);partialProgress.delete(requestId);}
   });}catch(error){
    if(partial.length&&attempt>0){partial=new Uint8Array(0);partialSource=null;}
    if(disposed||error.retryable===false||attempt===attempts-1)throw error;
    retries++;emit();await sleep(retryDelay*(attempt+1));
   }
  }
 }
 function json(input){const url=new URL(input,baseURL);return shared('json:'+url,()=>request(url,response=>response.json()));}
 async function manifest(){
  if(!manifestPromise)manifestPromise=json(manifestURL).then(value=>{
   if(value.schemaVersion!==1||value.codec!=='byte-lanes-4'||!value.assets||(value.compression!==undefined&&value.compression!=='gzip'))throw new Error('模型资源清单读取失败，请重新加载。');
   return value;
  }).catch(error=>{manifestPromise=null;throw error;});
  return manifestPromise;
 }
 function binary(input){
  const url=new URL(input,baseURL),identity=new URL(url);identity.search='';identity.hash='';
  return shared('binary:'+identity,async()=>{
   const catalog=await manifest(),base=new URL(baseURL);
   const key=identity.origin===base.origin&&identity.pathname.startsWith(base.pathname)?decodeURIComponent(identity.pathname.slice(base.pathname.length)):null;
   const record=key?catalog.assets[key]:null;
   if(!record)return request(url,response=>response.arrayBuffer());
   if(!Number.isSafeInteger(record.bytes)||record.bytes<1||!Array.isArray(record.chunks)||!record.chunks.length||!/^[a-f0-9]{64}$/.test(record.sha256))throw new Error('模型资源大小异常，请重新加载。');
   const compressed=catalog.compression==='gzip';let nextOffset=0;
   for(const chunk of record.chunks){
    if(chunk.offset!==nextOffset||!Number.isSafeInteger(chunk.bytes)||chunk.bytes<1||chunk.bytes>catalog.chunkBytes||!/^([a-f0-9]{64})$/.test(chunk.sha256)||chunk.file!=='chunks/'+chunk.sha256+'.bin'+(compressed?'.gz':'')||!/^([a-f0-9]{64})$/.test(chunk.decodedSHA256))throw new Error('模型资源分段异常，请重新加载。');
    if(compressed&&(!Number.isSafeInteger(chunk.encodedBytes)||chunk.encodedBytes<1||chunk.encodedBytes>catalog.chunkBytes+1024||!/^[a-f0-9]{64}$/.test(chunk.encodedSHA256)))throw new Error('模型压缩资源异常，请重新加载。');
    nextOffset+=chunk.bytes;
   }
   if(nextOffset!==record.bytes)throw new Error('模型资源长度异常，请重新加载。');
   if(!registered.has(key)){registered.add(key);total+=record.bytes;emit();}
   const result=new Uint8Array(record.bytes);let next=0,failure=null;
   const workers=Array.from({length:Math.min(concurrency,record.chunks.length)},async()=>{
    try{
    for(;;){
     if(failure)return;
     const index=next++;if(index>=record.chunks.length)return;
     const chunk=record.chunks[index];
     const transportHash=compressed?chunk.encodedSHA256:chunk.sha256;
     const integrity='sha256-'+btoa(String.fromCharCode(...transportHash.match(/../g).map(value=>parseInt(value,16))));
     const decoded=await request(new URL(chunk.file,manifestURL),async response=>{
      let encoded=await response.arrayBuffer();
      if(encoded.byteLength!==(compressed?chunk.encodedBytes:chunk.bytes))throw new Error('模型资源传输不完整，正在重试。');
      if(compressed)encoded=await inflateChunk(encoded,chunk.bytes);
      const bytes=unshuffleBytes(encoded);
      if(await digest(bytes)!==chunk.decodedSHA256)throw new Error('模型资源校验失败，正在重试。');
      return bytes;
     },integrity,{expectedBytes:compressed?chunk.encodedBytes:chunk.bytes,rawBytes:chunk.bytes});
     result.set(decoded,chunk.offset);
     const chunkKey=key+':'+index;
     if(!completedChunks.has(chunkKey)){completedChunks.add(chunkKey);completed+=chunk.bytes;emit();}
    }
    }catch(error){failure??=error;}
   });
   await Promise.all(workers);if(failure)throw failure;
   // Each decoded segment has been verified at its original offset. The
   // build also verifies the complete reconstruction against this identity.
   verifiedBuffers.set(result.buffer,record.sha256);return result.buffer;
  });
 }
 function dispose(){disposed=true;for(const controller of controllers)controller.abort();for(const job of queue.splice(0))job.reject(new Error('资源读取已结束。'));}
 return {binary,json,request,status,verifiedHash:buffer=>verifiedBuffers.get(buffer),subscribe(fn){listener=fn;emit();},dispose};
}

export const assetLoader=createAssetLoader();
export const loadBinary=input=>assetLoader.binary(input);
export const loadJSON=input=>assetLoader.json(input);
export async function loadTexture(loader,input){
 const blob=await assetLoader.request(input,response=>response.blob());
 const url=URL.createObjectURL(blob);
 try{return await loader.loadAsync(url);}finally{URL.revokeObjectURL(url);}
}
