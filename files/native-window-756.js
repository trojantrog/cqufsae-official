// The colour and focus-mask passes share the same local panel aperture.
export function nativeWindowShader(shader,state){
 if(!state)return;
 Object.assign(shader.uniforms,{nativeWindowCentre:state.centre,nativeWindowU:state.u,nativeWindowV:state.v,nativeWindowN:state.n,nativeWindowExtent:state.extent,nativeWindowAlpha:state.alpha,nativeWindowAmount:state.amount});
 shader.vertexShader='varying vec3 vNativeWindowPosition;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvNativeWindowPosition=position;');
 shader.fragmentShader='varying vec3 vNativeWindowPosition;uniform vec3 nativeWindowCentre,nativeWindowU,nativeWindowV,nativeWindowN,nativeWindowExtent;uniform float nativeWindowAlpha,nativeWindowAmount;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec3 nw=vNativeWindowPosition-nativeWindowCentre;
 vec3 na=abs(vec3(dot(nw,nativeWindowU),dot(nw,nativeWindowV),dot(nw,nativeWindowN)));
 float ni=step(na.x,nativeWindowExtent.x)*step(na.y,nativeWindowExtent.y)*step(na.z,nativeWindowExtent.z);
 diffuseColor.a*=1.-ni*nativeWindowAmount*(1.-nativeWindowAlpha);`);
}
