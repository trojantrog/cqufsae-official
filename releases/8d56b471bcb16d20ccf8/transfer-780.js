// Public releases use an immutable CDN version and retain the origin as fallback.
export function resourceCandidates(input){
 const url=new URL(input),match=url.pathname.match(/^\/releases\/([a-f0-9]{20})\//);
 if(url.protocol==='https:'&&url.hostname==='cqufsae.cn'&&match){
  return ['https://cdn.jsdelivr.net/gh/trojantrog/cqufsae-official@web-'+match[1]+url.pathname,url.href];
 }
 return [url.href];
}

export async function readTransfer(response,{signal,onProgress=()=>{},touch=()=>{},prefix=new Uint8Array(0),limit=536870912}={}){
 const reader=response.body?.getReader();
 if(!reader){const bytes=new Uint8Array(await response.arrayBuffer());onProgress(bytes.length);return bytes;}
 const pieces=prefix.length?[prefix]:[];let size=prefix.length;
 try{
  for(;;){
   if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
   const {value,done}=await reader.read();if(done)break;
   if(!value?.length)continue;
   size+=value.length;if(size>limit)throw new Error('资源大小异常，请重新加载。');
   pieces.push(value);touch();onProgress(size);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const piece of pieces){bytes.set(piece,offset);offset+=piece.length;}
  return bytes;
 }catch(error){
  const bytes=new Uint8Array(size);let offset=0;
  for(const piece of pieces){bytes.set(piece,offset);offset+=piece.length;}
  error.partialBytes=bytes;throw error;
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

export function verifiedCache(name='cqufsae-model-780',storage=globalThis.caches){
 let opening;
 const open=()=>opening??=Promise.resolve().then(()=>storage?.open(name)).catch(()=>null);
 const key=hash=>'https://cqufsae.cn/.verified-model/'+hash;
 return {
  async get(hash){try{const response=await (await open())?.match(key(hash));return response?new Uint8Array(await response.arrayBuffer()):null;}catch{return null;}},
  async put(hash,bytes){try{const cache=await open();if(!cache)return;await cache.put(key(hash),new Response(bytes,{headers:{'Content-Length':String(bytes.length)}}));const keys=await cache.keys();if(keys.length>256)await cache.delete(keys[0]);}catch{}},
  async delete(hash){try{await (await open())?.delete(key(hash));}catch{}}
 };
}
