/* ============================================================
 * pages/calc.js —— 「计算器」页
 * ------------------------------------------------------------
 * 左侧：人物属性 + 普攻构成 + 木桩；右侧：装备选择（搜索 + 分类筛选）
 * 每次进入这个页都会整体重画，保证和 state 一致。
 * ============================================================ */
(function (global) {
  'use strict';

  var App = global.H300;
  var $ = App.$;
  var state = App.state;

  function initCalc() {
    App.renderForm($('#heroForm'), state.hero, App.HERO_FIELDS, function () {
      App.save(); App.renderResultBar(); App.renderChips();
    }, { withAuto: true });

    App.renderForm($('#dummyForm'), state.dummy, App.DUMMY_FIELDS, function () {
      App.save(); App.renderResultBar();
    });

    App.renderCatChips();
    App.renderItemGrid($('#itemGrid'), state.selected, {
      filtered: true,
      after: function () { App.renderPickSummary(); App.renderResultBar(); }
    });
    App.renderChips();
    App.renderResultBar();
    App.renderPickSummary();

    var search = $('#itemSearch');
    if (search) {
      search.value = App.ui.searchTerm;
      search.oninput = function () {
        App.ui.searchTerm = search.value;
        App.renderItemGrid($('#itemGrid'), state.selected, {
          filtered: true,
          after: function () { App.renderPickSummary(); App.renderResultBar(); }
        });
      };
    }
  }

  App.initCalc = initCalc;
})(window);
