/* ============================================================
 * 300英雄 装备属性计算器 —— 计算引擎（纯函数，无 DOM 依赖）
 *
 * 口径（与需求文档一致）：
 *   满级值 = 基础值 + 成长值 × (等级 - 1)
 *   攻速   = 基础攻速 × (1 + 基础攻速%) × (1 + 成长攻速×17 + 装备攻速%)
 *   暴击因子 = 1 - 暴击率 + 暴击率 × 暴击伤害
 *   承伤率 = 100 / (100 + 抗性)
 *   实际抗性 = (抗性 - 固定穿透) × (1 - 百分比穿透)，最低 0
 *   攻击力 / 法强 / 护甲 / 法抗 最低都为 0（不会出现负值）
 *   命中率 = 我方命中 / (敌方闪避 + 100)，封顶 100%；「普攻不会被闪避」的普攻强制 100%
 *   增伤/减伤 = (1 + 增伤) × (1 - 减伤)，双方同时存在时乘算
 *   伤害(DPS) = 攻速 × 暴击因子 × 命中率 × 增伤 × 减伤 × 普攻倍率 × Σ(每条普攻成分过对应抗性后的伤害)
 *   普攻成分 = 攻击力系数×AD + 法强系数×AP + 固定值 + 每级×等级，默认 1.0AD 物理
 *              类型可为物理 / 魔法 / 真实（真实伤害不吃任何抗性）
 *   肉度 = (生命值 + 每秒回血) / 自身承伤率 + DPS × 吸血比例
 *          护甲 / 法抗 / 生命 / 减伤 / 普攻减伤 / 吸血 / 回血 会先叠加「特效的属性加成」
 *   特效 = 伤害特效（按三档口径计入 DPS）+ 属性加成（被动按覆盖率折算，主动只在爆发档生效）
 *   重伤 = 对方回复 × (1 - 重伤%)，一律永久生效
 * ============================================================ */
window.HeroEngine = (function () {
  'use strict';
  var Data = window.HeroData;

  function n(v) { var x = +v; return isFinite(x) ? x : 0; }

  /* 汇总装备提供的属性之和（extra = 临时加成的平均折算值） */
  function sumItems(items, extra) {
    var s = {};
    Data.STAT_DEFS.forEach(function (d) { s[d.key] = 0; });
    (items || []).forEach(function (it) {
      var st = it && it.stats ? it.stats : {};
      Data.STAT_DEFS.forEach(function (d) { s[d.key] += n(st[d.key]); });
    });
    if (extra) Data.STAT_DEFS.forEach(function (d) { s[d.key] += n(extra[d.key]); });
    return s;
  }

  /* 由「基础属性 + 装备（+ 临时加成）」得到人物的最终属性
   *   opts.hpMix = true → 斗蛐蛐用：把「残血时才生效的无相之力比例」按两段平均进来
   *                       （例：1.5% → 低于 50% 时 2.5%，全程按 2% 算） */
  function heroStats(base, items, extra, opts) {
    var b = base || {};
    var o = opts || {};
    var s = sumItems(items, extra);
    var L = Math.max(0, n(b.level || 1) - 1);
    var caps = Data.CAPS || { as: 2.5, crit: 1 };

    /* 基础攻速可以被单独放大（音速手刃的「20% 基础攻速」）：
     *   asBase = 0.69 × (1 + 20%) = 0.828，之后才乘攻速加成。
     * 它和「攻速加成 +20%」不是一回事，所以单独一列 */
    var asBase = n(b.asBase) * (1 + n(s.asBasePct) / 100);
    var asBonus = n(b.asGrow) * L + s.asPct / 100;      // 攻速加成（小数）
    var asRaw = asBase * (1 + asBonus);                 // 未封顶攻速
    var as = Math.min(asRaw, caps.as);

    var critRaw = (n(b.crit) + s.critPct) / 100;        // 未封顶暴击率
    var crit = Math.min(critRaw, caps.crit);
    var critDmg = (n(b.critDmg) + s.critDmgPct) / 100;  // 暴击伤害（小数）

    /* 重伤是「状态」不是可叠加的属性：取最大值。
     * 一律按永久生效，装备数据里即便写了持续时间也忽略 */
    var gw = n(b.gw);
    (items || []).forEach(function (it) {
      var p = n(((it && it.stats) || {}).gwPct);
      if (p > gw) gw = p;
    });
    if (extra && n(extra.gwPct) > gw) gw = n(extra.gwPct);

    /* 生命值先算「固定部分」，再按「生命上限 %」追加（护盾 / 额外生命） */
    var hpBase = n(b.hp) + n(b.hpGrow) * L + s.hp;
    var hp = hpBase + hpBase * n(s.hpPctHp) / 100;

    /* 生命回复：固定值与「生命上限 %」先加完，再乘「生命回复提高」。
     * 这个乘区只作用于自然回血，不作用于吸血（凤凰羽衣的口径） */
    var regen5 = (n(b.hpRegen5) + n(b.hpRegen5Grow) * L + s.hpRegen5
      + hp * n(s.regenPctHp5) / 100) * (1 + n(s.regenAmp) / 100);   // 每 5 秒

    /* 无相之力：每点提供 1 攻击力 或 1.6 法强，默认按攻击力。
     * 若「非无相之力装备」提供的法强 > 攻击力，则全部转成法强（不单独展示，直接并入面板）。
     * 另有「按生命上限 %」给的无相之力（龙鳞明光甲）；它还有个「残血时更高」的比例，
     * 斗蛐蛐里按两段平均（hpMix），计算器里只用基础比例 */
    var wxPctHp = n(s.wxPctHp);
    var wxPctHpLow = Math.max(wxPctHp, n(s.wxPctHpLow));
    if (o.hpMix && wxPctHpLow > wxPctHp) wxPctHp = (wxPctHp + wxPctHpLow) / 2;
    var wx = n(s.wx) + hp * wxPctHp / 100;
    var wxAsAp = s.ap > s.ad;
    var apRaw = n(b.ap) + s.ap + (wxAsAp ? wx * 1.6 : 0);

    return {
      level: n(b.level) || 1,
      auto: Data.normalizeAuto(b.auto),
      ad: Math.max(0, n(b.ad) + n(b.adGrow) * L + s.ad + (wxAsAp ? 0 : wx)),
      wx: wx,
      wxPctHp: wxPctHp,
      wxAsAp: wxAsAp,
      asBase: asBase,
      as: as,
      asRaw: asRaw,
      asCapped: asRaw > caps.as + 1e-9,
      asBonus: asBonus,
      crit: crit,
      critRaw: critRaw,
      critCapped: critRaw > caps.crit + 1e-9,
      critDmg: critDmg,
      critFactor: 1 - crit + crit * critDmg,
      ap: Math.max(0, apRaw * (1 + n(s.apAmp) / 100)),
      hp: hp,
      regen5: regen5,
      regenAmp: n(s.regenAmp),
      armor: Math.max(0, n(b.armor) + n(b.armorGrow) * L + s.armor),
      mr: Math.max(0, n(b.mr) + n(b.mrGrow) * L + s.mr),
      /* 削抗与穿透数学上等价（都是把目标抗性往下压），这里直接合并 */
      penFlat: n(b.penFlat) + n(b.penFlatGrow) * L + s.penFlat + n(s.armorShred),
      penPct: (n(b.penPct) + s.penPct + n(s.armorShredPct)) / 100,
      armorIgnore: Math.min(100, Math.max(0, n(s.armorIgnore))),
      physToMagic: Math.min(100, Math.max(0, n(s.physToMagic))),   // 物理伤害转法术的比例（%）
      lifesteal: (n(b.lifesteal) + s.lifestealPct) / 100,
      mpenFlat: n(s.mpenFlat) + n(s.mrShred),
      mpenPct: (n(s.mpenPct) + n(s.mrShredPct)) / 100,
      hit: (b.hit === undefined ? 100 : n(b.hit)) + s.hit,
      dodge: n(b.dodge) + s.dodge,
      autoNoMiss: n(s.autoNoMiss) >= 1,
      autoAmp: n(s.autoAmp),
      autoReduce: Math.min(100, Math.max(0, n(s.autoReduce))),
      amp: n(b.amp) + s.amp,
      reduce: n(b.reduce) + s.reduce,
      reflectPct: n(s.reflectPct),
      fogUptime: Math.min(100, Math.max(0, n(s.fogUptime))),
      asSlow: n(s.asSlowPct),        // 让对方攻速降低的百分比（只在斗蛐蛐里生效）
      gw: gw,
      itemSum: s
    };
  }

  /* 承伤率：抗性越高，承伤率越低（0 抗性下限保护在 -99） */
  function mitigation(res) {
    var r = Math.max(-99, n(res));
    return 100 / (100 + r);
  }

  /* 穿透后的实际抗性：先固定穿透，再百分比穿透。
   * 最低降到 0：穿透最多把护甲/法抗穿到 0，不会出现「负抗性」放大伤害 */
  function effectiveRes(res, penFlat, penPct) {
    var r = (n(res) - n(penFlat)) * (1 - n(penPct));
    return Math.max(0, r);
  }

  /* 命中率 = 我方命中 ÷ (敌方闪避 + 100)，封顶 100%
   * 未命中的部分伤害为 0，所以它整体乘在伤害上 */
  function hitRate(myHit, dodge) {
    var d = Math.max(-99, n(dodge));
    var r = n(myHit) / (d + 100);
    if (!isFinite(r)) r = 0;
    return Math.max(0, Math.min(1, r));
  }

  /* 物理侧的期望承伤率：含「概率无视护甲」（物理学圣剑那类）
   *   概率 0%   → 正常按护甲算；概率 100% → 承伤率 = 100%（等于对面没护甲） */
  function physOnlyMit(stats, t) {
    var p = Math.min(1, Math.max(0, n(stats && stats.armorIgnore) / 100));
    var m = mitigation(effectiveRes(t.armor, stats && stats.penFlat, stats && stats.penPct));
    return m * (1 - p) + p;
  }

  /* 法术侧承伤率 */
  function magicMit(stats, t) {
    return mitigation(effectiveRes(t.mr, stats && stats.mpenFlat, stats && stats.mpenPct));
  }

  /* 物理转法术的比例（0~1） */
  function convertRatio(stats) {
    return Math.min(1, Math.max(0, n(stats && stats.physToMagic) / 100));
  }

  /* 一段物理伤害的**期望**承伤率（合成后的单一系数，特效伤害用它）：
   *   k 比例的物理伤害改按法术结算 → 承伤率 = (1−k)×物理承伤 + k×法术承伤
   *   法术那部分要用**法术穿透**去过法抗
   * 「要乘物理承伤率的东西」= 普攻里的物理成分 + 物理伤害特效，两边都走这里 */
  function physMit(stats, target) {
    var t = asTarget(target);
    var m = physOnlyMit(stats, t);
    var k = convertRatio(stats);
    if (!k) return m;
    return m * (1 - k) + magicMit(stats, t) * k;
  }

  /* 增伤 / 减伤：造成方增伤与承受方减伤乘算
   *   伤害 × (1 + 增伤) × (1 - 减伤)
   * 减伤 100% 时伤害归 0；负增伤视为削弱，负减伤视为易伤 */
  function ampFactor(amp, reduce) {
    var up = Math.max(0, 1 + n(amp) / 100);
    var down = Math.max(0, 1 - n(reduce) / 100);
    return up * down;
  }

  /* 目标归一化：允许直接传护甲数值（老写法） */
  function asTarget(t) {
    if (t && typeof t === 'object') {
      return { armor: n(t.armor), mr: n(t.mr), dodge: n(t.dodge), reduce: n(t.reduce), hp: n(t.hp) };
    }
    return { armor: n(t), mr: 0, dodge: 0, reduce: 0, hp: 0 };
  }

  /* 一次伤害的总修正 = 命中率 × 增伤 × 减伤 */
  function damageFactor(stats, target) {
    var t = asTarget(target);
    return hitRate(stats.hit, t.dodge) * ampFactor(stats.amp, t.reduce);
  }

  /* 普攻每一下的原始伤害（还没过抗性），按伤害类型汇总
   *   一条成分 = 攻击力系数 × AD + 法强系数 × AP + 固定值 + 每级 × 等级
   *   类型：phys 物理 / magic 魔法 / true 真实（真实伤害不过抗性）
   *   默认只有一条 1.0 AD 的物理伤害，所以老配置数值完全不变 */
  function autoPerHit(stats) {
    var L = Math.max(1, n(stats && stats.level));
    var ad = n(stats && stats.ad);
    var ap = n(stats && stats.ap);
    var out = { phys: 0, magic: 0, true: 0, total: 0, parts: [] };
    ((stats && stats.auto) || []).forEach(function (c) {
      var dmg = n(c.ad) * ad + n(c.ap) * ap + n(c.flat) + n(c.perLv) * L;
      if (dmg <= 0) return;
      var type = c.type === 'magic' || c.type === 'true' ? c.type : 'phys';
      out[type] += dmg;
      out.total += dmg;
      out.parts.push({ type: type, dmg: dmg, ad: n(c.ad), ap: n(c.ap), flat: n(c.flat), perLv: n(c.perLv) });
    });
    return out;
  }

  /* 对某个目标的每秒普攻伤害：每条成分按自己的类型过对应抗性，再一起乘攻速 / 暴击 / 命中 / 增减伤
   *   普攻不会被闪避（死棘之枪 / 转义词典）→ 命中率强制 100%
   *   普攻伤害提高（诸葛连弩 33% 连击）→ 打在普攻这一项上，所以连击的那一下也吃暴击
   *   物理转法术（转义词典）→ 物理成分拆成两段：留下的按护甲结算，转走的按法抗结算，
   *     所以下面 phys / magic 两个桶里都可能有「本来是物理」的伤害 */
  function autoDpsVs(stats, target) {
    var t = asTarget(target);
    var per = autoPerHit(stats);
    var hit = stats.autoNoMiss ? 1 : hitRate(stats.hit, t.dodge);
    var factor = n(stats.as) * n(stats.critFactor) * hit *
      ampFactor(stats.amp, t.reduce) * (1 + n(stats.autoAmp) / 100);
    var k = convertRatio(stats);
    var mMag = magicMit(stats, t);
    var physKept = per.phys * (1 - k);
    var physMoved = per.phys * k;
    var phys = physKept * physOnlyMit(stats, t) * factor;
    var magic = (per.magic + physMoved) * mMag * factor;
    var tru = per.true * factor;   // 真实伤害不吃抗性
    return {
      phys: phys, magic: magic, true: tru, total: phys + magic + tru, perHit: per,
      convert: { ratio: k, kept: physKept * factor, moved: physMoved * factor }
    };
  }

  /* 对某个目标的每秒普攻伤害 */
  function dpsVs(stats, target) {
    return autoDpsVs(stats, target).total;
  }

  /* 自身承伤率（含减伤、普攻减伤与闪避）
   *   闪避按「命中 100 的标准对手」折算，即 100 / (闪避 + 100)
   *   肉度这条线假定「挨的是普攻」，所以「受到普攻伤害降低」也算进来 */
  function incomingFactor(stats, selfRes) {
    return mitigation(selfRes) *
      Math.max(0, 1 - n(stats.reduce) / 100) *
      Math.max(0, 1 - n(stats.autoReduce) / 100) *
      hitRate(100, stats.dodge);
  }

  /* 肉度：血量/承伤率 + 每秒回血/承伤率 + 可吸血 DPS × 吸血比例 */
  function toughness(stats, selfRes, leechDps) {
    var m = incomingFactor(stats, selfRes);
    if (m <= 1e-9) return Infinity;
    return (stats.hp + stats.regen5 / 5) / m + leechDps * stats.lifesteal;
  }

  /* 重伤的实际减疗比例（0~1）：就是重伤% 本身，永久生效，没有覆盖率折算 */
  function gwEffect(stats) {
    if (!stats) return 0;
    return Math.min(1, Math.max(0, n(stats.gw) / 100));
  }

  /* ---------------- 特效伤害 ----------------
   * 一条特效的一跳原始伤害（还没过抗性）：
   *   固定值 + 攻击力×系数 + 法强×系数 + 每级×等级 + 目标最大生命×系数
   * 再按伤害类型过对应抗性，并计入命中率 / 增伤 / 减伤：
   *   物理 → 目标护甲 + 物穿（含无视护甲 / 物理转法术）；魔法 → 目标法抗 + 法穿；真实 → 不吃抗性
   *
   * 特效自身的「三个乘数」= **攻击力（含系数）/ 对应抗性的承伤率 / 触发频率（cd）**：
   *   有 cd 就走 cd，没有 cd 才按攻速；默认不吃暴击（显式勾选才乘暴击因子）、不吃攻速的额外加成。
   *   但命中率 / 增伤 / 减伤是所有伤害共有的修正，特效照样要过。
   */
  function effectBase(eff, stats, target) {
    if (!eff) return 0;
    var t = asTarget(target);
    var L = Math.max(1, n(stats && stats.level));
    return n(eff.dmg)
      + n(stats && stats.ad) * n(eff.adPct) / 100
      + n(stats && stats.ap) * n(eff.apPct) / 100
      + n(eff.perLv) * L
      + t.hp * n(eff.hpPct) / 100;
  }

  function effectHit(eff, stats, target) {
    var dmg = effectBase(eff, stats, target);
    if (!dmg) return 0;
    var t = asTarget(target);
    var afterRes;
    if (eff && eff.type === 'magic') {
      afterRes = dmg * mitigation(effectiveRes(t.mr, stats.mpenFlat, stats.mpenPct));
    } else if (eff && eff.type === 'true') {
      afterRes = dmg;
    } else {
      afterRes = dmg * physMit(stats, t);   // 物理特效同样吃「无视护甲 / 物理转法术」
    }
    return afterRes * damageFactor(stats, t);   // 命中率 / 增伤 / 减伤对所有伤害生效
  }

  /* 全部特效在指定口径下的每秒贡献
   *
   * 每条特效先算「每秒触发次数 rate」：填了冷却 = 1/cd，冷却填 0 = 攻速。
   *   触发概率 chance < 100 时，按期望值折算。
   *   瞬时型（dur = 0）：平均每秒 = 每跳伤害 × rate
   *   持续型（dur > 0）：每秒跳 tick 次，层数会累积
   *       平均层数 = min(最多层数, 持续秒数 × rate)
   *       平均每秒 = 每跳伤害 × 平均层数 × tick
   *       （cd 比 dur 长时层数 < 1，等价于「有空窗」；最多层数填 1 时自动退化为刷新式）
   *   burst 口径：每条只算「一轮的完整伤害」= 持续 per × dur × tick，不计层数
   */
  function specialPerSec(items, stats, target, mode) {
    var out = {
      mode: mode || 'none',
      total: 0,
      leech: 0,                          // 吃吸血的特效在本口径下的每秒伤害
      leechAvg: 0,                       // 吃吸血的特效按长期平均计的每秒伤害
      byType: { phys: 0, magic: 0, true: 0 },
      lines: []
    };
    if (!out.mode || out.mode === 'none') return out;

    (items || []).forEach(function (it) {
      if (!it || !it.effects || !it.effects.length) return;
      it.effects.forEach(function (eff) {
        var baseHit = effectHit(eff, stats, target);
        if (!baseHit) return;

        var cd = n(eff.cd);
        var dur = Math.max(0, n(eff.dur));
        var tick = Math.max(0.1, n(eff.tick) || 1);
        var maxStack = Math.max(1, Math.round(n(eff.stack) || 1));
        var chance = (eff.chance === undefined || eff.chance === null) ? 1 : Math.min(1, Math.max(0, n(eff.chance) / 100));   // 触发概率（期望值折算）
        var per = baseHit * chance;
        if (eff.crit) per *= stats.critFactor;                        // 吃暴击则乘暴击因子
        var rate = cd > 0 ? 1 / cd : Math.max(stats.as, 0);           // 每秒触发次数

        var stacks = 1;
        var perSecAvg;
        if (dur > 0) {
          stacks = Math.min(maxStack, dur * rate);   // 长期平均层数
          perSecAvg = per * stacks * tick;           // 持续期间每秒跳 tick 次
        } else {
          perSecAvg = per * rate;
        }

        var burstDmg = dur > 0 ? per * dur * tick : per;   // 一轮的完整伤害
        var perSec = out.mode === 'burst' ? burstDmg : perSecAvg;
        var type = eff.type || 'phys';

        out.total += perSec;
        out.byType[type] = (out.byType[type] || 0) + perSec;
        if (eff.leech) {
          out.leech += perSec;         // 本口径下能吸回来的那部分
          out.leechAvg += perSecAvg;   // 长期平均（与口径无关）
        }

        out.lines.push({
          item: it.name || '未命名',
          name: eff.name || '',
          type: type,
          dmg: n(eff.dmg),
          base: effectBase(eff, stats, target),
          hit: baseHit,
          per: per,
          crit: !!eff.crit,
          leech: !!eff.leech,
          chance: n(eff.chance),
          cd: cd,
          dur: dur,
          tick: tick,
          maxStack: maxStack,
          stacks: stacks,
          rate: rate,
          burstDmg: burstDmg,
          perSecAvg: perSecAvg,
          perSec: perSec
        });
      });
    });
    return out;
  }

  /* ---------------- 特效的属性加成 ----------------
   * 临时加成（含对敌削弱）用的是同一套触发参数：
   *   触发频率 = 冷却填了就 1/冷却，留 0 就按攻速；
   *   覆盖率   = min(100%, 持续时间 × 触发频率)，持续时间留 0 = 常驻（100%）。
   * **主动加成（active）不折算**：它是留着开团用的，摊成平均值没有意义，
   * 所以只在「爆发 1s」口径下全额生效，「不含特效」与「平均」两档都当没有它。
   * 输出的是「一个周期内的平均值」，会加进人物属性后重算一遍，所以攻速 / 攻击 / 法强 / 抗性 / 削抗 /
   * 减攻速这些都能用同一条特效表达。
   */
  function tempStats(items, stats, mode) {
    var out = { lines: [], mode: mode || 'avg' };
    Data.STAT_DEFS.forEach(function (d) { out[d.key] = 0; });
    var as = Math.max(0, n(stats && stats.as));
    (items || []).forEach(function (it) {
      ((it && it.effects) || []).forEach(function (eff) {
        var b = eff && eff.buff;
        if (!b) return;
        var add = {}, any = false;
        Data.STAT_DEFS.forEach(function (d) {
          var v = n(b[d.key]);
          if (!v) return;
          add[d.key] = v;
          any = true;
        });
        if (!any) return;

        var cd = n(eff.cd);
        var dur = Math.max(0, n(eff.dur));
        var rate = cd > 0 ? 1 / cd : as;              // 每秒触发次数
        var active = !!eff.active;
        var up = active
          ? (out.mode === 'burst' ? 1 : 0)            // 主动：只有爆发档全额生效
          : (dur > 0 ? Math.min(1, dur * rate) : 1);  // 被动：按覆盖率折算

        Data.STAT_DEFS.forEach(function (d) {
          if (!add[d.key]) return;
          out[d.key] += add[d.key] * up;
        });
        out.lines.push({
          item: it.name || '未命名',
          name: eff.name || '',
          buff: add,
          dur: dur,
          cd: cd,
          rate: rate,
          active: active,
          uptime: up
        });
      });
    });
    return out;
  }

  function hasBuffs(b) {
    return !!b && Data.BUFF_DEFS.some(function (d) { return Math.abs(n(b[d.key])) > 1e-9; });
  }

  /* 把攻速削减套到某个属性对象上（斗蛐蛐用：对方的减攻速会影响我的攻速） */
  function applyAsSlow(st, slowPct) {
    var slow = n(slowPct);
    if (!st || !slow) return st;
    var caps = Data.CAPS || { as: 2.5 };
    var bonus = n(st.asBonus) - slow / 100;
    var asRaw = Math.max(0, n(st.asBase) * (1 + bonus));
    return Object.assign({}, st, {
      asBonus: bonus,
      asRaw: asRaw,
      as: Math.min(asRaw, caps.as),
      asCapped: asRaw > caps.as + 1e-9
    });
  }

  /* 三个口径一次性全算出来（计算器要在同一处并列展示三档 DPS 与三档肉度）
   *   每一档的属性都单独算一遍：主动加成只在「爆发 1s」生效，所以三档的面板并不相同。
   *   肉度里的吸血项跟着口径走：不含特效 → 特效不参与；爆发 → 按一轮伤害；
   *   平均 → 按长期平均。所以只有「吃吸血的特效」存在时，三档肉度才会不同。 */
  function evaluateModes(base, items, dummy) {
    var tgt = asTarget(dummy || {});
    var st0 = heroStats(base, items);
    var modes = {};
    (Data.FX_MODES || [{ key: 'none' }]).forEach(function (m) {
      var buffs = tempStats(items, st0, m.key);
      var st = hasBuffs(buffs) ? heroStats(base, items, buffs) : st0;
      var auto = autoDpsVs(st, tgt);
      var fx = specialPerSec(items, st, tgt, m.key);
      var leechDps = auto.total + fx.leech;
      modes[m.key] = {
        mode: m.key,
        stats: st,
        buffs: buffs,
        auto: auto,
        baseDps: auto.total,
        fx: fx,
        fxTotal: fx.total,
        dps: auto.total + fx.total,
        leechDps: leechDps,
        tankArmor: toughness(st, st.armor, leechDps),
        tankMr: toughness(st, st.mr, leechDps)
      };
    });
    var first = modes[(Data.FX_MODES && Data.FX_MODES[0] ? Data.FX_MODES[0].key : 'none')] || modes.none;
    return {
      st0: st0,
      target: tgt,
      modes: modes,
      stats: first.stats,        // 默认档（不含特效）的面板
      auto: first.auto,
      baseDps: first.baseDps,
      buffs: first.buffs
    };
  }

  /* 计算器页用的综合评估（mode = none / burst / avg） */
  function evaluate(base, items, dummy, mode) {
    var all = evaluateModes(base, items, dummy);
    var key = all.modes[mode] ? mode : 'none';
    var m = all.modes[key];
    var st = m.stats, tgt = all.target;
    return {
      stats: st,                 // 当前口径下的面板（主动加成只在爆发档里出现）
      rawStats: all.st0,         // 不含任何特效加成
      defStats: st,
      buffs: m.buffs,            // 当前口径下生效的特效加成
      dps: m.dps,                // 当前口径的总 DPS
      baseDps: m.baseDps,        // 纯普攻 DPS
      auto: m.auto,              // 普攻拆解：物理/魔法各多少、每一下的构成
      leechDps: m.leechDps,      // 可吸血的那部分每秒伤害（随口径）
      fx: m.fx,                  // 特效明细（当前口径）
      fxMode: key,
      modes: all.modes,          // 三档口径的 DPS / 肉度，供并列展示
      tankArmor: m.tankArmor,
      tankMr: m.tankMr,
      hitRate: hitRate(st.hit, tgt.dodge),     // 我方对该目标的命中率
      ampFactor: ampFactor(st.amp, tgt.reduce),// 增伤 × 对方减伤
      gwEffect: gwEffect(st),                  // 对目标施加的实际减疗比例
      target: { hp: n(dummy.hp), armor: tgt.armor, mr: tgt.mr, dodge: tgt.dodge, reduce: tgt.reduce },
      effArmor: effectiveRes(tgt.armor, st.penFlat, st.penPct),
      mitArmor: mitigation(effectiveRes(tgt.armor, st.penFlat, st.penPct))
    };
  }

  /* 斗蛐蛐的一位参战者：有 base 就现算（含特效加成），否则用传进来的 stats
   *   斗蛐蛐会打一段时间，所以「残血才生效」的无相之力比例按两段平均（hpMix）算进来 */
  function prepSide(side, mode) {
    var items = (side && side.items) || [];
    if (!side) return { stats: heroStats({}, []), buffs: null };
    if (!side.base) return { stats: side.stats || heroStats({}, items), buffs: null };
    var st0 = heroStats(side.base, items, null, { hpMix: true });
    var tb = tempStats(items, st0, mode);
    return { stats: hasBuffs(tb) ? heroStats(side.base, items, tb, { hpMix: true }) : st0, buffs: tb };
  }

  /* 斗蛐蛐：双方互相攻击，取先被击杀的一方（mode 与计算器同口径）
   *
   * 这里比计算器多四件事（都是只有「有个对手」才讲得通的机制）：
   *   减攻速      → 对方的「降低对方攻速」压我的攻速
   *   普攻减伤    → 我受到的普攻伤害 × (1 - 受到普攻伤害降低)
   *   迷雾        → 迷雾之灯的主动期间双方命中归零，只有「普攻必中」的普攻不受影响
   *   反击        → 反震盔甲：对方承受「他自己 DPS 的 30%」，真实伤害、不结算抗性
   */
  function duel(sideA, sideB, mode) {
    var pA = prepSide(sideA, mode), pB = prepSide(sideB, mode);
    /* 减攻速：A 的「降低对方攻速」压 B 的攻速，反之亦然 */
    var sA0 = pA.stats, sB0 = pB.stats;
    var sA = applyAsSlow(sA0, sB0.asSlow);
    var sB = applyAsSlow(sB0, sA0.asSlow);
    var bA = pA.buffs, bB = pB.buffs;
    var eA = sA, eB = sB;   // 加成已经算进 stats 里了
    var tA_ = { armor: eB.armor, mr: eB.mr, dodge: eB.dodge, reduce: eB.reduce, hp: eB.hp };
    var tB_ = { armor: eA.armor, mr: eA.mr, dodge: eA.dodge, reduce: eA.reduce, hp: eA.hp };
    var fxA = specialPerSec(sideA.items, sA, tA_, mode);
    var fxB = specialPerSec(sideB.items, sB, tB_, mode);
    var autoA = autoDpsVs(sA, tA_);
    var autoB = autoDpsVs(sB, tB_);

    /* 迷雾：持续时间内的覆盖率，双方都按这个比例「打空」，普攻必中的除外 */
    var fog = Math.max(n(sA.fogUptime), n(sB.fogUptime)) / 100;
    function fogMul(st) {
      if (fog <= 0) return { auto: 1, fx: 1 };
      if (st.autoNoMiss) return { auto: 1, fx: 1 - fog };   // 普攻不会落空，特效照样落空
      return { auto: 1 - fog, fx: 1 - fog };
    }
    var fmA = fogMul(eA), fmB = fogMul(eB);
    var autoOutA = autoA.total * fmA.auto;
    var autoOutB = autoB.total * fmB.auto;
    var fxOutA = fxA.total * fmA.fx;
    var fxOutB = fxB.total * fmB.fx;
    var dpsA = autoOutA + fxOutA;    // A 的有效输出
    var dpsB = autoOutB + fxOutB;
    var leechA = autoOutA + fxA.leech * fmA.fx;
    var leechB = autoOutB + fxB.leech * fmB.fx;
    var regenA = eA.regen5 / 5;
    var regenB = eB.regen5 / 5;

    // 打过来的伤害：普攻部分吃「受到普攻伤害降低」，特效不吃
    var incA = autoOutB * (1 - n(eA.autoReduce) / 100) + fxOutB;
    var incB = autoOutA * (1 - n(eB.autoReduce) / 100) + fxOutA;
    // 反震：A 有反震 → B 承受 B 自己输出的一定比例（真实伤害，不过抗性）
    var reflToA = n(eB.reflectPct) / 100 * dpsA;
    var reflToB = n(eA.reflectPct) / 100 * dpsB;

    // 重伤：A 打出的重伤削减 B 的回复，反之亦然
    var gwA = gwEffect(sA);   // A 施加给 B 的减疗比例
    var gwB = gwEffect(sB);   // B 施加给 A 的减疗比例
    var healMulA = 1 - gwB;   // A 自身的回复倍率（被 B 削减）
    var healMulB = 1 - gwA;

    // 一方净掉血速度 = 对方打过来的伤害 + 对方反震 -（自己每秒回血 + 自己可吸血 DPS × 自己吸血）× 回复倍率
    var healA = (regenA + leechA * eA.lifesteal) * healMulA;
    var healB = (regenB + leechB * eB.lifesteal) * healMulB;
    var netA = incA + reflToA - healA;
    var netB = incB + reflToB - healB;

    var hpA = eA.hp;   // 含护盾等效生命
    var hpB = eB.hp;
    var tA = netA > 0 ? hpA / netA : Infinity; // 我方存活时间
    var tB = netB > 0 ? hpB / netB : Infinity; // 敌方存活时间

    var out = {
      A: {
        stats: sA, defStats: eA, buffs: bA, hp: hpA,
        dps: dpsA, baseDps: autoOutA, auto: autoA, leechDps: leechA, fx: fxA, fxOut: fxOutA,
        net: netA, t: tA, regen: regenA, heal: healA, healMul: healMulA,
        reflect: reflToB, fogMul: fmA.auto, fogFx: fmA.fx,
        hitRate: hitRate(sA.hit, eB.dodge), gwOut: gwA
      },
      B: {
        stats: sB, defStats: eB, buffs: bB, hp: hpB,
        dps: dpsB, baseDps: autoOutB, auto: autoB, leechDps: leechB, fx: fxB, fxOut: fxOutB,
        net: netB, t: tB, regen: regenB, heal: healB, healMul: healMulB,
        reflect: reflToA, fogMul: fmB.auto, fogFx: fmB.fx,
        hitRate: hitRate(sB.hit, eA.dodge), gwOut: gwB
      },
      fog: fog,
      winner: null, time: Infinity, remainPct: 0, draw: false
    };

    if (!isFinite(tA) && !isFinite(tB)) {
      out.draw = true;
      return out;
    }
    var aWins = tB <= tA;                 // 敌方先倒 → 我方胜
    var t = aWins ? tB : tA;
    var win = aWins ? out.A : out.B;

    // 赢方剩余血量 = 自身生命 - 自身在这段时间里的掉血速度 × 时间
    var remain = win.hp - win.net * t;
    remain = Math.max(0, Math.min(win.hp, remain));

    out.winner = aWins ? 'A' : 'B';
    out.time = t;
    out.remainPct = win.hp > 0 ? (remain / win.hp) * 100 : 0;
    out.remainHp = remain;
    return out;
  }

  /* 便于外部构造一个「参战方」 */
  function combatant(base, items) {
    var st = heroStats(base, items);
    return { stats: st };
  }

  return {
    heroStats: heroStats,
    sumItems: sumItems,
    mitigation: mitigation,
    effectiveRes: effectiveRes,
    physMit: physMit,
    physOnlyMit: physOnlyMit,
    magicMit: magicMit,
    convertRatio: convertRatio,
    hitRate: hitRate,
    ampFactor: ampFactor,
    gwEffect: gwEffect,
    dpsVs: dpsVs,
    autoPerHit: autoPerHit,
    autoDpsVs: autoDpsVs,
    toughness: toughness,
    effectBase: effectBase,
    effectHit: effectHit,
    tempStats: tempStats,
    defenseBuffs: tempStats,
    applyAsSlow: applyAsSlow,
    hasBuffs: hasBuffs,
    specialPerSec: specialPerSec,
    evaluateModes: evaluateModes,
    evaluate: evaluate,
    duel: duel,
    combatant: combatant
  };
})();
