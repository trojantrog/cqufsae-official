import * as T from './vendor/three.module.min.js';

// Two opposite outward-facing marks, sampled onto the original sidewall profile.
// The wheel source mesh and its motion remain untouched.
export function createTyreSidewallMark(tyre,wheel,{rim}={}){
 if(!tyre?.geometry||!wheel||!rim?.geometry)throw new Error('Tyre sidewall mark requires its native wheel and rim');
 const center=new T.Vector3(...wheel.sourceAxlePoint),axis=new T.Vector3(...wheel.sourceAxis).normalize();
 const outward=axis.clone().multiplyScalar((Math.sign(wheel.side)||1)*(Math.sign(axis.y)||1));
 const up=new T.Vector3(0,0,1).addScaledVector(outward,-outward.z).normalize(),right=new T.Vector3().crossVectors(up,outward).normalize();
 const point=new T.Vector3(),radial=new T.Vector3(),position=tyre.geometry.attributes.position;
 function radiusOf(attribute){let radius=0;for(let i=0;i<attribute.count;i++){point.fromBufferAttribute(attribute,i).sub(center);point.addScaledVector(axis,-point.dot(axis));radius=Math.max(radius,point.length());}return radius;}
 const radius=radiusOf(position),rimRadius=radiusOf(rim.geometry.attributes.position);
 // Lettering stays in the clear sidewall band. A tyre mould's wordmark runs
 // circumferentially; its angular span is independent of the bitmap's padding.
 const bandMin=rimRadius+.005,bandMax=radius-.010,sizeScale=.9;
 if(bandMax<=bandMin)throw new Error('Tyre sidewall has no clear lettering band');
 const radialCenter=(bandMin+bandMax)*.5,height=(bandMax-bandMin)*sizeScale,arcRadians=Math.PI*.40*sizeScale,length=radialCenter*arcRadians;
 const radialMin=radialCenter-height*.5,radialMax=radialCenter+height*.5;
 const probeMaterial=new T.MeshBasicMaterial({side:T.DoubleSide}),probe=new T.Mesh(tyre.geometry,probeMaterial),ray=new T.Raycaster();
 probe.updateMatrixWorld();const nx=112,ny=24,positions=[],normals=[],uv=[],indices=[];let minimumOutward=Infinity;
 try{
  for(let j=0;j<=ny;j++){
   const v=j/ny,r=radialCenter+(v-.5)*height;
   ray.set(center.clone().addScaledVector(up,r).addScaledVector(outward,.4),outward.clone().negate());
   const hit=ray.intersectObject(probe,false)[0];if(!hit)throw new Error('Enlarged tyre mark misses the original sidewall');
   const normal=hit.normal?.clone()||hit.face.normal.clone();if(normal.dot(outward)<0)normal.negate();normal.normalize();
   const axial=hit.point.clone().sub(center).dot(outward),nr=normal.dot(up),na=normal.dot(outward);
   for(let i=0;i<=nx;i++){
    const u=i/nx,angle=(u-.5)*length/radialCenter;
    radial.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(right,Math.sin(angle));
    const n=radial.clone().multiplyScalar(nr).addScaledVector(outward,na).normalize();
    point.copy(center).addScaledVector(radial,r).addScaledVector(outward,axial).addScaledVector(n,.0002);
    positions.push(...point.toArray());normals.push(...n.toArray());uv.push(u,v);
    minimumOutward=Math.min(minimumOutward,point.clone().sub(center).dot(outward));
   }
  }
 }finally{probeMaterial.dispose();}
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;indices.push(a,a+1,a+nx+2,a,a+nx+2,a+nx+1);}
 // A half-turn about the axle gives matching prints on the same outer sidewall.
 // Keep both patches in one mesh so the tyre's spin and visibility stay shared.
 const verticesPerMark=positions.length/3,indicesPerMark=indices.length,normal=new T.Vector3();
 for(let i=0;i<verticesPerMark;i++){
  point.fromArray(positions,i*3).sub(center);const axial=point.dot(outward);point.negate().addScaledVector(outward,2*axial).add(center);
  normal.fromArray(normals,i*3);const normalAxial=normal.dot(outward);normal.negate().addScaledVector(outward,2*normalAxial);
  positions.push(...point.toArray());normals.push(...normal.toArray());uv.push(uv[i*2],uv[i*2+1]);
 }
 for(let i=0;i<indicesPerMark;i++)indices.push(indices[i]+verticesPerMark);
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
 geometry.userData={nativeTyreMark:true,sourceId:wheel.sourceId,side:wheel.side,marksPerTyre:2,placementDegrees:[0,180],verticesPerMark,sizeScale,height,length,arcDegrees:arcRadians*180/Math.PI,rimRadius,radialMin,radialMax,rimClearance:radialMin-rimRadius,shoulderClearance:radius-radialMax,minimumOutward,offsetMetres:.0002};
 return geometry;
}
