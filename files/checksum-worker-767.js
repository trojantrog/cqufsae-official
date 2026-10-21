import {sha256} from './sha256-fallback-767.js';

self.onmessage=({data})=>{
 try{
  const hash=Array.from(sha256(data.bytes),b=>b.toString(16).padStart(2,'0')).join('');
  self.postMessage({requestId:data.requestId,hash});
 }catch(error){self.postMessage({requestId:data.requestId,error:'资源校验失败，请重新加载。'});}
};
