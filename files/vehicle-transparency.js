// Fading closed CAD surfaces still need their per-fragment depth relationship.
// In particular, a tyre's rear wall must not paint over the nearer wheel rim.
// Draw sharp mechanisms first and fading context afterwards, retaining depth
// within the context. The same temporary state covers both color and focus mask.
const effectRoots=new Set(['moving-road-surface','aerodynamic-streamlines','autonomous-perception-demonstration','operations-vis-mark']);
const batteryCutaways=new Set(['accumulator-case','voltage-board','cell-locating-plate','module-frame','battery-component-plate']);

function isWindow(mesh){
 const d=mesh.userData;
 return !!(d.nativeWindowUniforms||d.windowSource||d.detailOpacity<1||
  d.variant==='e74'&&batteryCutaways.has(d.role)||d.aeroSection&&mesh.renderOrder===30);
}

export function createVehicleTransparency(){
 let active=false;
 function render(scene,draw){
  const root=scene.getObjectByName('shared-vehicle-study');
  if(active||!root)return draw();
  const materials=new Map(),orders=[];active=true;
  function visit(object){
   if(object.userData.illustrativeOverlay||effectRoots.has(object.name))return;
   const material=object.material;
   if(object.isMesh&&object.geometry&&material&&!Array.isArray(material)&&!isWindow(object)){
    if(!materials.has(material)){materials.set(material,material.depthWrite);material.depthWrite=true;}
    if(material.opacity<1){orders.push([object,object.renderOrder]);object.renderOrder=10+(1-material.opacity)*10;}
   }
   for(const child of object.children)visit(child);
  }
  try{visit(root);return draw();}
  finally{for(const [material,depthWrite]of materials)material.depthWrite=depthWrite;for(const [object,order]of orders)object.renderOrder=order;active=false;}
 }
 return {render};
}
