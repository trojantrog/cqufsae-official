import * as T from './vendor/three.module.min.js';

// A fixed display ramp covers the recorded near-car speed range. Only colour
// is remapped; saved velocities, travel times and native geometry stay intact.
const definitions=[[0,0x253bb5],[.50,0x136bdf],[.78,0x00b8dc],[.96,0x12c7a4],[1.04,0xf2df2b],[1.15,0xff8b24],[1.24,0xe92720],[1.50,0xcb1d2b]];
const stops=definitions.map(([speed,hex])=>[speed,new T.Color(hex)]);
export const flowColourScale=Object.freeze({
 quantity:'saved speed divided by inlet speed',inletSpeedMps:15,
 relativeSpeedRange:[0,1.50],speedMpsRange:[0,22.5],
 stops:definitions.map(([relativeSpeed,hex])=>({relativeSpeed,speedMps:relativeSpeed*15,colour:'#'+hex.toString(16).padStart(6,'0')}))
});
export function flowColour(relativeSpeed,out){
 let i=0;while(i<stops.length-2&&relativeSpeed>stops[i+1][0])i++;
 return out.copy(stops[i][1]).lerp(stops[i+1][1],T.MathUtils.clamp((relativeSpeed-stops[i][0])/(stops[i+1][0]-stops[i][0]),0,1));
}
