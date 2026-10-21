import * as T from './vendor/three.module.min.js';
import {roadHeight,roadHeightMaximum,lanePath,COURSE_LENGTH} from './moose-maneuver.js?v=761';
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
function axis(segments){const out=[];for(const [a,b,spacing]of segments){const n=Math.ceil((b-a)/spacing);for(let i=0;i<n;i++)out.push(a+(b-a)*i/n);}out.push(segments.at(-1)[1]);return new Float32Array(out);}
function cell(values,x){if(x<values[0]||x>values.at(-1))return -1;let a=0,b=values.length-1;while(b-a>1){const m=(a+b)>>1;if(values[m]<=x)a=m;else b=m;}return Math.min(a,values.length-2);}
function hump(u,centre,width,height){const a=Math.abs(u-centre)/width;return a>=1?0:height*Math.cos(a*Math.PI/2)**4;}
// The road belongs to the world, outside the rotating vehicle assembly. Course
// coordinates translate past this local window; height and shading use the same
// road field as geometric tyre contact. The original vehicle is never moved here.
export function createRoadSurface({ground=-.024}={}){
 const root=new T.Group();root.name='moving-road-surface';
 const xs=axis([[-7,-1.7,.2],[-1.7,1.3,.025],[1.3,7,.2]]),ys=axis([[-6,-1.25,.2],[-1.25,1.25,.025],[1.25,6,.2]]),nx=xs.length,ny=ys.length,count=nx*ny;
 const positions=new Float32Array(count*3),normals=new Float32Array(count*3),colours=new Float32Array(count*4),indices=new Uint32Array((nx-1)*(ny-1)*6),neighbours=new Float32Array(count*4),heightVersions=new Uint32Array(count);
 const fade=(x,y)=>smooth((7-Math.abs(x))/1.2)*smooth((6-Math.abs(y))/1.2);
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const at=j*nx+i;positions.set([xs[i],ys[j],ground],at*3);normals[at*3+2]=1;colours.set([1,1,1,fade(xs[i],ys[j])],at*4);neighbours.set([xs[Math.max(0,i-1)],xs[Math.min(nx-1,i+1)],ys[Math.max(0,j-1)],ys[Math.min(ny-1,j+1)]],at*4);}
 let at=0;for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){const a=j*nx+i,b=a+1,c=a+nx,d=c+1;indices.set([a,b,d,a,d,c],at);at+=6;}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('normal',new T.BufferAttribute(normals,3));geometry.setAttribute('color',new T.BufferAttribute(colours,4));geometry.setAttribute('roadNeighbours',new T.BufferAttribute(neighbours,4));geometry.setIndex(new T.BufferAttribute(indices,1));
 geometry.boundingBox=new T.Box3(new T.Vector3(-7,-6,ground),new T.Vector3(7,6,ground+.057));geometry.boundingSphere=new T.Sphere(new T.Vector3(0,0,ground+.0285),Math.hypot(7,6,.0285));
 const material=new T.MeshStandardMaterial({color:0xc6c8c0,roughness:.94,metalness:0,vertexColors:true,transparent:true,opacity:0,depthWrite:false});
 const courseUniform={value:new T.Vector2()};
 // The unchanged sampled heightfield runs on its existing vertices. CPU
 // consumers evaluate only the cells touched by markings and cone feet.
 material.onBeforeCompile=shader=>{
  shader.uniforms.roadCourse=courseUniform;shader.uniforms.roadGround={value:ground};
  shader.vertexShader=`uniform vec2 roadCourse; uniform float roadGround; attribute vec4 roadNeighbours;
float roadHump(float u,float c,float w,float h){float a=abs(u-c)/w;return a>=1.?0.:h*pow(cos(a*1.5707963267948966),4.);}
float roadBlend(float y,float c){float a=clamp((y-c+.32)/.64,0.,1.);return a*a*(3.-2.*a);}
float roadVertexHeight(vec2 p){float u=mod(roadCourse.x+p.x,45.9),y=roadCourse.y+p.y;return roadGround+roadHump(u,12.8,1.5,.025)*(.48+.52*roadBlend(y,1.1))+roadHump(u,24.5,1.3,.020)*(1.-.65*roadBlend(y,1.6))+roadHump(u,32.5,1.2,.012);}
`+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nfloat roadDx=(roadVertexHeight(vec2(roadNeighbours.y,position.y))-roadVertexHeight(vec2(roadNeighbours.x,position.y)))/(roadNeighbours.y-roadNeighbours.x);\nfloat roadDy=(roadVertexHeight(vec2(position.x,roadNeighbours.w))-roadVertexHeight(vec2(position.x,roadNeighbours.z)))/(roadNeighbours.w-roadNeighbours.z);\nobjectNormal=normalize(vec3(-roadDx,-roadDy,1.));').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z=roadVertexHeight(position.xy);');
 };material.customProgramCacheKey=()=> 'moving-road-heightfield-761';
 const surface=new T.Mesh(geometry,material);surface.name='road-heightfield';surface.receiveShadow=true;surface.castShadow=false;surface.renderOrder=-3;root.add(surface);
 surface.userData.nativeMaskVertexPatch=material.onBeforeCompile;surface.userData.nativeMaskVertexKey='moving-road-heightfield-761';
 const lines=[];
 for(const side of [-1,0,1]){const g=new T.BufferGeometry(),a=new Float32Array(nx*3);g.setAttribute('position',new T.BufferAttribute(a,3).setUsage(T.DynamicDrawUsage));const m=new T.LineBasicMaterial({color:side?0x8c9797:0xa3aaa5,transparent:true,opacity:0,depthWrite:false}),line=new T.Line(g,m);line.name='road-mark-'+side;line.renderOrder=-2;root.add(line);lines.push({side,line});}
 const coneGeometry=new T.CylinderGeometry(.008,.032,.12,16);coneGeometry.rotateX(Math.PI/2);coneGeometry.translate(0,0,.069);
 const baseGeometry=new T.BoxGeometry(.083,.083,.009);baseGeometry.translate(0,0,.0045);
 const coneFades=new T.InstancedBufferAttribute(new Float32Array(20),1).setUsage(T.DynamicDrawUsage);coneGeometry.setAttribute('instanceFade',coneFades);baseGeometry.setAttribute('instanceFade',coneFades);
 const coneMaterial=(colour,roughness)=>{const m=new T.MeshStandardMaterial({color:colour,roughness,metalness:.03,transparent:true,opacity:0,depthWrite:false});m.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float instanceFade;\nvarying float roadConeFade;').replace('#include <begin_vertex>','#include <begin_vertex>\nroadConeFade = instanceFade;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float roadConeFade;').replace('vec4 diffuseColor = vec4( diffuse, opacity );','vec4 diffuseColor = vec4( diffuse, opacity * roadConeFade );');
 };m.customProgramCacheKey=()=> 'road-cone-fade-1';return m;};
 const coneMat=coneMaterial(0xbb805b,.64),baseMat=coneMaterial(0x757b76,.84),cones=new T.InstancedMesh(coneGeometry,coneMat,20),bases=new T.InstancedMesh(baseGeometry,baseMat,20);
 cones.name='road-cones';bases.name='road-cone-feet';cones.instanceMatrix.setUsage(T.DynamicDrawUsage);bases.instanceMatrix.setUsage(T.DynamicDrawUsage);cones.frustumCulled=false;bases.frustumCulled=false;root.add(cones,bases);
 let courseX=NaN,courseY=NaN,weight=0,updates=0,minHeight=ground,maxHeight=ground,placements=[];
 function vertexHeight(id){if(heightVersions[id]!==updates){const i=id%nx,j=Math.floor(id/nx);positions[id*3+2]=ground+roadHeight(courseX+xs[i],courseY+ys[j]);heightVersions[id]=updates;}return positions[id*3+2];}
 function triangle(x,y){const i=cell(xs,x),j=cell(ys,y);if(i<0||j<0)return null;const tx=(x-xs[i])/(xs[i+1]-xs[i]),ty=(y-ys[j])/(ys[j+1]-ys[j]),a=j*nx+i;
  return ty<=tx?{ids:[a,a+1,a+nx+1],weights:[1-tx,tx-ty,ty]}:{ids:[a,a+nx+1,a+nx],weights:[1-ty,tx,ty-tx]};
 }
 function heightAt(x,y){const t=triangle(x,y);return t?t.ids.reduce((z,id,i)=>z+vertexHeight(id)*t.weights[i],0):null;}
 function normalAt(x,y){const t=triangle(x,y),n=new T.Vector3(0,0,1);if(!t)return n;n.set(0,0,0);for(let k=0;k<3;k++){const id=t.ids[k],i=id%nx,j=Math.floor(id/nx),il=Math.max(0,i-1),ir=Math.min(nx-1,i+1),jl=Math.max(0,j-1),jr=Math.min(ny-1,j+1),dx=(vertexHeight(j*nx+ir)-vertexHeight(j*nx+il))/(xs[ir]-xs[il]),dy=(vertexHeight(jr*nx+i)-vertexHeight(jl*nx+i))/(ys[jr]-ys[jl]),length=Math.hypot(dx,dy,1);n.x-=dx/length*t.weights[k];n.y-=dy/length*t.weights[k];n.z+=1/length*t.weights[k];}return n.normalize();}
 function footPose(x,y,q){
  const footprintRadius=.0415;
  // Include neighbouring grid vertices: interpolation can extend a hump past
  // its analytic support by at most the grid's 0.2 m outer spacing.
  const flatRadius=footprintRadius+.2;
  if(roadHeightMaximum(courseX+x-flatRadius,courseX+x+flatRadius,courseY+y-flatRadius,courseY+y+flatRadius)===0){q.identity();return {height:ground+1e-6,normal:new T.Vector3(0,0,1),supported:x-footprintRadius>=xs[0]&&x+footprintRadius<=xs.at(-1)&&y-footprintRadius>=ys[0]&&y+footprintRadius<=ys.at(-1)};}
  const r=.0415,h=[heightAt(x-r,y),heightAt(x+r,y),heightAt(x,y-r),heightAt(x,y+r)];
  const normal=h.every(z=>z!==null)?new T.Vector3(-(h[1]-h[0])/(2*r),-(h[3]-h[2])/(2*r),1).normalize():normalAt(x,y);
  q.setFromUnitVectors(new T.Vector3(0,0,1),normal);
  const footprint=[[-r,-r],[r,-r],[r,r],[-r,r]].map(([a,b])=>{const p=new T.Vector3(a,b,0).applyQuaternion(q);return [x+p.x,y+p.y];});
  const bounds=[Math.min(...footprint.map(p=>p[0])),Math.max(...footprint.map(p=>p[0])),Math.min(...footprint.map(p=>p[1])),Math.max(...footprint.map(p=>p[1]))];
  const i0=cell(xs,bounds[0]),i1=cell(xs,bounds[1]),j0=cell(ys,bounds[2]),j1=cell(ys,bounds[3]);
  if(Math.min(i0,i1,j0,j1)<0)return {height:heightAt(x,y)??ground,normal,supported:false};
  let support=-Infinity;
  // On each clipped road triangle, road minus the rigid sole plane is linear.
  // Its maximum therefore occurs at a clipped polygon vertex. This includes
  // peaks inside the footprint and all crossed cell edges, not just four feet.
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
   const a=j*nx+i;for(const ids of [[a,a+1,a+nx+1],[a,a+nx+1,a+nx]]){
    let poly=ids.map(id=>[positions[id*3],positions[id*3+1],vertexHeight(id)]);
    for(let edge=0;edge<4&&poly.length;edge++){
     const p=footprint[edge],next=footprint[(edge+1)%4],dx=next[0]-p[0],dy=next[1]-p[1],distance=v=>dx*(v[1]-p[1])-dy*(v[0]-p[0]),out=[];
     for(let k=0;k<poly.length;k++){const u=poly[k],v=poly[(k+1)%poly.length],du=distance(u),dv=distance(v);if(du>=-1e-12)out.push(u);if((du<0)!==(dv<0)){const t=du/(du-dv);out.push(u.map((value,n)=>value+(v[n]-value)*t));}}
     poly=out;
    }
    for(const p of poly)support=Math.max(support,p[2]+(normal.x*(p[0]-x)+normal.y*(p[1]-y))/normal.z);
   }
  }
  return {height:Number.isFinite(support)?support+1e-6:(heightAt(x,y)??ground),normal,supported:Number.isFinite(support)};
 }
 function setWeight(requested){
  weight=clamp(requested);root.visible=weight>1e-5;material.opacity=weight*.20;coneMat.opacity=weight*.70;baseMat.opacity=weight*.60;
  for(const {side,line}of lines)line.material.opacity=weight*(side?.30:.19);
 }
 function update({courseX:x=0,courseY:y=0,weight:requested=0}={}){
  setWeight(requested);
  if(x===courseX&&y===courseY)return;
  courseX=x;courseY=y;updates++;courseUniform.value.set(x,y);minHeight=ground;maxHeight=ground+roadHeightMaximum(x-7,x+7,y-6,y+6);
  for(const {line,side}of lines){const p=line.geometry.attributes.position;for(let i=0;i<nx;i++){const px=xs[i],py=lanePath(x+px).y-y+side*.82,z=heightAt(px,py);p.setXYZ(i,px,py,(z??ground+roadHeight(x+px,y+py))+.0011);}p.needsUpdate=true;line.geometry.computeBoundingSphere();}
  const matrix=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),up=new T.Vector3(0,0,1),scale=new T.Vector3(1,1,1),spacing=COURSE_LENGTH/30,start=Math.floor((x-7)/spacing);placements=[];
  for(let i=0;i<20;i++){const worldX=(start+Math.floor(i/2)+1)*spacing,px=worldX-x,py=lanePath(worldX).y-y+(i%2?1:-1)*.82,foot=footPose(px,py,q),alpha=foot.supported?smooth((6.94-Math.abs(px))/1.2)*smooth((5.94-Math.abs(py))/1.2):0;p.set(px,py,foot.height);matrix.compose(p,q,scale);cones.setMatrixAt(i,matrix);bases.setMatrixAt(i,matrix);coneFades.setX(i,alpha);placements.push({index:i,point:p.toArray(),normal:up.clone().applyQuaternion(q).toArray(),fade:alpha});}
  cones.instanceMatrix.needsUpdate=true;bases.instanceMatrix.needsUpdate=true;coneFades.needsUpdate=true;
 }
 function diagnostics(){return {coordinateSpace:'scene-local X/Y; translated course sampling, no vehicle assembly rotation',courseOffset:[courseX,courseY],ground,surfaceOpacity:weight,shadowCoverageWeight:weight,visible:root.visible,bounds:{min:[-7,-6,minHeight],max:[7,6,maxHeight]},grid:{nx,ny,vertices:count,triangles:indices.length/3,contactSpacing:.025},geometryUpdates:updates,heightEvaluation:'vertex-shader-with-matching-cpu-cell-queries',lineLift:.0011,cones:placements.map(p=>({...p,point:[...p.point],normal:[...p.normal]}))};}
 update();
 return {root,surface,lines:lines.map(r=>r.line),cones,bases,update,setWeight,heightAt,diagnostics,dispose(){geometry.dispose();material.dispose();for(const {line}of lines){line.geometry.dispose();line.material.dispose();}coneGeometry.dispose();baseGeometry.dispose();coneMat.dispose();baseMat.dispose();root.clear();}};
}
