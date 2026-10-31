/* ============================================================
 * main.js —— 视图切换 / 全局事件 / 启动
 * ------------------------------------------------------------
 * 页面所有交互都走一个委托在 document 上的 click 监听，
 * 按钮只要带 data-act / data-cat / data-edit / data-del 就会被接住，
 * 所以新增按钮不用再单独绑事件。
 *
 * 加载顺序（index.html 里固定）：
 *   data.js → engine.js → items.js → core.js → ui/* → pages/* → admin/* → bili.js → main.js
 * ============================================================ */
(function (global) {
  'use strict';

  var App = global.H300;
  var Data = global.HeroData;
  var $ = App.$;
  var $$ = App.$$;
  var clone = App.clone;
  var state = App.state;

  var VIEWS = ['calc', 'duel', 'items', 'bili', 'about'];

  function setView(v) {
    if (VIEWS.indexOf(v) < 0) v = 'calc';
    state.view = v;
    App.save();
    if (location.hash !== '#' + v) {
      try { history.replaceState(null, '', '#' + v); } catch (e) { location.hash = v; }
    }
    $$('#tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.view === v); });
    $$('.view').forEach(function (s) { s.classList.toggle('active', s.id === 'view-' + v); });

    if (v === 'calc') App.initCalc();
    else if (v === 'duel') App.initDuel();
    else if (v === 'items') App.initGallery();
    else if (v === 'bili' && global.HeroBili) global.HeroBili.init();
  }

  /* ---------------- 全局点击委托 ---------------- */

  document.addEventListener('click', function (e) {
    var tab = e.target.closest('#tabs button');
    if (tab) { setView(tab.dataset.view); return; }

    var cat = e.target.closest('[data-cat]');
    if (cat) {
      var catName = cat.getAttribute('data-cat');
      if (cat.closest('#galCats')) {
        App.ui.galCat = catName;
        App.renderGalleryCats();
        App.renderItemTable();
      } else {
        App.ui.activeCat = catName;
        App.renderCatChips();
        App.renderItemGrid($('#itemGrid'), state.selected, {
          filtered: true,
          after: function () { App.renderPickSummary(); App.renderResultBar(); }
        });
      }
      return;
    }

    var edit = e.target.closest('[data-edit]');
    if (edit) {
      var it = state.items.find(function (x) { return x.id === edit.getAttribute('data-edit'); });
      if (it) App.openItemEditor(it);
      return;
    }

    var del = e.target.closest('[data-del]');
    if (del) {
      var id = del.getAttribute('data-del');
      var target = state.items.find(function (x) { return x.id === id; });
      if (!target) return;
      if (!confirm('删除装备「' + (target.name || '未命名') + '」？')) return;
      state.items = state.items.filter(function (x) { return x.id !== id; });
      state.selected = state.selected.filter(function (x) { return x !== id; });
      state.enemy.selected = state.enemy.selected.filter(function (x) { return x !== id; });
      App.save();
      App.renderItemTable();
      App.initCalcIfVisible();
      return;
    }

    var act = e.target.closest('[data-act]');
    if (!act) return;
    switch (act.getAttribute('data-act')) {
      case 'reset-hero':
        if (!confirm('把人物属性恢复成默认值？')) return;
        state.hero = clone(Data.HERO_DEFAULTS);
        App.save(); App.initCalc();
        break;
      case 'reset-dummy':
        state.dummy = clone(Data.DUMMY_DEFAULTS);
        App.save(); App.initCalc();
        break;
      case 'snap': {
        var cur = App.evalCurrent();
        state.snapshot = { dps: cur.dps, tankArmor: cur.tankArmor, tankMr: cur.tankMr, fxMode: state.fxMode, at: Date.now() };
        App.save(); App.renderResultBar();
        App.toast('已记录当前值');
        break;
      }
      case 'fx-mode': {
        var m = act.getAttribute('data-mode');
        if (!App.FX_MODE_MAP[m]) return;
        state.fxMode = m;
        App.save();
        App.renderResultBar();
        if (state.view === 'duel') { App.renderFxModeLine(); App.runDuel(); }
        break;
      }
      case 'snap-clear':
        state.snapshot = null;
        App.save(); App.renderResultBar();
        break;
      case 'run-duel':
        App.runDuel();
        break;
      case 'enemy-from-dummy':
        state.enemy.hero.hp = state.dummy.hp;
        state.enemy.hero.armor = state.dummy.armor;
        state.enemy.hero.mr = state.dummy.mr;
        App.save(); App.initDuel();
        App.toast('敌方已按木桩数值初始化');
        break;
      case 'new-item':
        App.openItemEditor(null);
        break;
      case 'bulk-import':
        App.openBulkImport();
        break;
      case 'export-items-js':
        App.exportItemsJs();
        break;
      case 'drop-draft':
        if (!confirm('丢弃本地草稿，恢复成 data/items.js 里的数据？')) return;
        localStorage.removeItem(App.DRAFT_KEY);
        location.reload();
        break;
    }
  });

  /* ---------------- 启动 ---------------- */

  // 清理已经失效的选中项（装备被删掉后 localStorage 里可能还留着 id）
  state.selected = state.selected.filter(function (id) {
    return state.items.some(function (it) { return it.id === id; });
  });
  state.enemy.selected = state.enemy.selected.filter(function (id) {
    return state.items.some(function (it) { return it.id === id; });
  });

  setView((location.hash || '').replace('#', '') || state.view || 'calc');

  // 编辑模式才显示维护工具条
  if (App.DEV) {
    var devBar = $('#devBar');
    if (devBar) devBar.hidden = false;
  }

  global.addEventListener('hashchange', function () {
    var v = (location.hash || '').replace('#', '');
    if (v && v !== state.view) setView(v);
  });

  /* 调试钩子（可在控制台直接调用） */
  App.setView = setView;
  global.__hero300 = {
    state: state,
    save: App.save,
    setView: setView,
    openItemEditor: App.openItemEditor,
    openBulkImport: App.openBulkImport,
    parseTable: App.parseTable,
    itemsJsText: App.itemsJsText
  };
})(window);
