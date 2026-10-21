// Responsibilities follow the team's department copy; anchors use installed CAD parts.
export const RECRUITMENT_GROUPS = {
  suspension: {
    title: '悬架组', system: '悬架系统',
    purpose: '悬架引导车轮相对车架运动，传递轮胎载荷，控制车身振动与姿态。',
    work: ['设计摆臂、立柱与减振机构，校核零件受力', '分析轮跳中的外倾、前束变化与运动干涉', '开展车辆动力学仿真，分析轮胎载荷和车身姿态', '完成装配、车轮定位测量与悬架调校'],
    anchor: {ids: ['suspension-068'], point: [-.904393,.348833,.321282]}
  },
  steering: {
    title: '转向组', system: '转向系统',
    purpose: '转向柱、转向机与横拉杆传递方向盘输入，控制前轮转角。',
    work: ['设计转向机构及安装结构，匹配转向传动比', '分析轮跳与转向时的车轮角度变化', '结合车辆动力学仿真，分析转向响应', '装配调试，检查机构行程、间隙与运动干涉'],
    anchor: {ids: ['steering-030'], point: [.6201,0,.1333]}
  },
  brakes: {
    title: '制动组', system: '制动系统',
    purpose: '制动踏板驱动主缸建立液压，卡钳夹紧制动盘，产生车轮制动力矩。',
    work: ['设计制动踏板，选配主缸、卡钳与制动盘', '结合车辆动力学仿真，匹配前后制动力', '分析制动时的轮胎载荷与车身姿态', '布置制动管路，完成装配与调试'],
    anchor: {ids: ['purchased-007'], point: [.9461,.0800,.2031]}
  },
  body: {
    title: '车身组', system: '车身与空气动力',
    purpose: '车身、翼面与底板引导周围气流，影响下压力、空气阻力与冷却进风。',
    work: ['设计车身、翼面、底板及安装结构', '开展空气动力学仿真，分析流场分布', '比较下压力、空气阻力与气动平衡，优化外形', '制作模具，完成碳纤维铺层与装配'],
    anchor: {ids: ['body-004'], point: [1.0943,0,.1708]}
  },
  frame: {
    title: '车架组', system: '车架与座舱',
    purpose: '车架承受各系统传来的载荷，为零部件安装和驾驶员乘坐提供结构支撑。',
    work: ['布置杆件和安装节点，协调各系统安装空间', '分析杆件、焊接节点与安装点的应力和变形，校核扭转刚度', '开展人机工程设计，检查坐姿、视野、上下车空间及方向盘、踏板和安全带布置', '完成下料、弯管、焊接与尺寸检查'],
    anchor: {ids: ['frame-016'], point: [-.6808,-.1579,.6751]}
  },
  engine: {
    title: '发动机组', system: '发动机与配套系统',
    purpose: '燃油、进排气、冷却与润滑系统共同支持发动机运行和动力输出。',
    work: ['设计燃油、冷却、进排气与润滑系统', '制作并安装油箱、进气箱、排气管、消声器及管路支架', '开展供油、流动与散热仿真，匹配散热器和配套部件', '开展台架喷油与点火标定，测量扭矩、功率和温度', '完成装配调试，排查发动机运行故障'],
    systems: [
      {name: '燃油', work: '设计油箱与供油管路'},
      {name: '冷却', work: '匹配散热器，布置冷却回路'},
      {name: '进气', work: '设计进气箱与空气通道'},
      {name: '排气', work: '设计排气管与消声器'},
      {name: '润滑', work: '匹配与布置润滑系统'}
    ],
    anchor: {ids: ['casting-009'], point: [-.6129,-.0116,.4057]}
  },
  transmission: {
    title: '传动组', system: '机械传动',
    purpose: '链传动、差速器与半轴向驱动轮传递扭矩，并适应两侧轮速差和悬架运动。',
    work: ['设计链轮、差速器支撑与半轴连接', '匹配传动比、动力输出与后轮扭矩', '校核链传动、半轴和支撑结构受力', '确定总成位置，调整链条张紧、对中与间隙'],
    anchor: {ids: ['transmission-046'], point: [-.9620,-.0109,.2701]}
  },
  battery: {
    title: '电池组', system: '动力电池',
    purpose: '动力电池向电驱系统供电，电池管理系统采集电压、温度和电流。',
    work: ['设计电池模组与箱体，完成电芯连接', '集成电池管理系统，采集电压、温度和电流', '分析电芯温升与模组温差，优化散热布置', '检查模组固定、绝缘与装配质量'],
    anchor: {ids: ['dc26-battery-020'], point: [-.5342,-.1492,.1735]}
  },
  ecu: {
    title: '电控组', system: '整车与电机控制',
    purpose: '控制程序根据踏板输入与车辆状态生成扭矩请求，并协调电驱系统运行。',
    work: ['开发车辆控制程序，匹配扭矩请求与电机响应', '完成控制器、仪表和传感器通信联调', '调试电机、水泵等设备，结合整车表现调整参数'],
    anchor: {ids: ['dc26-controller-001'], point: [-.6343,.0986,.4067]}
  },
  wiring: {
    title: '线路组', system: '配电与线束',
    purpose: '配电回路和线束连接电源、控制器与传感器，承担供电和信号传输。',
    work: ['设计配电、线束与安全回路', '选配接插件，制作并布置线束', '检查供电、信号、连接与绝缘，验证安全关断'],
    anchor: {ids: ['dc26-hvb-001'], point: [-.6211,-.1755,.4022]}
  },
  algorithm: {
    title: '算法组', system: '无人驾驶算法',
    purpose: '无人驾驶算法处理感知信息，为车辆自主行驶提供控制所需的输入。',
    work: ['开发无人驾驶算法，处理传感器信息', '调试程序，结合传感器数据检查算法输出', '开展整车联调，检验自主行驶表现'],
    unlinked: true, screenAnchor: [.22,.40]
  },
  control: {
    title: '控制组', system: '执行机构设计制造与车辆控制',
    purpose: '设计制造无人赛车的转向、制动执行机构，完成机械装配、控制开发与整车调试。',
    work: ['设计自动转向机构、传动连接与电机安装支架', '设计制动执行机构、踏板连接与安装结构', '完成零件加工与装配，检查行程、间隙和运动干涉', '开发转向、加速与制动控制程序，结合实车响应调试参数'],
    unlinked: true, screenAnchor: [.80,.36]
  },
  safety: {
    title: '系统安全组', system: '无人系统安全',
    purpose: '开展无人赛车安全系统的设计与验证，工作包括安全回路、EBS 紧急制动等。',
    work: ['分析系统故障风险，设计安全处置方案', '设计并验证安全回路，检查急停与驱动关断', '开发并调试 EBS 紧急制动系统', '开展整车安全联调，检查故障检测与响应'],
    unlinked: true, screenAnchor: [.78,.82]
  },
  operations: {
    title: '运营部', system: '组织、宣传与合作',
    purpose: '运营部负责活动组织、车队宣传与对外合作，协调日常事务和参赛后勤。',
    work: ['筹备活动，协调参赛与日常事务', '完成拍摄、撰稿与宣传内容制作', '沟通对外合作，协调活动后勤'],
    unlinked: true, screenAnchor: [.76,.55]
  }
};

const card=(group,extra={})=>({...RECRUITMENT_GROUPS[group],key:'recruit-'+group,group,...extra});
export const ANNOTATION_CATALOG = {
  chassis: [card('suspension'),card('steering'),card('brakes')],
  structure: [card('body'),card('frame')],
  power: [card('engine'),card('transmission')],
  'e74-power': [card('battery'),card('ecu'),card('wiring'),card('transmission',{
    key:'recruit-electric-transmission',system:'电驱与机械传动',
    anchor:{ids:['dc26-drive-087'],point:[-.8046,.017,.2132]}
  })],
  driverless: [card('algorithm'),card('control'),card('safety')],
  operations: [card('operations')]
};

export const DEPARTMENT_INTROS = {
  all: '选择部门与组别，查看系统结构和各组工作。',
  chassis: '悬架、转向与制动系统的设计、制造和调校。',
  structure: '车身气动设计、车架结构设计与座舱布置。',
  power: '动力系统的设计、制造、标定与整车匹配。',
  driverless: '无人驾驶算法、执行机构设计制造、车辆控制与系统安全。',
  operations: '活动组织、宣传制作、对外合作与参赛后勤。'
};
