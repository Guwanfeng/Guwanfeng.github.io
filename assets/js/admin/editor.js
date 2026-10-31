/* ============================================================
 * admin/editor.js —— 装备编辑器（只在 ?dev=1 下出现入口）
 * ------------------------------------------------------------
 *   H300.openModal(html) / H300.closeModal()
 *   H300.openItemEditor(item|null)   新增或编辑一件装备
 *   H300.initCalcIfVisible()         改完数据后重画当前那一页
 * ============================================================ */
(function (global) {
  'use strict';

  var App = global.H300;
  var Data = global.HeroData;
  var $ = App.$;
  var $$ = App.$$;
  var clone = App.clone;
  var esc = App.esc;
  var state = App.state;

  /* ---------------- 弹层 ---------------- */

  function openModal(html) {
    var mask = $('#modalMask');
    $('#modalBox').innerHTML = html;
    mask.hidden = false;
    mask.onclick = function (e) {
      if (e.target === mask) closeModal();
      if (e.target.hasAttribute('data-close')) closeModal();
    };
  }

  function closeModal() {
    var m = $('#modalMask');
    if (m) m.hidden = true;
    ($('#modalBox') || {}).innerHTML = '';
  }

  /* ---------------- 特效编辑行 ---------------- */

  /* 单条特效的编辑行（四排：伤害定义 / 持续与标记 / 加成系数 / 属性加成） */
  function fxRowHtml(e) {
    var eff = Data.newEffect(e);
    return '<div class="fx-row">' +
      '<div class="fx-l1">' +
        '<input type="text" class="fx-name" placeholder="特效名（可留空）" value="' + esc(eff.name) + '">' +
        '<input type="number" step="1" class="fx-dmg" placeholder="固定伤害" value="' + eff.dmg + '">' +
        '<select class="fx-type">' +
          Data.FX_TYPES.map(function (t) {
            return '<option value="' + t.key + '"' + (t.key === eff.type ? ' selected' : '') + '>' + t.label + '</option>';
          }).join('') +
        '</select>' +
        '<input type="number" step="0.1" class="fx-cd" placeholder="冷却" value="' + eff.cd + '">' +
      '</div>' +
      '<div class="fx-l2">' +
        '<label class="fx-mini">持续<input type="number" step="0.5" min="0" class="fx-dur" value="' + eff.dur + '">秒</label>' +
        '<label class="fx-mini">每秒<input type="number" step="0.5" min="0.1" class="fx-tick" value="' + eff.tick + '">跳</label>' +
        '<label class="fx-mini">最多<input type="number" step="1" min="1" class="fx-stack" value="' + eff.stack + '">层</label>' +
        '<label class="fx-mini">触发<input type="number" step="5" min="0" max="100" class="fx-chance" value="' + eff.chance + '">%</label>' +
        '<label class="fx-check"><input type="checkbox" class="fx-crit"' + (eff.crit ? ' checked' : '') + '><span>吃暴击</span></label>' +
        '<label class="fx-check"><input type="checkbox" class="fx-leech"' + (eff.leech ? ' checked' : '') + '><span>吃吸血</span></label>' +
        '<label class="fx-check"><input type="checkbox" class="fx-active"' + (eff.active ? ' checked' : '') + '><span>主动</span></label>' +
        '<button class="mini del fx-del" type="button">删</button>' +
      '</div>' +
      '<div class="fx-l2 fx-l3coef">' +
        '<span class="fx-l3-tag">伤害加成</span>' +
        '<label class="fx-mini">攻击力<input type="number" step="5" class="fx-coef" data-ck="adPct" value="' + eff.adPct + '">%</label>' +
        '<label class="fx-mini">法强<input type="number" step="5" class="fx-coef" data-ck="apPct" value="' + eff.apPct + '">%</label>' +
        '<label class="fx-mini">每级<input type="number" step="1" class="fx-coef" data-ck="perLv" value="' + eff.perLv + '"></label>' +
        '<label class="fx-mini">目标生命<input type="number" step="0.5" class="fx-coef" data-ck="hpPct" value="' + eff.hpPct + '">%</label>' +
      '</div>' +
      '<details class="fx-l4"' + (Data.buffEmpty(eff.buff) ? '' : ' open') + '>' +
        '<summary>属性加成（' + Data.BUFF_DEFS.length + ' 项；被动按覆盖率折算，主动只在爆发档生效）</summary>' +
        '<div class="fx-buff-grid">' +
          Data.BUFF_DEFS.map(function (d) {
            return '<label class="fx-mini">' + d.short +
              '<input type="number" step="1" class="fx-buff" data-bk="' + d.key + '" value="' +
              ((eff.buff && eff.buff[d.key]) || 0) + '"></label>';
          }).join('') +
        '</div>' +
      '</details>' +
      '</div>';
  }

  function fxEditorHtml(effects) {
    var list = (effects && effects.length) ? effects : [];
    return '<div class="stat-block fx-block">' +
      '<h4>特效（伤害 / 属性加成） <button class="mini" id="fxAdd" type="button">+ 添加一条</button></h4>' +
      '<div class="fx-head"><span>名称</span><span>固定伤害</span><span>类型</span><span>冷却（秒）</span></div>' +
      '<div id="fxList">' + list.map(fxRowHtml).join('') + '</div>' +
      (list.length ? '' : '<p class="hint fx-none">还没有特效。带伤害或带属性加成的装备点上面「+ 添加一条」。</p>') +
      '<p class="hint" style="margin:8px 0 0">' +
        '<b>冷却</b>填 0 = 每次普攻都会触发（按攻速换算）；填数值 = 按冷却触发。<br>' +
        '<b>持续</b>填 0 = 瞬时伤害 / 加成常驻；填秒数 = 持续伤害或限时加成，' +
        '<b>每秒</b>是持续期间每秒跳几次（默认 1），层数按「持续 ÷ 冷却」累积、封顶于<b>最多层数</b>。<br>' +
        '<b>触发 %</b>低于 100 就按概率折算成期望值。<br>' +
        '<b>伤害加成</b>让每跳伤害跟着攻击力 / 法强 / 等级 / 目标生命上限走（如「150+15%法强」）。<br>' +
        '<b>属性加成</b>可以是增益，也可以填对敌的削抗 / 减攻速；按覆盖率折成平均值后整块重算属性。<br>' +
        '<b>主动</b>勾上后这份加成不折算平均值：只在「爆发 1s」口径里全额生效，' +
        '「不含特效」与「平均」两档都按没有它算（留着开团用的东西，摊平均没意义）。<br>' +
        '<b>吃暴击 / 吃吸血默认都不勾</b>（绝大多数特效不吃）。<br>' +
        '物理特效吃对方护甲与物穿，魔法特效吃对方法抗与法穿，真实伤害不过抗性。' +
      '</p>' +
      '</div>';
  }

  /* ---------------- 装备编辑器 ---------------- */

  function openItemEditor(item) {
    var data = item ? clone(item) : Data.newItem();
    var isNew = !item;
    var groups = {};
    Data.STAT_DEFS.forEach(function (d) {
      (groups[d.group] = groups[d.group] || []).push(d);
    });

    var statsHtml = Object.keys(groups).map(function (g) {
      var unused = groups[g].filter(function (d) { return !d.used; })
        .map(function (d) { return d.label; });
      return '<div class="stat-block"><h4>' + g +
        (unused.length ? ' · ' + unused.join('、') + ' 暂不计入伤害公式' : '') +
        '</h4><div class="form-grid">' +
        groups[g].map(function (d) {
          var v = (data.stats && data.stats[d.key]) || 0;
          return '<label class="field"><span class="field-label">' + d.label + (d.pct ? '（%）' : '') + '</span>' +
            '<input type="number" step="0.1" data-stat="' + d.key + '" value="' + v + '"></label>';
        }).join('') +
        '</div></div>';
    }).join('');

    openModal(
      '<h3>' + (isNew ? '新增装备' : '编辑装备') + '</h3>' +
      '<div class="form-grid">' +
        '<label class="field"><span class="field-label">名称</span><input type="text" id="fName" value="' + esc(data.name) + '"></label>' +
      '</div>' +
      '<p class="hint" style="margin:-2px 0 10px">分类不用填：由下面填的属性与特效自动判定，可以同时归入多个分类。</p>' +
      statsHtml +
      fxEditorHtml(data.effects) +
      '<div class="stat-block"><h4>特殊说明（只展示、不参与计算）</h4>' +
        '<textarea id="fSpecial" placeholder="一行一条，例如：普攻不会被闪避">' +
          esc(((data.special || []).join('\n'))) + '</textarea></div>' +
      '<div class="modal-actions"><button class="ghost" data-close>取消</button>' +
      '<button class="primary" id="fSave">保存</button></div>'
    );

    $('#fxAdd').onclick = function () {
      var list = $('#fxList');
      var none = list.parentNode.querySelector('.fx-none');
      if (none) none.remove();
      var tmp = document.createElement('div');
      tmp.innerHTML = fxRowHtml(Data.newEffect());
      list.appendChild(tmp.firstChild);
    };
    $('#fxList').onclick = function (e) {
      var b = e.target.closest('.fx-del');
      if (b) b.closest('.fx-row').remove();
    };

    $('#fSave').onclick = function () {
      var name = $('#fName').value.trim();
      if (!name) { App.toast('装备名不能为空'); return; }
      data.name = name;
      data.stats = data.stats || {};
      $$('#modalBox [data-stat]').forEach(function (inp) {
        var k = inp.getAttribute('data-stat');
        var v = parseFloat(inp.value);
        data.stats[k] = isNaN(v) ? 0 : v;
      });

      data.effects = $$('#modalBox .fx-row').map(function (row) {
        var buff = {};
        $$('.fx-buff', row).forEach(function (inp) {
          buff[inp.getAttribute('data-bk')] = parseFloat(inp.value) || 0;
        });
        var coef = {};
        $$('.fx-coef', row).forEach(function (inp) {
          coef[inp.getAttribute('data-ck')] = parseFloat(inp.value) || 0;
        });
        return Data.newEffect({
          name: row.querySelector('.fx-name').value.trim(),
          dmg: parseFloat(row.querySelector('.fx-dmg').value) || 0,
          adPct: coef.adPct,
          apPct: coef.apPct,
          perLv: coef.perLv,
          hpPct: coef.hpPct,
          type: row.querySelector('.fx-type').value,
          cd: parseFloat(row.querySelector('.fx-cd').value) || 0,
          dur: parseFloat(row.querySelector('.fx-dur').value) || 0,
          tick: parseFloat(row.querySelector('.fx-tick').value) || 1,
          stack: parseInt(row.querySelector('.fx-stack').value, 10) || 1,
          chance: row.querySelector('.fx-chance').value === '' ? 100 : parseFloat(row.querySelector('.fx-chance').value),
          crit: row.querySelector('.fx-crit').checked,
          leech: row.querySelector('.fx-leech').checked,
          active: row.querySelector('.fx-active').checked,
          buff: buff
        });
      }).filter(function (e) { return Data.effectHasPayload(e); });

      data.special = Data.normalizeSpecial(($('#fSpecial') || {}).value || '');

      var idx = state.items.findIndex(function (x) { return x.id === data.id; });
      if (idx >= 0) state.items[idx] = data; else state.items.push(data);
      App.save();
      closeModal();
      App.renderItemTable();
      initCalcIfVisible();
      App.toast(idx >= 0 ? '已保存' : '已新增');
    };
  }

  /* 改完装备数据后，把当前页重画一遍（计算器 / 斗蛐蛐） */
  function initCalcIfVisible() {
    if (state.view === 'calc') App.initCalc();
    if (state.view === 'duel') App.initDuel();
  }

  App.openModal = openModal;
  App.closeModal = closeModal;
  App.openItemEditor = openItemEditor;
  App.initCalcIfVisible = initCalcIfVisible;
})(window);
