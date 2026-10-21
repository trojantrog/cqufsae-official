// Presentation routes only. Each exhaust entry is one existing native occurrence
// in 745-engine-web-evidence.json; no source body is cut or duplicated here.
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const length=a=>Math.hypot(...a),scale=(a,k)=>a.map(v=>v*k);
const flange=[-.12,.80,.45],header=[-.28,1.40,.46],portAxis=[.798933815339771,0,-.601418954395883];
// Exact installed cylinder axes from the original silencer and port STEP faces.
const silencer=[-.62,1.45,.20],axis=[-.999106729243976,-.004396184063,.042028765685999],support=[-.45,1.65,.05];
const exhaust=new Map([
 [1,{family:'exhaust-port-gasket',source:'Exaust_QianDuan.CATPart',end:flange}],
 [2,{family:'exhaust-header',source:'Exaust_QianDuan2.CATPart',end:header}],
 [3,{family:'silencer-shell',source:'muffer_body.CATPart',end:silencer}],
 [4,{family:'silencer-outlet',source:'muffler_Pipe.CATPart',end:add(silencer,scale(axis,.36))}],
 [5,{family:'silencer-inlet',source:'muffler_Pipe2.CATPart',end:add(silencer,scale(axis,-.37))}],
 [6,{family:'silencer-baffle',source:'muffler_DangBan.CATPart',end:add(silencer,scale(axis,.225))}],
 [7,{family:'exhaust-port-flange',source:'Exaust2.CATPart',end:add(flange,scale(portAxis,.055))}],
 [8,{family:'exhaust-port-hardware',source:'GB6170_M8.CATPart',end:add(flange,scale(portAxis,.105))}],
 [9,{family:'exhaust-port-hardware',source:'GB6170_M8.CATPart',end:add(flange,scale(portAxis,.105))}],
 [10,{family:'exhaust-clamp',source:'Exaust_KaKu.CATPart',end:add(header,[.02,.085,-.05])}],
 [11,{family:'silencer-front-ear',source:'Muffler_ErZuo.CATPart',end:support}],
 [12,{family:'silencer-front-ear-hardware',source:'GB70_M6x20.CATPart',end:add(support,[0,.035,-.012])}],
 [13,{family:'silencer-front-ear-hardware',source:'GB6170_M6.CATPart',end:add(support,[0,.085,-.020])}],
 [14,{family:'silencer-stay',source:'Muffler_zhicheng.CATPart',end:add(support,[-.055,.010,.085])}],
 [15,{family:'silencer-rear-ear',source:'Muffer_Erzuo2.CATPart',end:add(support,[-.085,0,0])}],
 [16,{family:'silencer-rear-ear-hardware',source:'GB70_M6x20.CATPart',end:add(support,[-.085,.035,-.012])}],
 [17,{family:'silencer-rear-ear-hardware',source:'GB6170_M6.CATPart',end:add(support,[-.085,.085,-.020])}],
 [18,{family:'silencer-stay-hardware',source:'GB70_M6x20.CATPart',end:add(support,[-.055,.045,.080])}],
 [19,{family:'silencer-stay-hardware',source:'GB6170_M6.CATPart',end:add(support,[-.055,.095,.072])}]
]);

// Local fan bands fitted to the actual default projection. Only previously
// extracted near-side hardware moves; the body, aero and opposite side remain.
const smallPartFans=new Map([
 ["damper-002-piece-71",[-0.8943587,1.105866,0.4801425]],
 ["damper-002-piece-19",[-1.0257731,0.9068381,0.562853]],
 ["damper-001-piece-28",[0.0236038,0.4310152,1.0697449]],
 ["suspension-159",[0.0723511,0.4672252,1.3420726]],
 ["damper-001-piece-26",[-0.015506,0.6217094,1.0465498]],
 ["suspension-155",[0.2398831,0.3273698,1.0919935]],
 ["damper-002-piece-01",[-1.0473784,0.9703908,0.4267821]],
 ["suspension-005",[0.3388172,0.339106,1.0793616]],
 ["damper-002-piece-23",[-0.9841308,1.0106599,0.6608974]],
 ["damper-002-piece-27",[0.4838326,0.4605426,0.9540781]],
 ["suspension-002",[-0.2493323,0.3594244,1.3784655]],
 ["suspension-001",[-0.9792964,0.9260556,0.778462]],
 ["suspension-131",[-0.9942137,0.8964046,0.8010611]],
 ["suspension-130",[0.0141323,0.0991034,1.4217823]],
 ["damper-002-piece-62",[-1.1568612,1.0737767,0.5796397]],
 ["suspension-128",[-0.2160024,0.2905662,1.3594292]],
 ["damper-002-piece-20",[-0.1784027,0.4288289,1.3181]],
 ["suspension-023",[0.1089073,0.5803169,1.0637725]],
 ["damper-002-piece-67",[-0.8690174,1.3902047,0.4751155]],
 ["damper-002-piece-70",[0.4625303,0.5938724,0.9013917]],
 ["suspension-134",[0.2601704,0.447307,1.2211114]],
 ["damper-001-piece-18",[-0.03309,0.5168977,1.1485354]],
 ["suspension-137",[-0.0897745,0.2953531,1.2967444]],
 ["suspension-164",[0.2885247,0.485809,1.2359958]],
 ["suspension-136",[-0.0212274,0.4364294,1.356763]],
 ["suspension-135",[-0.377599,0.4058703,1.3386206]],
 ["damper-002-piece-31",[-0.9188825,1.1919285,0.6214508]],
 ["suspension-161",[-0.4810229,0.4221299,1.371468]],
 ["suspension-162",[0.0826668,0.2872814,1.2653271]],
 ["suspension-163",[0.1299922,0.4781533,1.3376821]],
 ["suspension-160",[0.2010596,0.4199824,1.328686]],
 ["damper-002-piece-82",[-0.9338138,0.7582954,1.1303665]],
 ["damper-002-piece-48",[0.3611058,0.4968343,1.0862083]],
 ["damper-002-piece-79",[-1.0552876,1.1351656,0.594097]],
 ["damper-001-piece-08",[-0.0625631,0.5731823,1.0054334]],
 ["damper-001-piece-10",[0.1750442,0.5871444,1.0989368]],
 ["damper-002-piece-47",[-0.0818636,0.400662,1.3191495]],
 ["damper-001-piece-12",[-0.0650396,0.5609508,1.167069]],
 ["damper-001-piece-36",[-0.040946,0.3844002,1.0630373]],
 ["damper-002-piece-34",[-1.1416314,0.9239999,0.4856589]],
 ["damper-002-piece-45",[0.2655441,0.4126171,1.1151017]],
 ["suspension-004",[0.3039026,0.3003602,1.2900191]],
 ["damper-002-piece-22",[-1.0572948,1.1078126,0.6889857]],
 ["damper-002-piece-36",[-0.886965,0.5689492,1.2424724]],
 ["damper-002-piece-12",[-0.1160016,0.3457145,1.3159279]],
 ["damper-002-piece-73",[-1.2675284,0.7249286,0.7627685]],
 ["damper-002-piece-64",[-1.1667568,0.8383867,0.8263704]],
 ["damper-002-piece-54",[0.2784518,0.3797304,1.1875216]],
 ["damper-002-piece-25",[0.4799137,0.3924326,1.0098939]],
 ["damper-001-piece-17",[-0.1272189,0.3384944,1.0049809]],
 ["damper-002-piece-50",[0.3531597,0.4960956,1.0563642]],
 ["damper-002-piece-49",[0.3210593,0.4709097,1.1262108]],
 ["damper-002-piece-33",[-0.1600047,0.3592676,1.4119678]],
 ["damper-001-piece-01",[0.0722439,0.1543078,1.0753036]],
]);

// The two unique intact native pipe bodies leave the installed cooler and
// radiator as reference. No hose is cut, rerouted or fabricated.
const uniquePipeRoutes=new Map([
 ["c41-engine-update-133",{"id":"c41-engine-update-133","end":[-0.8126089,1.5002473,-0.0145723],"source":"Cooling_pipe.CATPart"}],
 ["c41-engine-update-135",{"id":"c41-engine-update-135","end":[-1.1107134,1.7172101,0.3928511],"source":"Oil_Pipe.CATPart"}],
]);

export function createExplosionComposition(sources=[]){
 const changed=new Map();
 function route(d,end,controls,family,source,keepOrientation=false){
  if(changed.has(d.id))return;
  changed.set(d.id,{data:d,path:d.presentationPath,curve:d.presentationBezier,rotations:d.presentationRotations});
  d.presentationPath=[[0,0,0],end.slice()];d.presentationBezier=controls;
  if(!keepOrientation)delete d.presentationRotations;d.explosionComposition={family,source:source||null,version:751};
 }
 function append(list=[]){
  for(const m of list){
   const d=m.userData;if(d.variant==='e74'||d.variant==='a08')continue;
   const match=/^c41-engine-update-(\d+)$/.exec(d.id||''),definition=match&&exhaust.get(Number(match[1]));
   if(definition){
    const end=definition.end,release=[end[0]*.18,Math.min(-.12,end[1]*.32),Math.min(.20,end[2]*.40)];
    route(d,end,[[0,0,0],release,scale(end,.80),end.slice()],definition.family,definition.source);continue;
   }
   const pipe=uniquePipeRoutes.get(d.id);
   if(pipe){const end=pipe.end;route(d,end,[[0,0,0],[-.10,-.12,.16],add(scale(end,.78),[0,0,.15]),end.slice()],d.mechanism==='mo-cooling'?'cooling-pipe-assembly':'oil-pipe-assembly',pipe.source);continue;}
   const fan=smallPartFans.get(d.id);
   if(fan){const first=d.presentationPath?.[1]||[0,0,0],release=scale(first,Math.min(1,.16/Math.max(1e-9,length(first)))),front=d.id.startsWith('damper-001')||d.mechanism==='su-front_damper';
    route(d,fan,[[0,0,0],release,scale(fan,.80),fan.slice()],front?'front-damper-hardware-fan':'rear-suspension-hardware-fan',null,true);continue;
   }
   if(d.id==='body-003-near'){
    const end=[.20,.68,.82];route(d,end,[[0,0,0],[.10,.38,.12],[.20,.68,.68],end], 'near-body-cover');continue;
   }
   if(d.id==='body-006'){
    const end=[0,.38,-.19];route(d,end,[[0,0,0],[0,0,-.16],[0,.30,-.19],end], 'intact-floor-and-sidepods');continue;
   }
   if(d.mechanism==='fr-headrest'){
    const end=d.id==='body-001'?[-.14,-.80,.68]:[-.20,-.83,.66];
    route(d,end,[[0,0,0],[0,0,.84],[end[0],end[1],.84],end], 'cockpit-headrest');continue;
   }
   if(d.mechanism==='mo-power_unit'&&d.presentationPath?.length>2){
    const old=d.presentationPath,end=old.at(-1).slice(),first=old[1],extent=Math.max(...old.map(length));
    // Preserve the original release tangent, but remove the distant return loop.
    if(extent>length(end)*1.35){const release=scale(first,Math.min(1,.20/Math.max(1e-9,length(first))));
     route(d,end,[[0,0,0],release,add(scale(end,.72),[0,0,.10]),end], 'engine-case-layer');
    }
   }
  }
 }
 append(sources);
 return {append,diagnostics:()=>({version:751,sourceGeometryModified:false,sidepodsSplit:false,
  routes:[...changed.values()].map(({data:d})=>({id:d.id,...d.explosionComposition,end:d.presentationPath.at(-1),curve:d.presentationBezier})),
  exhaustParts:[...changed.values()].filter(({data:d})=>d.mechanism==='mo-exhaust').length}),
  dispose(){for(const {data,path,curve,rotations}of changed.values()){data.presentationPath=path;if(curve)data.presentationBezier=curve;else delete data.presentationBezier;if(rotations)data.presentationRotations=rotations;else delete data.presentationRotations;delete data.explosionComposition;}changed.clear();}};
}
