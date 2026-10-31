/* ============================================================
 * pages/gallery.js —— 「装备图鉴」页（只读；?dev=1 时多出编辑/删除）
 * ------------------------------------------------------------
 * 两列表格：名称（下方跟分类标签） / 属性与特效。
 * 顶部有搜索框与分类筛选，二者都是页面临时状态，不写 localStorage。
 * ============================================================ */
(function (global) {
  'use strict';

  var App = global.H300;
  var Data = global.HeroData;
  var $ = App.$;
  var esc = App.esc;
  var state = App.state;

  function galleryMatch(it) {
    var ui = App.ui;
    if (ui.galCat !== '全部' && Data.itemCategories(it).indexOf(ui.galCat) < 0) return false;
    var q = ui.galSearch.trim().toLowerCase();
    if (!q) return true;
    return ((it.name || '') + ' ' + App.itemSummary(it) + ' ' + App.itemSpecialText(it))
      .toLowerCase().indexOf(q) >= 0;
  }

  function initGallery() {
    var s = $('#galSearch');
    if (s && s.getAttribute('data-bound') !== '1') {
      s.setAttribute('data-bound', '1');
      s.oninput = function () { App.ui.galSearch = s.value; renderItemTable(); };
    }
    if (s) s.value = App.ui.galSearch;
    App.renderGalleryCats();
    renderItemTable();
  }

  function renderItemTable() {
    var t = $('#itemTable');
    if (!t) return;
    var DEV = App.DEV;
    var cnt = $('#itemCount');
    var list = state.items.filter(galleryMatch);
    if (cnt) {
      cnt.textContent = '共 ' + state.items.length + ' 件' +
        (list.length !== state.items.length ? ' · 筛出 ' + list.length + ' 件' : '');
    }

    if (!state.items.length) {
      t.innerHTML = '<tbody><tr><td class="empty">装备数据还没填。数据在 data/items.js，由作者维护。</td></tr></tbody>';
      return;
    }

    t.innerHTML = '<thead><tr><th>名称</th><th>属性与特效</th>' +
      (DEV ? '<th></th>' : '') + '</tr></thead><tbody>' +
      (list.length ? list.map(function (it) {
        var sp = App.itemSpecialText(it);
        return '<tr>' +
          '<td class="name-cell">' + esc(it.name || '未命名') +
            '<span class="item-cats">' + esc(Data.itemCategories(it).join(' / ')) + '</span></td>' +
          '<td class="num">' + esc(App.itemSummary(it)) +
            (it.note ? '<span class="item-special">注：' + esc(it.note) + '</span>' : '') +
            (sp ? '<span class="item-special">未计入：' + esc(sp) + '</span>' : '') + '</td>' +
          (DEV
            ? '<td><div class="row-actions">' +
                '<button class="mini" data-edit="' + it.id + '">编辑</button>' +
                '<button class="mini del" data-del="' + it.id + '">删除</button>' +
              '</div></td>'
            : '') +
        '</tr>';
      }).join('') : '<tr><td class="empty" colspan="' + (DEV ? 3 : 2) + '">这个筛选下没有装备。</td></tr>') +
      '</tbody>';
  }

  App.initGallery = initGallery;
  App.renderItemTable = renderItemTable;
})(window);
