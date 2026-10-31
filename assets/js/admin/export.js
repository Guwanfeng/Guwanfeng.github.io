/* ============================================================
 * admin/export.js —— 把当前装备数据导出成 data/items.js
 * ------------------------------------------------------------
 *   H300.itemsJsText()   生成可直接覆盖 data/items.js 的文本
 *   H300.exportItemsJs() 触发浏览器下载
 * 只导出有值的字段，导出的文件比手写更紧凑、也更好 diff。
 * ============================================================ */
(function (global) {
  'use strict';

  var App = global.H300;
  var Data = global.HeroData;
  var state = App.state;

  function compactStats(st) {
    var o = {};
    Data.STAT_DEFS.forEach(function (d) {
      var v = +(st && st[d.key]);
      if (v) o[d.key] = Math.round(v * 1000) / 1000;
    });
    return o;
  }

  function compactEffect(e) {
    var eff = Data.newEffect(e);
    var o = {};
    if (eff.name) o.name = eff.name;
    if (eff.dmg) o.dmg = eff.dmg;
    if (eff.adPct) o.adPct = eff.adPct;
    if (eff.apPct) o.apPct = eff.apPct;
    if (eff.perLv) o.perLv = eff.perLv;
    if (eff.hpPct) o.hpPct = eff.hpPct;
    o.type = eff.type;
    if (eff.cd) o.cd = eff.cd;
    if (eff.dur) o.dur = eff.dur;
    if (eff.tick !== 1) o.tick = eff.tick;
    if (eff.stack > 1) o.stack = eff.stack;
    if (eff.chance !== 100) o.chance = eff.chance;
    if (eff.crit) o.crit = true;
    if (eff.leech) o.leech = true;
    if (eff.active) o.active = true;
    if (!Data.buffEmpty(eff.buff)) {
      o.buff = {};
      Data.BUFF_DEFS.forEach(function (d) {
        var v = +eff.buff[d.key] || 0;
        if (v) o.buff[d.key] = v;
      });
    }
    return o;
  }

  /* 导出成可直接替换 data/items.js 的文件 */
  function itemsJsText() {
    var body = state.items.map(function (it) {
      var o = { id: it.id, name: it.name };
      if (it.note) o.note = it.note;
      if (it.special && it.special.length) o.special = it.special;
      o.stats = compactStats(it.stats);
      if (it.effects && it.effects.length) o.effects = it.effects.map(compactEffect);
      return '  ' + JSON.stringify(o, null, 2).replace(/\n/g, '\n  ');
    }).join(',\n');
    return 'window.HeroItems = [\n' + body + '\n];\n';
  }

  function exportItemsJs() {
    var blob = new Blob([itemsJsText()], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'items.js';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    App.toast('已导出 items.js，覆盖 data/items.js 即可');
  }

  App.itemsJsText = itemsJsText;
  App.exportItemsJs = exportItemsJs;
})(window);
