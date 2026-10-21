import * as T from './vendor/three.module.min.js';
import {MUFFLER_OPENINGS} from './muffler-openings-774.js?v=774';

// Connected demonstration paths. Timing and branch weights are illustrative;
// the solid boundary and apertures below come from the original CAD geometry.
export const EXHAUST_ROUTES=[{
 name:'inlet-rear-return-front-outlet',start:0,points:[
 [-.050,.030,0],[.080,.030,0],[.270,.030,0],[.310,.030,0],[.325,.030,0],
 [.345,.026,-.004],[.358,.010,-.019],[.345,-.010,-.026],[.326,-.015,-.026],
 [.290,-.015,-.026],[.265,-.015,-.026],[.170,-.015,-.026],[.140,-.015,-.026],
 [.105,-.015,-.026],[.078,-.015,-.020],[.070,-.015,.005],[.080,-.015,.023],
 [.093,-.015,.026],[.100,-.015,.026],[.106,-.015,.026],[.130,-.015,.026],
 [.280,-.015,.026],[.450,-.015,.026],[.650,-.015,.026]]
},...[.175,.215,.255].map(x=>({name:'perforation-'+x,start:(x+.05)/.15,points:[
 [x,.030,0],[x,.022,0],[x,.016,0],[x,.010,0],[x,.004,.0055],
 [x,.003923137,.014976168],[x,-.001261284,.017996396],
 [x,-.007309775,.021520],[x+.006,-.015,.026],[x+.022,-.015,.026]]}))];

export function createExhaustFlowTexture(){
 const size=[256,64,64],min=[-.06,-.09,-.09],span=[.71,.18,.18],step=span.map((x,i)=>x/size[i]);
 const count=size[0]*size[1]*size[2],field=new Float32Array(count*4),distance=new Float32Array(count).fill(Infinity);
 const point=new T.Vector3(),previous=new T.Vector3();
 for(const route of EXHAUST_ROUTES){
  const curve=new T.CatmullRomCurve3(route.points.map(p=>new T.Vector3(...p)),false,'centripetal');curve.arcLengthDivisions=1024;
  const length=curve.getLength(),samples=Math.ceil(length/.0008);let travel=route.start;
  for(let i=0;i<=samples;i++){
   curve.getPointAt(i/samples,point);const [x,y,z]=point.toArray();
   const inlet=x<=.320&&Math.hypot(y-.030,z)<.0188,outlet=x>=.101&&x<=.450&&Math.hypot(y+.015,z-.026)<.0148;
   const tail=Math.max(0,(x-.450)/.2),speed=inlet?.15:outlet?.20:.075;
   if(i)travel+=point.distanceTo(previous)/speed;previous.copy(point);
   const radius=route.start? .006 : inlet?.019:outlet?.015:x>.45?.015+tail*.04:x>.320?.026:x>.105?.021:.024;
   const lo=[x,y,z].map((p,k)=>Math.max(0,Math.floor((p-radius-min[k])/step[k]))),hi=[x,y,z].map((p,k)=>Math.min(size[k]-1,Math.ceil((p+radius-min[k])/step[k])));
   for(let iz=lo[2];iz<=hi[2];iz++)for(let iy=lo[1];iy<=hi[1];iy++)for(let ix=lo[0];ix<=hi[0];ix++){
    const dx=min[0]+(ix+.5)*step[0]-x,dy=min[1]+(iy+.5)*step[1]-y,dz=min[2]+(iz+.5)*step[2]-z;
    const d=(dx*dx+dy*dy+dz*dz)/(radius*radius);if(d>1)continue;
    const index=ix+size[0]*(iy+size[1]*iz);if(d>=distance[index])continue;distance[index]=d;
    const k=index*4;field[k]=travel;field[k+1]=Math.sqrt(d);field[k+2]=inlet?1:outlet?.40:.67;field[k+3]=1;
   }
  }
 }
 // Half floats retain sub-frame phase precision without a full float volume.
 const half=new Uint16Array(field.length);for(let i=0;i<field.length;i++)half[i]=T.DataUtils.toHalfFloat(field[i]);
 const texture=new T.Data3DTexture(half,...size);texture.format=T.RGBAFormat;texture.type=T.HalfFloatType;
 texture.minFilter=texture.magFilter=T.LinearFilter;texture.wrapS=texture.wrapT=texture.wrapR=T.ClampToEdgeWrapping;texture.unpackAlignment=1;texture.needsUpdate=true;
 return texture;
}

const num=x=>Number(x).toFixed(10),v2=v=>'vec2('+v.map(num).join(',')+')';
function sideHoles(name,holes,start,end,pitch){return `float ${name}(vec3 p){
 float x=clamp(${num(start)}+floor((p.x-${num(start)})/${num(pitch)}+.5)*${num(pitch)},${num(start)},${num(end)}),d=1.;
 ${holes.map(([y,z,ny,nz])=>`d=min(d,length(vec2(p.x-x,dot(p.yz-${v2([y,z])},${v2([nz,-ny])}))));`).join('\n')}
 return 1.-smoothstep(.00160,.00173,d);}`;}
export const EXHAUST_DOMAIN_GLSL=`
 ${sideHoles('inletPerforations',MUFFLER_OPENINGS.inlet,.155,.275,.005)}
 ${sideHoles('outletPerforations',MUFFLER_OPENINGS.outlet,.155,.275,.005)}
 ${sideHoles('frontPerforations',MUFFLER_OPENINGS.front,.104,.146,.006)}
 float endPerforations(vec2 p){float d=1.;${MUFFLER_OPENINGS.end.map(p=>`d=min(d,distance(p,${v2(p)}));`).join('')}return 1.-smoothstep(.00185,.00198,d);}
 float gasDomain(vec3 p){
  float ri=length(p.yz-vec2(.030,0.)),ro=length(p.yz-vec2(-.015,.026)),rr=length(p.yz-vec2(-.015,-.026));
  if(p.x<-.050||p.x>.650)return 0.;
  if(p.x<.001)return 1.-smoothstep(.01885,.01898,ri);
  if(p.x>.399&&p.x<.450)return 1.-smoothstep(.01485,.01498,ro);
  if(p.x>=.450)return 1.;
  if(length(p.yz)>.05898)return 0.;
  float mask=1.;
  if(p.x<=.320&&ri>=.01898&&ri<=.02002)mask*=inletPerforations(p);
  if(p.x>=.100&&ro>=.01498&&ro<=.01602)mask*=max(outletPerforations(p),frontPerforations(p));
  if(p.x>=.100&&p.x<=.101&&ro<.01602)mask*=endPerforations(p.yz);
  if((p.x>=.149&&p.x<=.150)||(p.x>=.280&&p.x<=.281)){
   mask*=max(max(1.-step(.01898,ri),1.-step(.01498,ro)),1.-smoothstep(.01585,.01598,rr));
  }
  return mask;
 }
 vec4 routeField(vec3 p){vec4 f=texture(flowMap,(p-vec3(-.06,-.09,-.09))/vec3(.71,.18,.18));f.xyz/=max(f.a,.00001);return f;}
`;
