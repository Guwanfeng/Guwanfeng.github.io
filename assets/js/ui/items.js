/* ============================================================
 * ui/items.js —— 装备的文案、卡片网格、分类筛选条
 * ------------------------------------------------------------
 *   H300.itemSummary(it)        一件装备的「属性 · 特效」摘要
 *   H300.effectLabel(e)         一条特效的文案
 *   H300.buffText(buff)         防御加成的紧凑文案
 *   H300.renderItemGrid(容器, 已选 id 数组, { filtered, after })
 *   H300.renderCatChips()       计算器页的分类条
 *   H300.renderGalleryCats()    图鉴页的分类条
 * ============================================================ */
(function (global) {
  'use strict';

  var App = global.H300;
  var Data = global.HeroData;
  var $ = App.$;
  var esc = App.esc;
  var fmt = App.fmt;
  var state = App.state;

  /* 特效上是否有属性加成（任意一项非 0） */
  function hasBuffs(b) {
    return !!b && Data.BUFF_DEFS.some(function (d) { return Math.abs(+b[d.key] || 0) > 1e-9; });
  }

  /* 少数属性是「开关」而不是数值（填 1 即生效），文案里不显示 +1 */
  var FLAG_STATS = { autoNoMiss: '普攻必中' };

  function statText(d, v) {
    if (FLAG_STATS[d.key]) return FLAG_STATS[d.key];
    var txt = Math.abs(v % 1) < 1e-9 ? fmt(v, 0) : fmt(v, 1);
    return d.short + ' ' + (v > 0 ? '+' : '') + txt + (d.pct ? '%' : '');
  }

  /* 属性加成的紧凑文案：攻速 +45% · 法抗 +30 · 护盾 +300 */
  function buffText(b) {
    if (!hasBuffs(b)) return '';
    var out = [];
    Data.BUFF_DEFS.forEach(function (d) {
      var v = +b[d.key] || 0;
      if (!v) return;
      out.push(statText(d, v));
    });
    return out.join(' · ');
  }

  /* 一跳伤害的构成文案：100 + 15%AP + 2%目标生命 */
  function effectDmgText(eff) {
    var bits = [];
    if (+eff.dmg) bits.push(fmt(eff.dmg, 0));
    if (+eff.adPct) bits.push(eff.adPct + '%AD');
    if (+eff.apPct) bits.push(eff.apPct + '%AP');
    if (+eff.perLv) bits.push(eff.perLv + '×等级');
    if (+eff.hpPct) bits.push(eff.hpPct + '%目标生命');
    return bits.join('+');
  }

  /* 单条特效的展示文案，如「灼烧 30+5%AP魔法/1s 持续3s×3层 [暴击]」 */
  function effectLabel(e) {
    var eff = Data.newEffect(e);
    var FX_TYPE_MAP = App.FX_TYPE_MAP;
    var parts = [];
    var dm = effectDmgText(eff);
    if (dm) {
      var t = FX_TYPE_MAP[eff.type] ? FX_TYPE_MAP[eff.type].label : '物理';
      var s = dm + t + (eff.cd > 0 ? '/' + eff.cd + 's' : '/每次攻击');
      if (eff.dur > 0) s += ' 持续' + eff.dur + 's' + (eff.tick !== 1 ? '·每' + (1 / eff.tick).toFixed(2).replace(/\.?0+$/, '') + 's一跳' : '');
      if (eff.stack > 1) s += '×' + eff.stack + '层';
      if (eff.chance < 100) s += ' ' + eff.chance + '%触发';
      var flags = [];
      if (eff.crit) flags.push('暴击');
      if (eff.leech) flags.push('吸血');
      if (flags.length) s += ' [' + flags.join('/') + ']';
      parts.push(s);
    }
    var bt = buffText(eff.buff);
    if (bt) {
      /* 主动加成不折算，所以文案里点明「主动」，并标出持续时间与冷却 */
      parts.push((eff.active ? '主动：' : '') + bt +
        (eff.dur > 0 ? ' / ' + eff.dur + 's' : '') +
        (eff.cd > 0 ? '（cd ' + eff.cd + 's）' : ''));
    }
    return (eff.name ? eff.name + ' ' : '') + (parts.join(' · ') || '空特效');
  }

  function effectSummary(it) {
    var fx = (it && it.effects) || [];
    return fx.length ? fx.map(effectLabel).join(' · ') : '';
  }

  function itemSummary(it) {
    var st = it.stats || {};
    var out = [];
    Data.STAT_DEFS.forEach(function (d) {
      var v = +st[d.key];
      if (!v) return;
      out.push(statText(d, v));
    });
    var fx = effectSummary(it);
    if (fx) out.push('特效 ' + fx);
    return out.length ? out.join(' · ') : '未填属性';
  }

  /* 未建模的特殊机制（只展示，不参与计算） */
  function itemSpecialText(it) {
    var sp = (it && it.special) || [];
    return sp.join('；');
  }

  /* 装备卡片网格；点击即勾选 / 取消 */
  function renderItemGrid(container, ids, opts) {
    if (!container) return;
    opts = opts || {};
    var q = opts.filtered ? App.ui.searchTerm.trim().toLowerCase() : '';

    var list = state.items.filter(function (it) {
      if (opts.filtered) {
        if (App.ui.activeCat !== '全部' && Data.itemCategories(it).indexOf(App.ui.activeCat) < 0) return false;
        if (q && (it.name || '').toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });

    container.innerHTML = list.length ? list.map(function (it) {
      var on = ids.indexOf(it.id) >= 0;
      var tip = [it.note || '', itemSpecialText(it) ? '未计入：' + itemSpecialText(it) : '']
        .filter(Boolean).join('\n');
      return '<button class="item' + (on ? ' on' : '') + '" data-iid="' + it.id + '" title="' + esc(tip) + '">' +
        '<span class="item-name">' + esc(it.name || '未命名') + '</span>' +
        '<span class="item-stats">' + esc(itemSummary(it)) + '</span>' +
        '</button>';
    }).join('') : '<p class="empty">' + (state.items.length ? '这个筛选下没有装备。' : '装备数据还没填。') + '</p>';

    container.onclick = function (e) {
      var btn = e.target.closest('.item');
      if (!btn) return;
      var id = btn.getAttribute('data-iid');
      var i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1); else ids.push(id);
      App.save();
      renderItemGrid(container, ids, opts);
      if (opts.after) opts.after();
    };
  }

  /* 已选件数（装备没有价格这个概念，这里只报件数） */
  function renderPickSummary() {
    var chosen = App.itemsOf(state.selected);
    var el = $('#pickSummary');
    if (el) el.innerHTML = '已选 <b>' + chosen.length + '</b> 件';
  }

  /* 分类筛选条：分类由属性自动判定，一件装备可能出现在多个分类下 */
  function catChipsHtml(active) {
    return ['全部'].concat(Data.CATEGORIES).map(function (c) {
      return '<button class="' + (c === active ? 'active' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
  }

  function renderCatChips() {
    var el = $('#catChips');
    if (el) el.innerHTML = catChipsHtml(App.ui.activeCat);
  }

  function renderGalleryCats() {
    var el = $('#galCats');
    if (el) el.innerHTML = catChipsHtml(App.ui.galCat);
  }

  App.hasBuffs = hasBuffs;
  App.buffText = buffText;
  App.statText = statText;
  App.effectDmgText = effectDmgText;
  App.effectLabel = effectLabel;
  App.effectSummary = effectSummary;
  App.itemSummary = itemSummary;
  App.itemSpecialText = itemSpecialText;
  App.renderItemGrid = renderItemGrid;
  App.renderPickSummary = renderPickSummary;
  App.renderCatChips = renderCatChips;
  App.renderGalleryCats = renderGalleryCats;
})(window);
