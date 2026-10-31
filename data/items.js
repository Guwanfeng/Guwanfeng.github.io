/* ============================================================
 * 300英雄 装备数据 —— 由作者维护，站点只读
 *
 * 这是整个站点唯一需要日常维护的文件（data/items.js）。
 * 改完存盘、刷新页面就生效；也可以只改本地草稿，再用 ?dev=1 后台的
 * 「导出 items.js」把结果下载下来覆盖本文件。
 *
 * ── 一件装备这样写 ──────────────────────────────────
 *   {
 *     id:       '唯一标识（英文/数字，改了会让用户已选的装备失效）',
 *     name:     '装备名',
 *     note:     '备注（不参与计算，可省略）',
 *     special:  ['本工具没有建模的机制，只做展示'],   // 可省略
 *     stats:    { ad: 60, asPct: 25 },              // 只写非 0 项
 *     effects:  [ { name: '灼烧', dmg: 30, apPct: 5, type: 'magic', cd: 1 } ]   // 没有就省略
 *   }
 *
 * ── 分类不用写 ──────────────────────────────────────
 *   由 stats / effects 自动判定：攻击 / 法强 / 生命回复 / 生命值 / 护甲 / 法抗 / 命中 / 闪避 / 特效 / 重伤 / 其它，
 *   一件装备可以同时属于多个分类。有特效（伤害或属性加成）的会进「特效」；一条规则都不沾的进「其它」。
 *
 * ── stats 可用的键（括号里是单位） ──────────────────
 *   ad           攻击力
 *   asPct        攻速加成（%，乘在基础攻速上）
 *   asBasePct    基础攻速提高（%，把基础攻速本身放大：0.69 → 0.69×(1+20%)）
 *   autoAmp      普攻伤害提高（%，用来表达「33% 概率连击 2 次」这类等效倍率）
 *   critPct      暴击率（%）
 *   critDmgPct   暴击伤害（%，在 200% 基础上加）
 *   lifestealPct 吸血（%）
 *   wx           无相之力（每点给 1 攻击力 或 1.6 法强，默认攻击力）
 *   wxPctHp      无相之力 = 生命上限 × 该百分比
 *   wxPctHpLow   残血（生命低于 50%）时改用这个百分比；斗蛐蛐按两段平均算
 *   asSlowPct    让对方攻速降低（%，只在斗蛐蛐里生效）
 *   penFlat      固定护甲穿透
 *   penPct       百分比护甲穿透（%）
 *   armorShred   削护甲（固定值，与穿透等价）
 *   armorShredPct 削护甲（%）
 *   armorIgnore  物理伤害有该概率完全无视护甲（%，按期望承伤率折算）
 *   ap           法术强度
 *   apAmp        法强提高（%，作用于总法强，同类加算）
 *   mpenFlat     固定法术穿透
 *   mpenPct      百分比法术穿透（%）
 *   mrShred      削法抗（固定值，与法穿等价）
 *   mrShredPct   削法抗（%）
 *   hp           生命值
 *   hpPctHp      额外生命 = 生命上限 × 该百分比（护盾类）
 *   hpRegen5     每 5 秒回血
 *   regenPctHp5  每 5 秒回血 = 生命上限 × 该百分比
 *   regenAmp     生命回复提高（%，只放大自然回血，不含吸血）
 *   armor        护甲
 *   mr           法术抗性
 *   hit          命中（人物基础值为 100）
 *   autoNoMiss   普攻不会被闪避（填 1 即生效）
 *   dodge        闪避
 *   fogUptime    迷雾覆盖率（%）：双方命中归零的时间占比，只在斗蛐蛐里生效
 *   amp          增伤（%）
 *   reduce       减伤（%）
 *   autoReduce   受到普攻伤害降低（%），不影响特效伤害
 *   reflectPct   受击反击（%）：对方承受他自己 DPS 的这个比例，真实伤害，只在斗蛐蛐里生效
 *   gwPct        重伤（%，削减对方回复的百分比；一律永久生效，不写持续时间）
 *
 * ── effects 一条特效的字段 ──────────────────────────
 *   name   特效名（可省略）
 *   dmg    每一跳的固定伤害（未过抗性）
 *   adPct  每一跳 + 攻击力 × 该百分比（如「150+25%攻击力」→ dmg:150, adPct:25）
 *   apPct  每一跳 + 法强 × 该百分比
 *   perLv  每一跳 + 该值 × 等级
 *   hpPct  每一跳 + 目标最大生命 × 该百分比
 *   type   'phys' 物理 | 'magic' 魔法 | 'true' 真实
 *   cd     冷却秒；0 或省略 = 每次普攻都触发（按攻速换算）
 *   dur    持续秒；0 或省略 = 瞬时伤害
 *   tick   持续期间每秒跳几次（默认 1；「每 0.5 秒一次」就填 2）
 *   stack  最多叠几层；省略 = 1（不叠加，只刷新持续时间）
 *   chance 触发概率 %（默认 100）
 *   crit   是否吃暴击（默认 false）
 *   leech  是否吃吸血（默认 false）
 *   active 是否「主动」加成（默认 false）：主动不折算平均值，只在「爆发 1s」里全额生效，
 *          「不含特效」与「平均」两档都当没有它
 *   buff   属性加成（可省略，可以是增益，也可以填对敌的削抗 / 减攻速）：
 *            键与 stats 相同，整块加成按覆盖率折算后重算一遍属性
 *            覆盖率 = min(100%, 持续 × 触发频率)，触发频率 = 冷却填了就是 1/冷却，留 0 就按攻速；
 *            持续留 0 = 常驻 100%
 *          例（被动，按覆盖率折算）：{ name: '削抗', cd: 25, dur: 5, buff: { mrShredPct: 20 } }
 *              每 25 秒触发一次、持续 5 秒 → 覆盖率 20%，等效 -4% 法抗
 *          例（主动，只算爆发档）：{ name: '主动', cd: 45, dur: 5, active: true, buff: { asPct: 45, mr: 30 } }
 *              开团那 1 秒里全额 +45% 攻速 / +30 法抗；平均档算作没有
 *
 * 下面 47 件为正式数据。来源：装备属性.txt（原文的「注」抄在 note 里，
 * 本工具算不了的机制抄在 special 里，只展示、不参与计算）。
 * ============================================================ */
window.HeroItems = [
  {
    id: 'dominator',
    name: '支配者',
    stats: { ap: 10, hp: 200 },
    effects: [{ name: '支配', dmg: 100, type: 'magic', cd: 25 }]
  },
  {
    id: 'sakuya-watch',
    name: '咲夜的怀表',
    note: '「已损生命 2.5% 回血」按约定不计',
    stats: { ap: 80, hp: 800 }
  },
  {
    id: 'venom-staff',
    name: '恶毒法杖',
    note: '削法抗按叠满 5 层（8×5=40）计',
    stats: { ap: 40, hp: 200, mrShred: 40 }
  },
  {
    id: 'fairy-radiance',
    name: '妖精的光辉',
    note: '「15% 最大生命」按目标最大生命计',
    stats: { ap: 15, mpenFlat: 15 },
    effects: [
      { name: '妖精的光辉', dmg: 100, hpPct: 15, type: 'magic', cd: 25 },
      { name: '削魔抗', cd: 25, dur: 5, buff: { mrShredPct: 20 } }
    ]
  },
  {
    id: 'doomsday-scepter',
    name: '天罚权杖',
    stats: { ap: 40, mr: 25 },
    effects: [{ name: '天罚', dmg: 150, apPct: 15, type: 'magic', cd: 8 }]
  },
  {
    id: 'lawbreaker-talisman',
    name: '可破万法之符',
    stats: { ap: 60, mpenFlat: 15, mpenPct: 30 }
  },
  {
    id: 'dark-matter',
    name: '暗物质发生器',
    stats: { ap: 25 },
    effects: [
      { name: '暗物质', dmg: 40, apPct: 2, type: 'magic', cd: 15, dur: 4.5, tick: 2 },
      { name: '重伤', cd: 15, dur: 4.5, buff: { gwPct: 75 } }
    ]
  },
  {
    id: 'scorching-armor',
    name: '灼热盔甲',
    stats: { ap: 30, mr: 45, hp: 300, mrShred: 25 },
    effects: [{ name: '灼烧', dmg: 30, apPct: 5, type: 'magic', cd: 1 }]
  },
  {
    id: 'distant-dominance',
    name: '遥远的蹂躏制霸',
    note: '无相之力按满层 10 层（4×10=40）计',
    stats: { hp: 350, hpRegen5: 15, wx: 40 }
  },
  {
    id: 'finger-destroyer',
    name: '手指毁灭者',
    note: '叠层按满层 35 层计（+35% 攻速、+35 法强，已并入属性）',
    stats: { asPct: 68, ap: 70 },
    effects: [{ name: '法伤普攻', dmg: 20, apPct: 20, type: 'magic', leech: true }]
  },
  {
    id: 'winter-scepter',
    name: '寒冬节杖',
    stats: { ap: 15, hp: 300, hpRegen5: 15, asSlowPct: 25, gwPct: 40 }
  },
  {
    id: 'tome-of-abyss',
    name: '螺湮城教本',
    stats: { ap: 10, hp: 250, hpRegen5: 15 },
    effects: [{ name: '螺湮', cd: 45, dur: 3.5, active: true, buff: { wx: 20 } }]
  },
  {
    id: 'sealed-book',
    name: '封印之书',
    stats: { ap: 20, hp: 300 }
  },
  {
    id: 'death-note',
    name: '死神笔记',
    note: '法强提高 20% 作用于总法强，与同类词条加算',
    stats: { ap: 100, apAmp: 20 }
  },
  {
    id: 'mist-lantern',
    name: '迷雾之灯',
    note: '主动 4.5s / 25s：敌我双方 -40 法抗，按主动算（只在爆发档生效）；' +
          '双方命中归零按覆盖率 18% 计；「+1000 闪避 / -100 命中 / -40% 物理伤害」按约定不计',
    stats: { ap: 30, hp: 300, armor: 50, dodge: 50, fogUptime: 18 },
    effects: [
      { name: '迷雾', dmg: 35, type: 'magic', cd: 25, dur: 4.5, tick: 2 },
      /* 双方 -40 法抗：自己那半份用 mr，对方那半份用 mrShred（并入法穿），一条特效两头都算 */
      { name: '迷雾·双方削抗', cd: 25, dur: 4.5, active: true, buff: { mr: -40, mrShred: 40 } }
    ]
  },
  {
    id: 'transform-blade',
    name: '变形妖刀',
    note: '「降低目标 10% 造成伤害」按减伤 10% 计',
    stats: { ap: 30, hp: 250, reduce: 10 }
  },
  {
    id: 'escape-dictionary',
    name: '转义词典',
    note: '30% 物理转法术：物理伤害的 30% 改按法术承伤率结算（法术那部分吃法穿）；主动期间提高到 70%',
    stats: { asPct: 30, ap: 20, mpenFlat: 30, physToMagic: 30 },
    effects: [{ name: '转化·主动', cd: 45, dur: 5, active: true,
                buff: { asPct: 50, autoNoMiss: 1, physToMagic: 40 } }]
  },
  {
    id: 'tensa-zangetsu',
    name: '天锁斩月',
    note: '斩击按 2 秒冷却计（原文 6 秒、每次普攻 -2 秒）',
    stats: { ad: 25, asPct: 25, armor: 25 },
    effects: [{ name: '斩击', dmg: 150, adPct: 25, type: 'phys', cd: 2, leech: true }]
  },
  {
    id: 'qinggang-sword',
    name: '青釭剑',
    stats: { ad: 45, penFlat: 15, armorShred: 30 }
  },
  {
    id: 'kusanagi',
    name: '草薙剑',
    stats: { ad: 25, critPct: 15 },
    effects: [{ name: '主动', cd: 45, dur: 5, active: true, buff: { asPct: 45, mr: 30 } }]
  },
  {
    id: 'owl-eye',
    name: '夜枭之瞳',
    stats: { ad: 20, asPct: 25, hp: 200 }
  },
  {
    id: 'zhuge-crossbow',
    name: '诸葛连弩',
    note: '33% 概率连击 2 次按等效普攻 ×1.33 计（连击那下同样吃暴击）；-25% 暴击伤害按 -25 个百分点计（200% → 175%）',
    stats: { asPct: 50, hp: 250, armor: 25, critDmgPct: -25, autoAmp: 33 }
  },
  {
    id: 'nice-staff',
    name: 'NICE杖',
    stats: { ad: 10, hp: 300 },
    effects: [{ name: '主动', cd: 75, dur: 5, active: true, buff: { mr: 100 } }]
  },
  {
    id: 'nichirin-blade',
    name: '日轮刀',
    stats: { ad: 30, hp: 300, armor: 45, hpRegen5: 25, regenPctHp5: 5 },
    effects: [
      { name: '日轮', dmg: 40, adPct: 8, type: 'magic', cd: 1 }
    ]
  },
  {
    id: 'imagine-breaker',
    name: '幻想杀手',
    stats: { ad: 30, mr: 45, hp: 300 }
  },
  {
    id: 'gae-bolg',
    name: '死棘之枪',
    stats: { asPct: 60, autoNoMiss: 1 },
    effects: [{ name: '死棘', dmg: 50, type: 'true' }]
  },
  {
    id: 'muramasa',
    name: '妖刀村正',
    stats: { ad: 30, hp: 300, hpRegen5: 15, lifestealPct: 15 },
    effects: [{ name: '嗜血', cd: 45, dur: 3.5, active: true, buff: { lifestealPct: 70, asPct: 35 } }]
  },
  {
    id: 'mech-claw',
    name: '机械飞爪',
    stats: { ad: 20, hp: 350, hpRegen5: 10 }
  },
  {
    id: 'ship-cutter',
    name: '斩舰刀',
    stats: { asPct: 40, hp: 250, gwPct: 30 },
    effects: [
      { name: '普攻附伤', hpPct: 2, type: 'magic', leech: true },
      { name: '每秒斩击', hpPct: 2, type: 'magic', cd: 1 }
    ]
  },
  {
    id: 'sonic-blade',
    name: '音速手刃',
    note: '「20% 基础攻速」乘在基础攻速上（0.69 → 0.828），与「攻速加成 50%」不是一回事',
    stats: { ad: 30, asPct: 50, asBasePct: 20, armor: 30, dodge: 50 }
  },
  {
    id: 'frostmourne',
    name: '霜之哀伤',
    stats: { ad: 20, asPct: 30, hp: 400, hpRegen5: 20, asSlowPct: 25, gwPct: 40 }
  },
  {
    id: 'tessaiga',
    name: '铁碎牙',
    stats: { ad: 60, critPct: 30, critDmgPct: 50 }
  },
  {
    id: 'physics-sword',
    name: '物理学圣剑',
    note: '50% 概率无视护甲按期望承伤率计',
    stats: { ad: 90, penPct: 30, armorIgnore: 50 }
  },
  {
    id: 'sky-hammer',
    name: '撼天锤',
    stats: { ad: 30, hp: 400, hpRegen5: 25 },
    effects: [
      { name: '重击', dmg: 75, adPct: 25, type: 'phys', chance: 10 },
      { name: '撼天', dmg: 150, adPct: 50, type: 'phys', cd: 25 }
    ]
  },
  {
    id: 'mobilization-order',
    name: '亚西的动员令',
    stats: { hp: 250, hpRegen5: 10 }
  },
  {
    id: 'thorns-armor',
    name: '反震盔甲',
    note: '反击只在斗蛐蛐里生效：对方承受他自己 DPS 的 30%，真实伤害、不过抗性',
    stats: { ad: 25, armor: 40, reflectPct: 30 }
  },
  {
    id: 'evil-eye',
    name: '邪王真眼',
    stats: { ap: 22, mr: 42 }
  },
  {
    id: 'time-bracelet',
    name: '时间跳跃脚镯',
    stats: { hp: 200 },
    special: ['法力值 200（本工具没有法力值属性）']
  },
  {
    id: 'light-seal-sword',
    name: '光之护封剑',
    note: '固定 12% 普攻减伤；主动期间再 -80%（按加算叠加）',
    stats: { hp: 200, hpRegen5: 20, armor: 60, autoReduce: 12 },
    effects: [{ name: '护封', cd: 25, dur: 3, active: true, buff: { autoReduce: 80 } }]
  },
  {
    id: 'moving-church',
    name: '移动教会',
    note: '「每段 -25、最多 -40%」按约定不计',
    stats: { hp: 300, hpRegen5: 30, armor: 30 }
  },
  {
    id: 'dragon-armor',
    name: '龙鳞明光甲',
    note: '无相之力按生命上限 1.5%；低于 50% 生命时 2.5%，斗蛐蛐按两段平均 2%',
    stats: { hp: 500, hpRegen5: 20, wxPctHp: 1.5, wxPctHpLow: 2.5 }
  },
  {
    id: 'phoenix-robe',
    name: '凤凰羽衣',
    note: '「每损失 1% 生命 +1% 回血」按全程 +50% 生命回复计（只放大自然回血，不含吸血）',
    stats: { mr: 50, hpRegen5: 30, armor: 50, regenAmp: 50 }
  },
  {
    id: 'at-field',
    name: 'AT力场',
    stats: { mr: 50, hp: 300, hpRegen5: 10 },
    effects: [{ name: 'AT力场', cd: 15, dur: 3.5, active: true, buff: { hp: 250, hpPctHp: 10 } }]
  },
  {
    id: 'blood-prince',
    name: '血族亲王',
    note: '「12% 减免逐秒转增伤」按约定不计',
    stats: { mr: 30, hpRegen5: 15, armor: 30, lifestealPct: 25 }
  },
  {
    id: 'withering-heart',
    name: '枯萎之心',
    stats: { hp: 250, hpRegen5: 40, armor: 40, gwPct: 25, asSlowPct: 40 }
  },
  {
    id: 'zero-hour',
    name: '零时迷子',
    stats: { hp: 450 }
  },
  {
    id: 'martyr-armor',
    name: '殉难者铠甲',
    stats: { hp: 650, regenPctHp5: 5 }
  }
];
