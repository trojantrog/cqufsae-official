import * as T from './vendor/three.module.min.js';

// Exact source vertices and normals retain their order and numeric values.
// Sharing immutable BufferAttributes also shares their GPU uploads.
const buffers=new WeakMap(),bounds=new WeakMap();
export function modelArray(buffer,descriptor,fallback=5126){
 const type=descriptor.componentType??fallback;
 const ArrayType=type===5123?Uint16Array:type===5125?Uint32Array:type===5126?Float32Array:null;
 const {byteOffset,count,itemSize}=descriptor;
 if(!ArrayType||!Number.isSafeInteger(byteOffset)||byteOffset<0||byteOffset%ArrayType.BYTES_PER_ELEMENT||
    !Number.isSafeInteger(count)||count<=0||!Number.isSafeInteger(itemSize)||itemSize<1||
    byteOffset+count*itemSize*ArrayType.BYTES_PER_ELEMENT>buffer.byteLength)throw new Error('Model attribute bounds');
 return new ArrayType(buffer,byteOffset,count*itemSize);
}
function attribute(buffer,descriptor,fallback){
 let cache=buffers.get(buffer);if(!cache){cache=new Map();buffers.set(buffer,cache);}
 const key=[descriptor.componentType??fallback,descriptor.byteOffset,descriptor.count,descriptor.itemSize].join('/');
 let result=cache.get(key);
 if(!result){result=new T.BufferAttribute(modelArray(buffer,descriptor,fallback),descriptor.itemSize);cache.set(key,result);}
 return result;
}
export function createModelGeometry(data,buffer){
 const geometry=new T.BufferGeometry(),position=attribute(buffer,data.position,5126);
 geometry.setAttribute('position',position);
 geometry.setIndex(attribute(buffer,data.index,5125));
 if(data.normal)geometry.setAttribute('normal',attribute(buffer,data.normal,5126));else geometry.computeVertexNormals();
 let box=bounds.get(position);
 if(!box){geometry.computeBoundingBox();geometry.computeBoundingSphere();box={box:geometry.boundingBox.clone(),sphere:geometry.boundingSphere.clone()};bounds.set(position,box);}
 else{geometry.boundingBox=box.box.clone();geometry.boundingSphere=box.sphere.clone();}
 return geometry;
}
