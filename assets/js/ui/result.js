/* ============================================================
 * ui/result.js —— 顶部结果条、三档特效口径表、属性 chips
 * ------------------------------------------------------------
 *   H300.renderResultBar()   重画三张结果卡 + 特效口径区
 *   H300.evalCurrent()       按当前状态算一遍（引擎 evaluate）
 *   H300.fxModeButtons()     三档口径按钮
 *   H300.renderChips()       裸装属性 chips（计算器 + 斗蛐蛐左右两栏）
 * ============================================================ */
(function (global) {
  'use strict';

  var App = global.H300;
  var Data = global.HeroData;
  var Engine = global.HeroEngine;
  var $ = App.$;
  var esc = App.esc;
  var fmt = App.fmt;
  var signed = App.signed;
  var state = App.state;

  function evalCurrent() {
    return Engine.evaluate(state.hero, App.itemsOf(state.selected), state.dummy, state.fxMode);
  }

  /* 口径切换按钮（计算器页与斗蛐蛐页共用同一份状态） */
  function fxModeButtons() {
    return Data.FX_MODES.map(function (m) {
      return '<button class="' + (state.fxMode === m.key ? 'active' : '') + '" data-act="fx-mode" data-mode="' + m.key + '" title="' + esc(m.desc) + '">' + m.label + '</button>';
    }).join('');
  }

  /* 特效明细里那一串算式 */
  function fxMathText(l, st) {
    var t = App.FX_TYPE_MAP[l.type] ? App.FX_TYPE_MAP[l.type].label : '物理';
    /* base = 这一跳的原始伤害（含攻击力 / 法强 / 等级 / 目标生命上限的加成） */
    var raw = (l.base === undefined ? l.dmg : l.base);
    var head = fmt(raw, 1) + ' ' + t;
    if (l.chance !== undefined && l.chance < 100) head += ' ×' + l.chance + '%触发';
    if (l.crit) head += ' ×暴击 ' + st.critFactor.toFixed(2);
    var hit = (l.dur > 0 ? '每跳 ' : '单次 ') + fmt(l.per, 1);
    var tickTxt = (l.tick && l.tick !== 1) ? ' · 每秒 ' + l.tick + ' 跳' : '';

    if (state.fxMode === 'burst') {
      return head + ' → ' + hit + ' · ' +
        (l.dur > 0 ? '持续 ' + l.dur + 's 共 ' + fmt(l.burstDmg, 1) + '（一轮）' + tickTxt : '1s 内一次性');
    }
    if (l.dur > 0) {
      var trig = l.cd > 0 ? '1/' + l.cd + 's' : '攻速 ' + l.rate.toFixed(2);
      return head + ' → ' + hit + ' · 持续 ' + l.dur + 's × 触发 ' + trig + tickTxt +
        ' → ' + l.stacks.toFixed(2) + ' 层' + (l.stacks < 0.999 ? '（有空窗）' : '');
    }
    return head + ' → ' + hit + ' · ' + (l.cd > 0 ? '÷ ' + l.cd + 's' : '× 攻速 ' + st.as.toFixed(2));
  }

  /* 三档口径并列：DPS 与肉度各三行，按当前口径高亮 */
  function fxModeTable(cur) {
    var rows = Data.FX_MODES.map(function (m) {
      var r = (cur.modes && cur.modes[m.key]) || { dps: 0, tankArmor: 0, tankMr: 0, fxTotal: 0 };
      return '<div class="fx-mrow' + (state.fxMode === m.key ? ' active' : '') + '">' +
        '<span class="fx-mname">' + m.label + '</span>' +
        '<span>' + fmt(r.dps, 1) + '</span>' +
        '<span>' + fmt(r.tankArmor, 0) + '</span>' +
        '<span>' + fmt(r.tankMr, 0) + '</span>' +
        '<span class="dim">' + (r.fxTotal > 0 ? '+' + fmt(r.fxTotal, 1) : '—') + '</span>' +
        '</div>';
    }).join('');
    return '<div class="fx-modes-table">' +
      '<div class="fx-mrow head">' +
        '<span>口径</span><span>DPS</span><span>肉度 · 护甲</span><span>肉度 · 法抗</span><span>特效 /s</span>' +
      '</div>' + rows + '</div>';
  }

  function renderResultBar() {
    var cur = evalCurrent();
    var base = Engine.evaluate(state.hero, [], state.dummy, state.fxMode);
    var snap = state.snapshot;
    var modeInfo = App.FX_MODE_MAP[state.fxMode] || Data.FX_MODES[0];
    var modeMismatch = !!(snap && snap.fxMode && snap.fxMode !== state.fxMode);

    var fxExtra = '';
    if (cur.fx.total > 0) {
      var share = cur.dps > 0 ? (cur.fx.total / cur.dps) * 100 : 0;
      fxExtra = '特效 <b>+' + fmt(cur.fx.total, 1) + '</b> · 占 ' + share.toFixed(1) + '%';
    }

    /* 对战修正：只影响普攻与回复的分项，偏离默认值时才显示 */
    var mods = [];
    if (cur.hitRate < 0.9999) mods.push('命中率 <b>' + (cur.hitRate * 100).toFixed(1) + '%</b>');
    if (+cur.stats.amp) mods.push('增伤 ' + signed(+cur.stats.amp, 0));
    if (+state.dummy.reduce) mods.push('木桩减伤 ' + fmt(+state.dummy.reduce, 0) + '%');
    if (+cur.stats.gw) mods.push('重伤 ' + fmt(cur.stats.gw, 0) + '%');
    var modTxt = mods.length ? '<div class="metric-fx">' + mods.join(' · ') + '</div>' : '';

    /* 面板上的攻击力 / 法强（无相之力已并入其中，不单独标注） */
    var panelTxt = '<div class="metric-fx">攻击力 <b>' + fmt(cur.stats.ad, 1) +
      '</b> · 法强 <b>' + fmt(cur.stats.ap, 0) + '</b></div>';

    /* 普攻构成：不是默认的「1.0 攻击力物理」、或带「物理转法术」时才多写一行 */
    var autoTxt = '';
    var per = cur.auto.perHit;
    var plainAuto = per.parts.length === 1 && per.parts[0].type === 'phys' &&
      per.parts[0].ad === 1 && !per.parts[0].ap && !per.parts[0].flat && !per.parts[0].perLv;
    var conv = Math.max(0, +cur.stats.physToMagic || 0);
    if (per.total > 0 && (!plainAuto || conv > 0)) {
      var bits = [];
      if (per.phys > 0) bits.push('物理 ' + fmt(per.phys, 1));
      if (per.magic > 0) bits.push('魔法 ' + fmt(per.magic, 1));
      if (per.true > 0) bits.push('真实 ' + fmt(per.true, 1));
      var split = [fmt(cur.auto.phys, 1), fmt(cur.auto.magic, 1)];
      if (cur.auto.true > 0) split.push(fmt(cur.auto.true, 1));
      var head = '每一下 <b>' + bits.join(' + ') + '</b>';
      if (conv > 0) {
        head += ' · 结转后 <b>' + fmt(100 - conv, 1) + '% 物理 / ' + fmt(conv, 1) + '% 法术</b>';
      }
      autoTxt = '<div class="metric-fx">' + head + ' · DPS 拆 ' + split.join(' / ') + '</div>';
    }

    /* 特效的属性加成：被动的按覆盖率折成平均、主动只在爆发档生效，都已经并进上面的面板值 */
    var buffTxt = '';
    if (cur.buffs && App.hasBuffs(cur.buffs)) {
      var bb = [];
      Data.BUFF_DEFS.forEach(function (d) {
        var v = cur.buffs[d.key];
        if (!v) return;
        var t = App.statText ? App.statText(d, v) : (d.short + ' ' + v);
        var i = t.indexOf(' ');
        bb.push(i < 0 ? t : t.slice(0, i) + ' <b>' + t.slice(i + 1) + '</b>');   // 名称与数值分开加粗
      });
      buffTxt = '<div class="metric-fx">特效加成' + (cur.fxMode === 'avg' ? '（主动不计）' : '') + bb.join(' · ') + '</div>';
    }

    var metrics = [
      { key: 'dps', label: '每秒伤害', unit: 'DPS', d: 1, v: cur.dps, b: base.dps, extra: panelTxt + autoTxt + fxExtra + modTxt },
      { key: 'tankArmor', label: '肉度（对护甲）', unit: '', d: 0, v: cur.tankArmor, b: base.tankArmor, extra: buffTxt },
      { key: 'tankMr', label: '肉度（对法抗）', unit: '', d: 0, v: cur.tankMr, b: base.tankMr }
    ];

    var html = metrics.map(function (m) {
      var ratio = m.b > 0 ? (m.v / m.b) * 100 : 0;
      var pctTxt = m.b > 0 ? ratio.toFixed(1) + '%' : '—';
      var delta = '';
      if (snap && snap[m.key] > 0) {
        var dd = (m.v / snap[m.key] - 1) * 100;
        var cls = Math.abs(dd) < 0.05 ? 'flat' : (dd > 0 ? 'up' : 'down');
        delta = '<span class="metric-delta ' + cls + '">' + (Math.abs(dd) < 0.05 ? '±0.0%' : signed(dd, 1)) + ' 对比记录' +
          (modeMismatch ? '<i>·口径已变</i>' : '') + '</span>';
      }
      return '<div class="metric">' +
        '<div class="metric-label">' + m.label + '</div>' +
        '<div class="metric-value">' + fmt(m.v, m.d) + (m.unit ? '<span class="unit">' + m.unit + '</span>' : '') + '</div>' +
        '<div class="metric-sub">基准 ' + fmt(m.b, m.d) + ' · 相对基准 <b>' + pctTxt + '</b>' +
        (m.b > 0 ? '<span class="metric-delta ' + (ratio > 100.05 ? 'up' : (ratio < 99.95 ? 'down' : 'flat')) + '">' + signed(ratio - 100, 1) + '</span>' : '') +
        delta + '</div>' +
        (m.extra ? '<div class="metric-fx">' + m.extra + '</div>' : '') +
        '</div>';
    }).join('');

    var warn = [];
    if (cur.stats.asCapped) warn.push('攻速已封顶 ' + Data.CAPS.as + '（溢出值 ' + cur.stats.asRaw.toFixed(3) + ' 不再生效）');
    if (cur.stats.critCapped) warn.push('暴击率已封顶 ' + (Data.CAPS.crit * 100) + '%');

    /* 特效明细 */
    var fxCount = 0;
    App.itemsOf(state.selected).forEach(function (it) { fxCount += (it.effects || []).length; });
    var fxDetail;
    if (state.fxMode === 'none') {
      fxDetail = '<div class="fx-empty">' +
        (fxCount
          ? '已选装备上有 <b>' + fxCount + '</b> 条特效；爆发与平均两档的数值已列在上表，这里只展开当前这一档。'
          : '这一档只算属性带来的普攻伤害，特效一律不计。') +
        '</div>';
    } else if (!cur.fx.lines.length) {
      fxDetail = '<div class="fx-empty">已选装备没有可计入的特效伤害。</div>';
    } else {
      fxDetail = '<div class="fx-lines">' + cur.fx.lines.map(function (l) {
        return '<div class="fx-line">' +
          '<span class="fx-line-name">' + esc(l.name || '特效') +
            (l.crit ? '<em class="fx-tag">暴</em>' : '') +
            (l.leech ? '<em class="fx-tag">吸</em>' : '') +
            '<i>' + esc(l.item) + '</i></span>' +
          '<span class="fx-line-math">' + fxMathText(l, cur.stats) + '</span>' +
          '<span class="fx-line-val">+' + fmt(l.perSec, 1) + '/s</span>' +
          '</div>';
      }).join('') +
      '<div class="fx-line total"><span class="fx-line-name">合计</span>' +
        '<span class="fx-line-math">物理 ' + fmt(cur.fx.byType.phys, 1) +
        ' · 魔法 ' + fmt(cur.fx.byType.magic, 1) +
        ' · 真实 ' + fmt(cur.fx.byType.true, 1) + '</span>' +
        '<span class="fx-line-val">+' + fmt(cur.fx.total, 1) + '/s</span></div>' +
      '</div>';
    }

    var fxCtl =
      '<div class="fx-ctl">' +
        '<div class="fx-ctl-head">' +
          '<span class="fx-ctl-label">特效口径</span>' +
          '<div class="fx-modes">' + fxModeButtons() + '</div>' +
          '<span class="fx-ctl-desc">' + esc(modeInfo.desc) + '</span>' +
        '</div>' +
        fxModeTable(cur) +
        (fxCount ? '<div class="fx-note">三档 DPS 的差来自特效伤害；肉度的差来自「吃吸血的特效」与主动加成（只在爆发档生效）。</div>' : '') +
        fxDetail +
      '</div>';

    var snapBox =
      '<div class="snap-box">' +
        '<button class="primary" data-act="snap">记录当前值</button>' +
        (snap
          ? '<button class="ghost" data-act="snap-clear">清除记录</button>' +
            '<div class="snap-line">DPS ' + fmt(snap.dps, 1) + ' · 肉度 ' + fmt(snap.tankArmor, 0) + ' / ' + fmt(snap.tankMr, 0) +
            (snap.fxMode ? ' · 口径 ' + ((App.FX_MODE_MAP[snap.fxMode] || {}).short || '本体') : '') + '</div>'
          : '<div class="snap-line">先记录一次，再增减装备就能看到增幅 / 削弱。</div>') +
        (warn.length ? '<div class="snap-line cap">' + warn.join('；') + '</div>' : '') +
      '</div>';

    var bar = $('#resultBar');
    if (bar) bar.innerHTML = html + snapBox + fxCtl;
  }

  /* ---------------- 属性 chips ---------------- */

  function chipsHtml(st) {
    var c = function (k, v) { return '<span class="chip">' + k + ' <b>' + v + '</b></span>'; };
    return [
      c('裸装攻击', fmt(st.ad, 1)),
      c('裸装攻速', st.as.toFixed(3) + (st.asCapped ? ' 封顶' : '')),
      c('暴击率', (st.crit * 100).toFixed(0) + '%' + (st.critCapped ? ' 封顶' : '')),
      c('暴击因子', st.critFactor.toFixed(3)),
      c('裸装生命', fmt(st.hp, 0)),
      c('回血/5s', fmt(st.regen5, 2)),
      c('裸装护甲', fmt(st.armor, 1)),
      c('裸装法抗', fmt(st.mr, 1)),
      c('命中 / 闪避', fmt(st.hit, 0) + ' / ' + fmt(st.dodge, 0)),
      c('增伤 / 减伤', fmt(st.amp, 0) + '% / ' + fmt(st.reduce, 0) + '%'),
      st.gw ? c('重伤', fmt(st.gw, 0) + '%') : ''
    ].join('');
  }

  function renderChips() {
    var el = $('#heroChips');
    if (el) el.innerHTML = chipsHtml(Engine.heroStats(state.hero, []));
    renderDuelChips();
  }

  function renderDuelChips() {
    var a = $('#duelChipsA'), b = $('#duelChipsB');
    if (a) a.innerHTML = chipsHtml(Engine.heroStats(state.hero, []));
    if (b) b.innerHTML = chipsHtml(Engine.heroStats(state.enemy.hero, []));
  }

  App.evalCurrent = evalCurrent;
  App.fxModeButtons = fxModeButtons;
  App.fxModeTable = fxModeTable;
  App.renderResultBar = renderResultBar;
  App.chipsHtml = chipsHtml;
  App.renderChips = renderChips;
  App.renderDuelChips = renderDuelChips;
})(window);
