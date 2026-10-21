import {MeshoptDecoder} from './model-codec-782/meshopt_decoder.mjs';

// Transport decoding restores the original byte order before Three.js sees it.
export async function decodeMeshPacket(buffer,expectedLength){
 const source=new Uint8Array(buffer),view=new DataView(buffer);
 if(source.length<8||view.getUint32(0,true)!==0x3238374d)throw new Error('模型数据格式异常，请重新加载。');
 const count=view.getUint32(4,true),header=8+count*16;
 if(!count||count>16384||header>source.length)throw new Error('模型数据目录异常，请重新加载。');
 await MeshoptDecoder.ready;
 const result=new Uint8Array(expectedLength);let input=header,output=0;
 for(let i=0;i<count;i++){
  const at=8+i*16,length=view.getUint32(at,true),codec=view.getUint32(at+4,true),stride=view.getUint32(at+8,true),encoded=view.getUint32(at+12,true);
  if(!length||output+length>result.length||input+encoded>source.length)throw new Error('模型数据长度异常，请重新加载。');
  const bytes=source.subarray(input,input+encoded),target=new Uint8Array(length);
  if(codec===0){if(encoded!==length)throw new Error('模型数据长度异常，请重新加载。');target.set(bytes);}
  else if(codec===1){
   if(![2,4].includes(stride)||encoded!==length)throw new Error('模型数据格式异常，请重新加载。');
   const n=Math.floor(length/stride),aligned=n*stride;
   for(let j=0;j<stride;j++)for(let k=0;k<n;k++)target[k*stride+j]=bytes[j*n+k];target.set(bytes.subarray(aligned),aligned);
  }else if(codec===2){
   if(!stride||stride>256||stride%4||length%stride)throw new Error('模型数据格式异常，请重新加载。');
   MeshoptDecoder.decodeVertexBuffer(target,length/stride,stride,bytes);
  }else if(codec===3){
   if(![2,4].includes(stride)||length%stride)throw new Error('模型数据格式异常，请重新加载。');
   MeshoptDecoder.decodeIndexSequence(target,length/stride,stride,bytes);
  }else throw new Error('模型数据格式异常，请重新加载。');
  result.set(target,output);input+=encoded;output+=length;
 }
 if(input!==source.length||output!==result.length)throw new Error('模型数据传输不完整，请重新加载。');
 return result;
}
