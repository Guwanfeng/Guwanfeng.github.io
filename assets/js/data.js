/* ============================================================
 * 300英雄 装备属性计算器 —— 数据层
 * 说明：这里只定义「结构」与默认值，不含任何真实装备数值。
 *       装备数据放在 assets/items.js，由作者维护。
 * ============================================================ */
window.HeroData = (function () {
  'use strict';

  /* ---------------- 普攻伤害构成 ----------------
   * 默认：1.0 攻击力的物理伤害。特殊情况（普攻是魔法伤害、混加成、带固定值）在这里拆成若干条：
   *   type  伤害类型：phys 物理 / magic 魔法
   *   ad    攻击力系数（1 = 100% 攻击力）
   *   ap    法强系数
   *   flat  每一下的固定值
   *   perLv 每级的固定值（× 当前等级，18 级就是 ×18）
   * 例：0.4ad + 0.2ap + 2×等级 的魔法伤害 → { type:'magic', ad:0.4, ap:0.2, flat:0, perLv:2 }
   * 多条之间直接相加，各自按自己的伤害类型吃护甲/法抗与命中、增伤、减伤。 */
  const AUTO_DEFAULT = [{ type: 'phys', ad: 1, ap: 0, flat: 0, perLv: 0 }];

  const AUTO_TYPES = [
    { key: 'phys',  label: '物理', desc: '吃护甲与物穿' },
    { key: 'magic', label: '魔法', desc: '吃法抗与法穿' },
    { key: 'true',  label: '真实', desc: '不吃任何抗性' }
  ];

  function newAutoComp(over) {
    var c = { type: 'phys', ad: 0, ap: 0, flat: 0, perLv: 0 };
    var o = over || {};
    Object.keys(o).forEach(function (k) { if (o[k] !== undefined && o[k] !== null) c[k] = o[k]; });
    c.type = (c.type === 'magic' || c.type === 'true') ? c.type : 'phys';
    c.ad = +c.ad || 0;
    c.ap = +c.ap || 0;
    c.flat = +c.flat || 0;
    c.perLv = +c.perLv || 0;
    return c;
  }

  /* 补全 / 清洗一份构成列表；空列表回落到默认的 1.0 攻击力物理伤害 */
  function normalizeAuto(list) {
    var arr = Array.isArray(list) ? list : null;
    if (!arr || !arr.length) return AUTO_DEFAULT.map(function (c) { return newAutoComp(c); });
    return arr.map(function (c) { return newAutoComp(c); });
  }

  /* 人物基础属性默认值（需求文档给出的英雄默认值，18 级封顶） */
  const HERO_DEFAULTS = {
    level: 18,
    ad: 54,          adGrow: 3.5,        // 基础/成长 攻击力
    asBase: 0.69,    asGrow: 0.0315,     // 基础攻速 / 成长攻速（成长值为百分比，需乘基础攻速）
    crit: 0,         critDmg: 200,       // 基础暴击率% / 基础暴击伤害%
    ap: 0,                                // 基础法术强度
    hp: 555,         hpGrow: 78,          // 基础/成长 生命值
    hpRegen5: 8,     hpRegen5Grow: 0.47,  // 基础/成长 每 5 秒生命回复
    armor: 29,       armorGrow: 3.5,      // 基础/成长 护甲
    mr: 33,          mrGrow: 0.5,         // 基础/成长 法术抗性
    penFlat: 0,      penFlatGrow: 0,      // 基础/成长 固定护甲穿透
    penPct: 0,                            // 基础 百分比护甲穿透（%）
    lifesteal: 0,                         // 基础 吸血比例（%）
    hit: 100,        dodge: 0,            // 命中 / 闪避（命中率 = 我方命中 ÷ (敌方闪避 + 100)）
    amp: 0,          reduce: 0,           // 增伤 % / 减伤 %
    gw: 0,                                // 重伤 %（削减对方回复，一律永久生效）
    auto: [{ type: 'phys', ad: 1, ap: 0, flat: 0, perLv: 0 }]   // 普攻伤害构成（默认 1.0 攻击力物理伤害）
  };

  /* 木桩默认值：3500 血 / 100 护甲 / 50 法抗，无闪避、无减伤 */
  const DUMMY_DEFAULTS = { hp: 3500, armor: 100, mr: 50, dodge: 0, reduce: 0 };

  /* 上限（最终值口径，超过即按上限计）
   *   攻速上限 2.5、暴击率上限 100%，两者都可在界面上看到是否已封顶 */
  const CAPS = {
    as: 2.5,
    crit: 1.0
  };

  /* 装备可提供的属性。
   * used=true  → 进入伤害/肉度公式
   * used=false → 只做展示统计（当前公式没有对应的乘区，留待后续扩展） */
  const STAT_DEFS = [
    { key: 'ad',          label: '攻击力',        short: 'AD',      group: '攻击', pct: false, used: true  },
    { key: 'asPct',       label: '攻速加成',      short: '攻速',    group: '攻击', pct: true,  used: true  },
    { key: 'asBasePct',   label: '基础攻速提高',  short: '基础攻速', group: '攻击', pct: true,  used: true  },
    { key: 'autoAmp',     label: '普攻伤害提高',  short: '普攻伤害',   group: '攻击', pct: true,  used: true  },
    { key: 'critPct',     label: '暴击率',        short: '暴击',    group: '攻击', pct: true,  used: true  },
    { key: 'critDmgPct',  label: '暴击伤害加成',  short: '暴伤',    group: '攻击', pct: true,  used: true  },
    { key: 'lifestealPct',label: '吸血比例',      short: '吸血',    group: '攻击', pct: true,  used: true  },
    { key: 'wx',          label: '无相之力',      short: '无相',    group: '攻击', pct: false, used: true  },
    { key: 'wxPctHp',     label: '无相之力（生命上限）', short: '无相%', group: '攻击', pct: true, used: true },
    { key: 'wxPctHpLow',  label: '无相之力（残血时生命上限）', short: '无相%残', group: '攻击', pct: true, used: true },
    { key: 'asSlowPct',   label: '降低对方攻速',  short: '减攻速',  group: '攻击', pct: true,  used: true  },
    { key: 'penFlat',     label: '固定护甲穿透',  short: '固定穿透', group: '穿透', pct: false, used: true  },
    { key: 'penPct',      label: '百分比护甲穿透', short: '百分比穿透', group: '穿透', pct: true, used: true  },
    { key: 'armorShred',  label: '削护甲（固定）', short: '削甲',   group: '穿透', pct: false, used: true  },
    { key: 'armorShredPct', label: '削护甲比例', short: '削甲%',   group: '穿透', pct: true,  used: true  },
    { key: 'armorIgnore', label: '无视护甲概率（物理）', short: '无视护甲', group: '穿透', pct: true, used: true },
    { key: 'physToMagic', label: '物理伤害转法术', short: '物转法', group: '穿透', pct: true, used: true },
    { key: 'ap',          label: '法术强度',      short: 'AP',      group: '法术', pct: false, used: true  },
    { key: 'apAmp',       label: '法强提高', short: '法强%', group: '法术', pct: true, used: true },
    { key: 'mpenFlat',    label: '固定法穿',      short: '固定法穿', group: '法术', pct: false, used: true  },
    { key: 'mpenPct',     label: '百分比法穿',    short: '百分比法穿', group: '法术', pct: true, used: true  },
    { key: 'mrShred',     label: '削法抗（固定）', short: '削抗',   group: '穿透', pct: false, used: true  },
    { key: 'mrShredPct',  label: '削法抗比例', short: '削抗%',   group: '穿透', pct: true,  used: true  },
    { key: 'hp',          label: '生命值',        short: 'HP',      group: '防御', pct: false, used: true  },
    { key: 'hpPctHp',     label: '额外生命（生命上限）', short: '生命%', group: '防御', pct: true, used: true },
    { key: 'hpRegen5',    label: '每5秒回血',     short: '回血',    group: '防御', pct: false, used: true  },
    { key: 'regenPctHp5', label: '回血（生命上限）/5s', short: '回血%', group: '防御', pct: true, used: true },
    { key: 'regenAmp',    label: '生命回复提高',  short: '回血提高', group: '防御', pct: true, used: true },
    { key: 'armor',       label: '护甲',          short: '护甲',    group: '防御', pct: false, used: true  },
    { key: 'mr',          label: '法术抗性',      short: '法抗',    group: '防御', pct: false, used: true  },
    { key: 'hit',         label: '命中',          short: '命中',    group: '命中', pct: false, used: true  },
    { key: 'autoNoMiss',  label: '普攻不会被闪避', short: '普攻必中', group: '命中', pct: false, used: true },
    { key: 'dodge',       label: '闪避',          short: '闪避',    group: '命中', pct: false, used: true  },
    { key: 'fogUptime',   label: '迷雾（双方命中归零）', short: '迷雾', group: '命中', pct: true, used: true },
    { key: 'amp',         label: '增伤',          short: '增伤',    group: '增减伤', pct: true,  used: true  },
    { key: 'reduce',      label: '减伤',          short: '减伤',    group: '增减伤', pct: true,  used: true  },
    { key: 'autoReduce',  label: '受到普攻伤害降低', short: '普攻减伤', group: '增减伤', pct: true, used: true },
    { key: 'reflectPct',  label: '受击反击（对方 DPS）', short: '反击', group: '增减伤', pct: true, used: true },
    { key: 'gwPct',       label: '重伤',          short: '重伤',    group: '增减伤', pct: true,  used: true  }
  ];

  const STAT_MAP = {};
  STAT_DEFS.forEach(function (d) { STAT_MAP[d.key] = d; });

  /* 装备分类：由属性自动判定，不用手填。一件装备可以同时属于多个分类。
   * 顺序即为界面上的排列顺序，「其它」= 一条规则都没沾上（例如只给增伤/减伤）。 */
  const CATEGORIES = ['攻击', '法强', '生命回复', '生命值', '护甲', '法抗', '命中', '闪避', '特效', '重伤', '其它'];

  /* 分类 ← 属性键：其中任意一项 > 0 就归入该分类 */
  const CAT_KEYS = [
    ['攻击',   ['ad', 'asPct', 'asBasePct', 'autoAmp', 'critPct', 'critDmgPct', 'lifestealPct',
                'penFlat', 'penPct', 'armorShred', 'armorShredPct', 'armorIgnore']],
    ['法强',   ['ap', 'apAmp', 'mpenFlat', 'mpenPct', 'mrShred', 'mrShredPct']],
    ['生命回复', ['hpRegen5', 'regenPctHp5', 'regenAmp']],
    ['生命值', ['hp', 'hpPctHp']],
    ['护甲',   ['armor']],
    ['法抗',   ['mr']],
    ['命中',   ['hit', 'autoNoMiss']],
    ['闪避',   ['dodge']],
    ['重伤',   ['gwPct']]
  ];

  /* 一件装备的分类列表（按 CATEGORIES 顺序返回，至少有一个）
   *   属性 > 0       → 进对应分类
   *   无相之力        → 攻击与法强两个分类都算
   *   带特效（有伤害或有防御加成）→ 特效
   *   一条都不沾      → 其它 */
  function itemCategories(it) {
    const st = (it && it.stats) || {};
    const got = {};
    CAT_KEYS.forEach(function (pair) {
      if (pair[1].some(function (k) { return (+st[k] || 0) > 0; })) got[pair[0]] = true;
    });
    if ((+st.wx || 0) > 0 || (+st.wxPctHp || 0) > 0 || (+st.wxPctHpLow || 0) > 0) { got['攻击'] = true; got['法强'] = true; }   // 无相之力两个分类都算
    if (((it && it.effects) || []).some(function (e) {
      return effectHasPayload(e);
    })) got['特效'] = true;
    if (!Object.keys(got).length) got['其它'] = true;
    return CATEGORIES.filter(function (c) { return got[c]; });
  }

  /* ---------------- 特效 ----------------
   * 一件装备可以挂 0~N 条特效，每条含：
   *   name   特效名（只做展示，可留空）
   *   dmg    每一跳的固定伤害（未过抗性）
   *   adPct  每一跳 + 攻击力 × 这个百分比
   *   apPct  每一跳 + 法强 × 这个百分比
   *   perLv  每一跳 + 该值 × 等级
   *   hpPct  每一跳 + 目标最大生命 × 这个百分比
   *   type   伤害类型：phys 物理 / magic 魔法 / true 真实（真实伤害不吃抗性）
   *   cd     冷却秒数；填 0 表示「每次普攻都会附带」，改按攻速换算
   *   dur    持续时间（秒）；0 = 瞬时伤害
   *   tick   持续期间每秒跳几次（默认 1）
   *   stack  最多叠几层；1 = 不叠加（每次触发只刷新持续时间）
   *   chance 触发概率 %（默认 100）
   *   crit   是否吃暴击（按暴击因子放大）
   *   leech  是否吃吸血（计入肉度与斗蛐蛐的吸血回复）
   *   active 是否是「主动」加成：主动一律不折算成平均值，只在「爆发 1s」口径下全额生效，
   *          「不含特效」与「平均」两档都按没有它处理（因为它是有意留着开团用的，摊平均没有意义）
   *   buff   属性加成（0~N 项；非 active 的按覆盖率折算成平均值，可以是增益，也可以填对敌的削抗 / 减攻速）
   */
  const FX_TYPES = [
    { key: 'phys',  label: '物理' },
    { key: 'magic', label: '魔法' },
    { key: 'true',  label: '真实' }
  ];

  /* 特效的「属性加成」可用的键 = 全部装备属性。
   * 覆盖率 = min(1, 持续时间 × 触发频率)，与伤害特效同一套算法；
   * 折算成平均值后再参与计算，所以填的是一个周期内的期望加成。
   * 例：+45% 攻速、持续 5 秒、冷却 45 秒 → 覆盖率 11% → 等效 +5% 攻速 */
  const BUFF_DEFS = STAT_DEFS;

  function newBuff(over) {
    var b = {};
    BUFF_DEFS.forEach(function (d) { b[d.key] = 0; });
    var o = over || {};
    Object.keys(o).forEach(function (k) {
      if (b[k] !== undefined && o[k] !== null && o[k] !== undefined) b[k] = +o[k] || 0;
    });
    return b;
  }

  function buffEmpty(b) {
    return !b || !BUFF_DEFS.some(function (d) { return (+b[d.key] || 0) !== 0; });
  }

  /* 三种计算口径 */
  const FX_MODES = [
    { key: 'none',  label: '不含特效', short: '本体',   desc: '只算属性带来的普攻伤害，特效与主动加成一律不计。' },
    { key: 'burst', label: '爆发 1s',  short: '爆发',   desc: '把每条特效「一轮的完整伤害」塞进 1 秒内，主动加成在这 1 秒里全额生效。' },
    { key: 'avg',   label: '平均',     short: '平均',   desc: '特效伤害按触发频率与叠层摊到每秒；主动加成不折算，这档按没有它算。' }
  ];

  /* 空特效对象工厂。
   * 伤害（dmg / adPct / apPct / perLv / hpPct）与 buff（属性加成）可以只填一边，也可以都有 */
  function newEffect(over) {
    var e = {
      name: '', dmg: 0, adPct: 0, apPct: 0, perLv: 0, hpPct: 0,
      type: 'phys', cd: 0, dur: 0, tick: 1, stack: 1, chance: 100,
      crit: false, leech: false, active: false, buff: newBuff()
    };
    var o = over || {};
    Object.keys(o).forEach(function (k) { if (o[k] !== undefined && o[k] !== null) e[k] = o[k]; });
    e.dmg = +e.dmg || 0;
    e.adPct = +e.adPct || 0;
    e.apPct = +e.apPct || 0;
    e.perLv = +e.perLv || 0;
    e.hpPct = +e.hpPct || 0;
    e.cd = +e.cd || 0;
    e.dur = +e.dur || 0;
    e.tick = Math.max(0.1, +e.tick || 1);
    e.stack = Math.max(1, Math.round(+e.stack || 1));
    e.chance = Math.max(0, Math.min(100, e.chance === undefined ? 100 : +e.chance));
    e.crit = !!e.crit;
    e.leech = !!e.leech;
    e.active = !!e.active;
    e.buff = newBuff(e.buff);
    return e;
  }

  /* 这条特效是否带伤害 */
  function effectHasDamage(e) {
    if (!e) return false;
    return (+e.dmg || 0) > 0 || (+e.adPct || 0) > 0 || (+e.apPct || 0) > 0 ||
      (+e.perLv || 0) > 0 || (+e.hpPct || 0) > 0;
  }

  /* 这条特效是否有任何内容（伤害或属性加成） */
  function effectHasPayload(e) {
    return effectHasDamage(e) || !buffEmpty(e && e.buff);
  }

  /* 空装备对象工厂（category 已不需要：分类由 itemCategories 从属性推出来） */
  function newItem(over) {
    var it = {
      id: 'it_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: '',
      note: '',
      special: [],
      stats: {},
      effects: []
    };
    STAT_DEFS.forEach(function (d) { it.stats[d.key] = 0; });
    var o = over || {};
    if (o.effects) o.effects = o.effects.map(function (e) { return newEffect(e); });
    if (o.special) o.special = normalizeSpecial(o.special);
    return Object.assign(it, o);
  }

  /* 「特殊说明」：本工具没有建模的机制，只做展示，不参与计算。
   * 可以写数组，也可以写一段用换行或分号分隔的文字。 */
  function normalizeSpecial(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(function (s) { return String(s).trim(); }).filter(Boolean);
    return String(v).split(/[\n;；]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /* 把 items.js 里的简写数据补全成完整装备对象
   * 数据文件里只写非 0 属性即可，缺的键这里补 0 */
  function normalizeList(list) {
    return (list || []).map(function (raw) {
      var src = raw || {};
      var it = newItem({});
      it.id = src.id || it.id;
      it.name = src.name || '';
      it.note = src.note || '';
      it.special = normalizeSpecial(src.special);
      it.stats = it.stats || {};
      STAT_DEFS.forEach(function (d) {
        var v = src.stats ? src.stats[d.key] : undefined;
        it.stats[d.key] = +v || 0;
      });
      it.effects = (src.effects || []).map(function (e) { return newEffect(e); });
      return it;
    });
  }

  return {
    HERO_DEFAULTS: HERO_DEFAULTS,
    AUTO_DEFAULT: AUTO_DEFAULT,
    AUTO_TYPES: AUTO_TYPES,
    newAutoComp: newAutoComp,
    normalizeAuto: normalizeAuto,
    DUMMY_DEFAULTS: DUMMY_DEFAULTS,
    CAPS: CAPS,
    STAT_DEFS: STAT_DEFS,
    STAT_MAP: STAT_MAP,
    CATEGORIES: CATEGORIES,
    itemCategories: itemCategories,
    FX_TYPES: FX_TYPES,
    FX_MODES: FX_MODES,
    BUFF_DEFS: BUFF_DEFS,
    newBuff: newBuff,
    buffEmpty: buffEmpty,
    newEffect: newEffect,
    effectHasDamage: effectHasDamage,
    effectHasPayload: effectHasPayload,
    newItem: newItem,
    normalizeSpecial: normalizeSpecial,
    normalizeList: normalizeList
  };
})();
