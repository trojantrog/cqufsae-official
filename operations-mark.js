import * as T from './vendor/three.module.min.js';
import { operationsVIS } from './operations-vis-data.js?v=744';

const V=(...v)=>new T.Vector3(...v),clamp=x=>T.MathUtils.clamp(x,0,1);
const ease=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const center=V(0,0,.64),view=operationsVIS.viewBox,unit=2/view[2];
const project=(x,y)=>V((x-view[0]-view[2]/2)*unit,0,-(y-view[1]-view[3]/2)*unit);

// The VIS asset contains three closed absolute M/L/C/Q/Z contours.
function readContour(d){
 const tokens=d.match(/[MLCQZ]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi),shape=new T.Shape();let i=0;
 const number=()=>Number(tokens[i++]);
 while(i<tokens.length){
  const command=tokens[i++];
  if(command==='M')shape.moveTo(number(),number());
  else if(command==='L')shape.lineTo(number(),number());
  else if(command==='C')shape.bezierCurveTo(number(),number(),number(),number(),number(),number());
  else if(command==='Q')shape.quadraticCurveTo(number(),number(),number(),number());
  else if(command==='Z')shape.closePath();
  else throw new Error(`Unsupported VIS path command: ${command}`);
 }
 return shape;
}

export function createOperationsMark(sources){
 const root=new T.Group();root.name='operations-vis-mark';
 const markLight={value:new T.Vector2()},markTangent={value:new T.Vector2(1,0)},markStrength={value:0};
 const perimeter=[],contours=[],triangles=[],meshes=[];let perimeterLength=0,area=0;
 for(const path of operationsVIS.paths){
  const shape=readContour(path.d),geometry=new T.ShapeGeometry(shape,36),position=geometry.attributes.position;
  for(let i=0;i<position.count;i++){const p=project(position.getX(i),position.getY(i));position.setXYZ(i,p.x,p.y,p.z);}
  position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new T.MeshBasicMaterial({color:path.fill,transparent:true,side:T.DoubleSide,depthWrite:false,toneMapped:false});
  material.onBeforeCompile=shader=>{
   shader.uniforms.markLight=markLight;shader.uniforms.markTangent=markTangent;shader.uniforms.markStrength=markStrength;
   shader.vertexShader='varying vec2 vMarkPosition;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMarkPosition=position.xz;');
   shader.fragmentShader='varying vec2 vMarkPosition;uniform vec2 markLight;uniform vec2 markTangent;uniform float markStrength;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec2 offset=vMarkPosition-markLight;
    float along=dot(offset,markTangent),across=dot(offset,vec2(-markTangent.y,markTangent.x));
    float glint=exp(-pow(along/.135,2.)-pow(across/.055,2.))*markStrength;
    diffuseColor.rgb=mix(diffuseColor.rgb,${path.id==='red-0'?'vec3(1.,.16,.19)':'vec3(.57,.70,.78)'},glint*.58);`);
  };
  material.customProgramCacheKey=()=>`operations-vis-flat-744-${path.id}`;
  const mesh=new T.Mesh(geometry,material);mesh.position.copy(center);mesh.position.y=path.id==='red-0'?.0002:0;
  mesh.name=`operations-vis-${path.id}`;mesh.userData.visSourcePath=path.id;
  mesh.userData.framingPoints=[geometry.boundingBox.min.clone(),geometry.boundingBox.max.clone()];
  root.add(mesh);meshes.push(mesh);
  const points=shape.getSpacedPoints(360).map(p=>project(p.x,p.y)),contourStart=perimeterLength;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],length=a.distanceTo(b);if(length<1e-7)continue;
   perimeterLength+=length;perimeter.push({a,b,length,end:perimeterLength});
  }
  contours.push({start:contourStart,end:perimeterLength});
  const index=geometry.index;
  for(let i=0;i<index.count;i+=3){
   const a=V().fromBufferAttribute(position,index.getX(i)),b=V().fromBufferAttribute(position,index.getX(i+1)),c=V().fromBufferAttribute(position,index.getX(i+2));
   const triangleArea=b.clone().sub(a).cross(c.clone().sub(a)).length()/2;
   if(triangleArea<1e-12)continue;
   area+=triangleArea;triangles.push({a,b,c,end:area});
  }
 }
 const count=2800,raw=[];
 for(const mesh of sources.filter(m=>m.userData.variant!=='e74')){
  const attribute=mesh.geometry.attributes.position,n=Math.min(28,attribute?.count||0);
  for(let i=0;i<n;i++){const j=Math.floor((i+.37)/n*attribute.count);raw.push(V(attribute.getX(j),attribute.getY(j),attribute.getZ(j)));}
 }
 if(!raw.length)raw.push(V());
 const sourcePoints=Array.from({length:count},(_,i)=>raw[(i*137)%raw.length].clone()),installed=sourcePoints.map(p=>p.clone());
 let triangleIndex=0;
 const target=Array.from({length:count},(_,i)=>{
  const at=(i+.5)/count*area;while(triangleIndex<triangles.length-1&&triangles[triangleIndex].end<at)triangleIndex++;
  const triangle=triangles[triangleIndex],u=Math.sqrt(((i*73+.31)%997)/997),v=((i*193+.17)%991)/991;
  return triangle.a.clone().multiplyScalar(1-u).addScaledVector(triangle.b,u*(1-v)).addScaledVector(triangle.c,u*v).add(center);
 });
 const cloudGeometry=new T.BufferGeometry(),cloudPositions=new Float32Array(count*3);
 cloudGeometry.setAttribute('position',new T.BufferAttribute(cloudPositions,3));
 const cloudMaterial=new T.PointsMaterial({color:0x61727a,size:.0032,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
 const cloud=new T.Points(cloudGeometry,cloudMaterial);cloud.frustumCulled=false;cloud.name='car-to-vis-traces';root.add(cloud);
 const point=V();let sweepStart=null,state={progress:0,assemblyScale:1,assemblyAlpha:1,markAlpha:0};
 return {root,meshes,
  setSourceTransform(matrix){sourcePoints.forEach((p,i)=>installed[i].copy(p).applyMatrix4(matrix));},
  update(progress,time){
   // The director eases this once over 4.6 seconds; preserve a continuous contraction.
   const p=clamp(progress),markAlpha=ease((p-.34)/.63),assemblyScale=1-.78*p,assemblyAlpha=1-ease((p-.16)/.75);
   root.visible=p>.00001;
   for(const mesh of meshes){mesh.visible=markAlpha>.001;mesh.material.opacity=markAlpha;mesh.scale.setScalar(.90+.10*p);}
   if(p<.1)sweepStart=null;
   if(p>.995&&sweepStart===null)sweepStart=time;
   const elapsed=sweepStart===null?0:Math.max(0,time-sweepStart),beat=(elapsed%7.6)/7.6,sweep=clamp((beat-.025)/.60);
   const distance=sweep*perimeterLength,segment=perimeter.find(s=>s.end>=distance)||perimeter[perimeter.length-1];
   point.copy(segment.a).lerp(segment.b,clamp((distance-segment.end+segment.length)/segment.length));
   markLight.value.set(point.x,point.z);markTangent.value.set(segment.b.x-segment.a.x,segment.b.z-segment.a.z).normalize();
   const contour=contours.find(c=>c.end>=distance)||contours.at(-1),handoffLength=perimeterLength*.12/(7.6*.60),contourFade=ease(Math.min(distance-contour.start,contour.end-distance)/handoffLength);
   markStrength.value=ease(beat/.055)*(1-ease((beat-.63)/.08))*ease((p-.9)/.1)*contourFade;
   cloudMaterial.opacity=Math.sin(Math.PI*p)**1.3*.52;cloud.visible=cloudMaterial.opacity>.002;
   if(cloud.visible){
    const blend=ease((p-.06)/.90);
    for(let i=0;i<count;i++){
     point.copy(installed[i]).sub(center).multiplyScalar(assemblyScale).add(center).lerp(target[i],blend);
     point.toArray(cloudPositions,i*3);
    }
    cloudGeometry.attributes.position.needsUpdate=true;
   }
   state={progress:p,assemblyScale,assemblyAlpha,markAlpha,sweep,sweepStrength:markStrength.value,contourFade};return state;
  },
  diagnostics:()=>({...state,source:'VIS operations',sourceSha256:operationsVIS.sourceSha256,sourcePathCount:meshes.length,profile:'flat-graphic',metalness:0,sourcePointCount:count}),
  dispose(){meshes.forEach(m=>{m.geometry.dispose();m.material.dispose();});cloudGeometry.dispose();cloudMaterial.dispose();root.clear();}
 };
}
