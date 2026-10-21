import {sha256 as fallbackSha256} from './sha256-fallback-767.js';

const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const asBytes=value=>ArrayBuffer.isView(value)
 ?new Uint8Array(value.buffer,value.byteOffset,value.byteLength)
 :new Uint8Array(value);
let worker,nextRequest=0;
const pending=new Map();

function stop(error){
 worker?.terminate();worker=undefined;
 for(const task of pending.values()){clearTimeout(task.timer);task.reject(error);}
 pending.clear();
}

function backgroundDigest(bytes){
 if(!worker){
  worker=new Worker(new URL('./checksum-worker-767.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
   const task=pending.get(data.requestId);if(!task)return;
   pending.delete(data.requestId);clearTimeout(task.timer);
   if(data.error)task.reject(new Error(data.error));else task.resolve(data.hash);
  };
  worker.onerror=()=>stop(new Error('资源校验失败，请重新加载。'));
  worker.onmessageerror=()=>stop(new Error('资源校验结果读取失败，请重新加载。'));
 }
 const requestId=++nextRequest;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>stop(new Error('资源校验超时，请重新加载。')),60000);
  pending.set(requestId,{resolve,reject,timer});
  // Transfer a private copy: the renderer must keep its native attribute buffer.
  try{const copy=bytes.slice();worker.postMessage({requestId,bytes:copy},[copy.buffer]);}
  catch(error){pending.delete(requestId);clearTimeout(timer);reject(error);}
 });
}

export async function sha256(value){
 const bytes=asBytes(value);
 if(globalThis.crypto?.subtle)return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
 // HTTP on the NAS has no SubtleCrypto. Keep the same checksum verification;
 // asset workers hash locally, while the page sends hashing off its render thread.
 if(typeof document==='undefined')return hex(fallbackSha256(bytes));
 return backgroundDigest(bytes);
}
