import * as T from './vendor/three.module.min.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';

// All source geometry is Z-up. The studio's ceiling and diffuse hemisphere
// must share that axis, otherwise top surfaces receive side-wall lighting.
export function createStudioLighting(renderer,scene,{shadows=true}={}){
 const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);
 room.rotation.x=Math.PI/2;room.updateMatrixWorld(true);
 const environment=pmrem.fromScene(room,.022).texture;
 scene.environment=environment;room.dispose();pmrem.dispose();
 const sky=new T.HemisphereLight(0xf3f4f4,0x5b5853,.32);sky.position.set(0,0,1);scene.add(sky);
 const key=new T.DirectionalLight(0xfff8ee,2.15);key.position.set(3.8,2.5,6.5);
 key.target.position.set(-.15,0,.35);scene.add(key.target);
 key.castShadow=shadows;key.shadow.mapSize.set(2048,2048);
 key.shadow.normalBias=.004;key.shadow.bias=-.00020;
 Object.assign(key.shadow.camera,{left:-3.7,right:3.7,top:3.7,bottom:-3.7,near:.1,far:17});scene.add(key);
 const rim=new T.DirectionalLight(0xf1f5fa,1.05);rim.position.set(-3.5,-4,4);scene.add(rim);
 const fill=new T.DirectionalLight(0xf3f5f6,.35);fill.position.set(-1,5,1.5);scene.add(fill);
 renderer.shadowMap.enabled=shadows;renderer.shadowMap.type=T.PCFSoftShadowMap;
 return {environment,key,dispose(){scene.remove(sky,key,key.target,rim,fill);key.shadow.map?.dispose();environment.dispose();}};
}
