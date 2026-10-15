// A repeated double lane change with continuous position, velocity and curvature.
// Roll/pitch and road-input gains are illustrative, uncalibrated.
const clamp=x=>Math.max(0,Math.min(1,x));
export const COURSE_LENGTH=45.9;
export function roadHeight(x,lateral=0){
 const u=((x%COURSE_LENGTH)+COURSE_LENGTH)%COURSE_LENGTH;
 // Smooth, compact road disturbances give each wheel a separate input.
 const hump=(centre,width,height)=>{const a=Math.abs(u-centre)/width;return a>=1?0:height*Math.cos(a*Math.PI/2)**4;};
 const blend=(value,centre)=>{const u=clamp((value-centre+.32)/.64);return u*u*(3-2*u);};
 return hump(12.8,1.5,.025)*(.48+.52*blend(lateral,1.1))+hump(24.5,1.3,.020)*(1-.65*blend(lateral,1.6))+hump(32.5,1.2,.012);
}
export function lanePath(x){
 const cycle=Math.floor(x/COURSE_LENGTH),local=x-cycle*COURSE_LENGTH;
 function step(a,b){const u=clamp((local-a)/(b-a)),l=b-a;
  return [u*u*u*(10+u*(-15+6*u)),30*u*u*(u-1)**2/l,60*u*(2*u*u-3*u+1)/(l*l)];}
 const a=step(6,17),b=step(23,34),width=2.8;
 const y=width*(a[0]-b[0]),dy=width*(a[1]-b[1]),ddy=width*(a[2]-b[2]);
 return {x,y,yaw:Math.atan(dy),curvature:ddy/(1+dy*dy)**1.5,dy};
}
export function mooseManeuver(t,wheelbase=1.54){
 const cycle=Math.floor(Math.max(0,t)/36),s=Math.max(0,t)-cycle*36;
 let x,speed,acceleration,brake=0;
 if(s<26){x=1.4*s;speed=1.4;acceleration=0;}
 else if(s<30){const u=(s-26)/4;x=36.4+.95*(s-26)+.45*4/Math.PI*Math.sin(Math.PI*u);speed=.95+.45*Math.cos(Math.PI*u);acceleration=-.45*Math.PI/4*Math.sin(Math.PI*u);brake=Math.sin(Math.PI*u);}
 else {const u=(s-30)/6;x=40.2+.95*(s-30)-.45*6/Math.PI*Math.sin(Math.PI*u);speed=.95-.45*Math.cos(Math.PI*u);acceleration=.45*Math.PI/6*Math.sin(Math.PI*u);}
 const path=lanePath(cycle*COURSE_LENGTH+x),physicalSpeed=speed/.22;
 const ay=physicalSpeed*physicalSpeed*path.curvature;
 const roll=Math.max(-.065,Math.min(.065,ay*.008));
 const pitch=brake*.030-acceleration*.022;
 const heave=.28*(roadHeight(path.x+wheelbase/2,path.y+.5)+roadHeight(path.x+wheelbase/2,path.y-.5)+roadHeight(path.x-wheelbase/2,path.y+.5)+roadHeight(path.x-wheelbase/2,path.y-.5))/4;
 const q=x/COURSE_LENGTH*(arc.length-1),i=Math.min(arc.length-2,Math.floor(q));
 const distance=cycle*arc.at(-1)+arc[i]+(arc[i+1]-arc[i])*(q-i);
 const stage=brake>.08?'制动减速':s>=30?'重新加速':Math.abs(path.curvature)<.006?'直行与回正':path.curvature>0?'向左转向':'向右转向';
 return {...path,progress:s/36,speed,brake,roll,pitch,heave,distance,steer:Math.atan(wheelbase*path.curvature),lateralAcceleration:ay,acceleration,stage};
}
const arc=[0];
for(let i=1;i<=2048;i++){const a=lanePath((i-1)*COURSE_LENGTH/2048),b=lanePath(i*COURSE_LENGTH/2048);arc.push(arc.at(-1)+Math.hypot(b.x-a.x,b.y-a.y));}
