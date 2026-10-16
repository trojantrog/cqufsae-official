// Shared public navigation content for the prerecorded presentation.
export const departments = {
  all:{name:'一辆赛车的组成',copy:'查看部件的装配关系。选择部门，进入对应系统的工作演示。',tags:[],groups:[]},
  chassis:{name:'底盘',copy:'悬架、转向与制动共同影响赛车的姿态、行驶方向和减速过程。',tags:['suspension','steering','brakes'],groups:['suspension','steering','brakes']},
  structure:{name:'车身车架',copy:'车身组织赛车的外部形态，车架承载并连接各系统。',tags:['body','frame'],groups:['body','frame']},
  power:{name:'动力总成',copy:'从动力来源到车轮，完成能量储存、动力输出与传递。',tags:['engine','transmission','ecu','battery','wiring'],groups:['transmission','engine','ecu','battery','wiring']},
  driverless:{name:'无人',copy:'算法生成行驶路径，控制将规划结果转化为车辆运动。',tags:[],groups:['algorithm','control']},
  operations:{name:'运营部',copy:'车队组织、活动策划、对外传播与资源协调贯穿整车项目。',tags:[],groups:[]}
};
export const groups = {
  suspension:{name:'悬架',department:'chassis',tags:['suspension'],copy:'围绕轮胎接地、悬架几何和车辆姿态，完成设计、装配与调试。',related:'对应摆臂、立柱、减振器及相关轮端部件。'},
  steering:{name:'转向',department:'chassis',tags:['steering'],copy:'将驾驶员输入传递至车轮，协调转向传动关系和整车布置。',related:'对应方向盘、转向柱、转向机与横拉杆。'},
  brakes:{name:'制动',department:'chassis',tags:['brakes'],copy:'通过制动踏板、液压系统与轮端机构实现减速。',related:'对应制动踏板、制动盘与卡钳的概括外形。'},
  body:{name:'车身',department:'structure',tags:['body'],copy:'设计车身覆盖件及空气动力学外形，参与复合材料制作和安装。',related:'对应车身覆盖件、前后翼与底板。'},
  frame:{name:'车架',department:'structure',tags:['frame'],copy:'围绕载荷、空间与安装关系设计承载结构，协调各系统布置。',related:'对应管架与座舱承载结构。'},
  transmission:{name:'传动',department:'power',tags:['transmission'],copy:'把动力输出传递到车轮，完成传动机构的设计、布置与调试。',related:'对应主传动、差速器及半轴等驱动部件。'},
  engine:{name:'发动机（油）',short:'发动机',department:'power',vehicle:'c41',tags:['engine'],copy:'围绕发动机、离合及进气、排气、冷却系统开展设计、标定和测试。',related:'查看发动机、离合操纵、进排气和冷却部件，观察内部机构的工作过程。'},
  ecu:{name:'电控（电）',short:'电控',department:'power',vehicle:'e74',tags:['ecu'],copy:'完成车辆信号采集、系统通信与电控功能开发。',related:'观察电机控制器与电驱系统的联系。'},
  battery:{name:'电池（电）',short:'电池',department:'power',vehicle:'e74',tags:['battery'],copy:'参与动力电池系统的设计、装配、管理和验证。',related:'箱体与上部板件逐渐透明，展示电芯排列、模组和连接件。'},
  wiring:{name:'线路（电）',short:'线路',department:'power',vehicle:'e74',tags:['wiring'],copy:'设计并制作整车电气连接，完成线束布置与检查。',related:'通过局部开窗，观察高压盒内部元件与连接布置。'},
  algorithm:{name:'算法',department:'driverless',tags:[],copy:'环境感知、定位与路径规划共同生成赛车的行驶路径。',related:'观察 A08 激光雷达、深度相机及其安装结构。'},
  control:{name:'控制',department:'driverless',tags:[],copy:'将目标路径与速度转化为转向、驱动和制动指令。',related:'观察 A08 自动转向、制动执行机构与储气装置。'}
};
