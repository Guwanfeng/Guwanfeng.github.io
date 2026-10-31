/* ============================================================
 * core.js —— 命名空间 / DOM 小工具 / 本地状态
 * ------------------------------------------------------------
 * 这是所有模块的底座，必须在 data.js、engine.js 之后加载。
 *   window.H300            全局命名空间，别的模块往里挂函数
 *   H300.state             运行期状态（人物、木桩、已选装备…）
 *   H300.HERO_FIELDS       人物属性表单的字段表
 *   H300.DUMMY_FIELDS      木桩表单的字段表
 *   H300.$ / $$ / esc / fmt / toast / clone / signed
 *   H300.save()            把「用户的选择」写进 localStorage
 *   H300.itemsOf(ids)      id 数组 → 装备对象数组
 * ============================================================ */
(function (global) {
  'use strict';

  var Data = global.HeroData;
  var App = global.H300 = global.H300 || {};

  /* 编辑模式：网址后加 ?dev=1 才出现「新增 / 编辑 / 导入 / 导出」等维护工具。
   * 普通访客只会看到只读的装备图鉴。 */
  App.DEV = /[?&]dev=1(&|$)/.test(location.search);

  App.LS_KEY = 'hero300.state.v2';        // 只存用户的选择
  App.DRAFT_KEY = 'hero300.items.draft.v1'; // 编辑模式下的装备草稿

  /* ---------------- DOM 小工具 ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(v, d) {
    if (v === Infinity) return '∞';
    if (!isFinite(v)) return '—';
    var dd = d === undefined ? 1 : d;
    var s = v.toFixed(dd);
    var p = s.split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return p.join('.');
  }

  function signed(v, d) {
    var dd = d === undefined ? 1 : d;
    return (v > 0 ? '+' : '') + v.toFixed(dd) + '%';
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1900);
  }

  App.$ = $;
  App.$$ = $$;
  App.clone = clone;
  App.esc = esc;
  App.fmt = fmt;
  App.signed = signed;
  App.toast = toast;
  global.__toast = toast;

  /* ---------------- 表单字段定义 ---------------- */

  App.HERO_FIELDS = [
    { key: 'level', label: '等级', step: 1 },
    { key: 'ad', label: '基础攻击力', step: 0.1 },
    { key: 'adGrow', label: '成长攻击力', step: 0.1 },
    { key: 'asBase', label: '基础攻速', step: 0.001 },
    { key: 'asGrow', label: '成长攻速', step: 0.001 },
    { key: 'crit', label: '基础暴击率 %', step: 1 },
    { key: 'critDmg', label: '基础暴击伤害 %', step: 1 },
    { key: 'ap', label: '基础法术强度', step: 1 },
    { key: 'hp', label: '基础生命值', step: 1 },
    { key: 'hpGrow', label: '成长生命值', step: 1 },
    { key: 'hpRegen5', label: '基础回血 /5s', step: 0.01 },
    { key: 'hpRegen5Grow', label: '成长回血 /5s', step: 0.01 },
    { key: 'armor', label: '基础护甲', step: 0.1 },
    { key: 'armorGrow', label: '成长护甲', step: 0.1 },
    { key: 'mr', label: '基础法术抗性', step: 0.1 },
    { key: 'mrGrow', label: '成长法术抗性', step: 0.1 },
    { key: 'penFlat', label: '基础固定穿透', step: 1 },
    { key: 'penFlatGrow', label: '成长固定穿透', step: 0.1 },
    { key: 'penPct', label: '基础百分比穿透 %', step: 1 },
    { key: 'lifesteal', label: '基础吸血 %', step: 1 },
    { key: 'hit', label: '命中', step: 1 },
    { key: 'dodge', label: '闪避', step: 1 },
    { key: 'amp', label: '增伤 %', step: 1 },
    { key: 'reduce', label: '减伤 %', step: 1 },
    { key: 'gw', label: '重伤 %', step: 1 }
  ];

  App.DUMMY_FIELDS = [
    { key: 'hp', label: '木桩生命值', step: 1 },
    { key: 'armor', label: '木桩护甲', step: 0.1 },
    { key: 'mr', label: '木桩法术抗性', step: 0.1 },
    { key: 'dodge', label: '木桩闪避', step: 1 },
    { key: 'reduce', label: '木桩减伤 %', step: 1 }
  ];

  /* ---------------- 特效口径查表（必须在 load 之前初始化） ---------------- */

  var FX_MODE_MAP = {};
  Data.FX_MODES.forEach(function (m) { FX_MODE_MAP[m.key] = m; });
  var FX_TYPE_MAP = {};
  Data.FX_TYPES.forEach(function (t) { FX_TYPE_MAP[t.key] = t; });

  App.FX_MODE_MAP = FX_MODE_MAP;
  App.FX_TYPE_MAP = FX_TYPE_MAP;

  /* ---------------- 界面上的临时筛选项（不进 localStorage） ---------------- */

  App.ui = {
    searchTerm: '',      // 计算器页的装备搜索词
    activeCat: '全部',    // 计算器页的分类筛选
    galSearch: '',       // 装备图鉴的搜索词
    galCat: '全部'        // 装备图鉴的分类筛选
  };

  /* ---------------- 状态 ---------------- */

  /* 装备数据只来自 data/items.js（作者维护）；
   * 编辑模式下优先读本地草稿，方便先改后导出 */
  function initialItems() {
    if (App.DEV) {
      try {
        var raw = localStorage.getItem(App.DRAFT_KEY);
        if (raw) return Data.normalizeList(JSON.parse(raw));
      } catch (e) {}
    }
    return Data.normalizeList(global.HeroItems || []);
  }

  function load() {
    var base = {
      hero: clone(Data.HERO_DEFAULTS),
      dummy: clone(Data.DUMMY_DEFAULTS),
      items: initialItems(),
      selected: [],
      enemy: { hero: clone(Data.HERO_DEFAULTS), selected: [] },
      snapshot: null,
      fxMode: 'none',
      view: 'calc'
    };
    try {
      var raw = localStorage.getItem(App.LS_KEY);
      if (!raw) return base;
      var s = JSON.parse(raw);
      return {
        hero: Object.assign(clone(Data.HERO_DEFAULTS), s.hero || {}),
        dummy: Object.assign(clone(Data.DUMMY_DEFAULTS), s.dummy || {}),
        items: base.items,
        selected: s.selected || [],
        enemy: {
          hero: Object.assign(clone(Data.HERO_DEFAULTS), (s.enemy && s.enemy.hero) || {}),
          selected: (s.enemy && s.enemy.selected) || []
        },
        snapshot: s.snapshot || null,
        fxMode: FX_MODE_MAP[s.fxMode] ? s.fxMode : 'none',
        view: s.view || 'calc'
      };
    } catch (e) { return base; }
  }

  /* 只存「用户的选择」，装备数据不写进本地存储（避免旧数据盖掉 data/items.js） */
  function save() {
    try {
      localStorage.setItem(App.LS_KEY, JSON.stringify({
        hero: App.state.hero,
        dummy: App.state.dummy,
        selected: App.state.selected,
        enemy: App.state.enemy,
        snapshot: App.state.snapshot,
        fxMode: App.state.fxMode,
        view: App.state.view
      }));
      if (App.DEV) localStorage.setItem(App.DRAFT_KEY, JSON.stringify(App.state.items));
    } catch (e) {}
  }

  App.state = load();
  App.save = save;
  App.initialItems = initialItems;

  /* id 数组 → 装备对象数组 */
  App.itemsOf = function (ids) {
    return (ids || []).map(function (id) {
      return App.state.items.find(function (it) { return it.id === id; });
    }).filter(Boolean);
  };
})(window);
