/* ============================================================
 * ui/form.js —— 属性表单 + 普攻构成
 * ------------------------------------------------------------
 *   H300.renderForm(容器, 对象, 字段表, 变更回调, { withAuto })
 * 字段表见 core.js 的 HERO_FIELDS / DUMMY_FIELDS。
 * withAuto = true 时在表单末尾追加「普攻构成」区块。
 * ============================================================ */
(function (global) {
  'use strict';

  var App = global.H300;
  var Data = global.HeroData;

  /* 普攻构成：每条 = 伤害类型 + 攻击力系数 + 法强系数 + 固定值 + 每级值 */
  function autoRowHtml(c, i) {
    return '<div class="auto-row">' +
      '<select data-auto="' + i + '.type" title="伤害类型">' +
        Data.AUTO_TYPES.map(function (t) {
          return '<option value="' + t.key + '"' + (t.key === c.type ? ' selected' : '') + '>' + t.label + '</option>';
        }).join('') +
      '</select>' +
      '<input type="number" step="0.05" data-auto="' + i + '.ad" value="' + (c.ad || 0) + '" title="攻击力系数">' +
      '<input type="number" step="0.05" data-auto="' + i + '.ap" value="' + (c.ap || 0) + '" title="法强系数">' +
      '<input type="number" step="1" data-auto="' + i + '.flat" value="' + (c.flat || 0) + '" title="每一下的固定值">' +
      '<input type="number" step="0.5" data-auto="' + i + '.perLv" value="' + (c.perLv || 0) + '" title="每级的固定值">' +
      '<button class="mini del" data-autodel="' + i + '" title="删掉这条">×</button>' +
      '</div>';
  }

  function autoBlockHtml(obj) {
    var list = Data.normalizeAuto(obj.auto);
    return '<div class="auto-block">' +
      '<div class="sub-head"><h3>普攻构成</h3>' +
        '<button class="mini" data-autoadd="1">+ 加一条</button></div>' +
      '<div class="auto-row auto-head">' +
        '<span>类型</span><span>×攻击力</span><span>×法强</span><span>固定</span><span>每级</span><span></span>' +
      '</div>' +
      list.map(autoRowHtml).join('') +
      '<p class="hint">默认就是 1.0 攻击力的物理伤害。多条直接相加，各自按类型吃护甲 / 法抗（<b>真实</b>伤害两者都不吃）。' +
        '例：普攻是 0.4ad+0.2ap+2×等级 的魔法伤害 → 类型「魔法」、×攻击力 0.4、×法强 0.2、每级 2；' +
        '普攻额外附带固定真实伤害 → 再加一条「真实、固定 30」。</p>' +
      '</div>';
  }

  function renderForm(container, obj, fields, onChange, opts) {
    if (!container) return;
    opts = opts || {};
    if (opts.withAuto && !obj.auto) obj.auto = Data.normalizeAuto();

    container.innerHTML = fields.map(function (f) {
      var v = obj[f.key];
      if (v === undefined || v === null) v = 0;
      return '<label class="field"><span class="field-label">' + f.label + '</span>' +
        '<input type="number" inputmode="decimal" step="' + (f.step || 1) + '" data-bind="' + f.key + '" value="' + v + '"></label>';
    }).join('') + (opts.withAuto ? autoBlockHtml(obj) : '');

    container.oninput = function (e) {
      var ak = e.target.getAttribute('data-auto');
      if (ak) {
        var idx = parseInt(ak, 10);
        var field = ak.split('.')[1];
        if (!obj.auto || !obj.auto[idx]) return;
        if (field === 'type') {
          obj.auto[idx].type = e.target.value === 'magic' ? 'magic'
            : (e.target.value === 'true' ? 'true' : 'phys');
        } else {
          var av = parseFloat(e.target.value);
          obj.auto[idx][field] = isNaN(av) ? 0 : av;
        }
        onChange();
        return;
      }
      var k = e.target.getAttribute('data-bind');
      if (!k) return;
      var v = parseFloat(e.target.value);
      obj[k] = isNaN(v) ? 0 : v;
      onChange();
    };

    container.onclick = function (e) {
      var del = e.target.closest('[data-autodel]');
      var add = e.target.closest('[data-autoadd]');
      if (!del && !add) return;
      if (!obj.auto) obj.auto = Data.normalizeAuto();
      if (add) {
        obj.auto.push(Data.newAutoComp());
      } else {
        obj.auto.splice(parseInt(del.getAttribute('data-autodel'), 10), 1);
        if (!obj.auto.length) obj.auto = Data.normalizeAuto();
      }
      renderForm(container, obj, fields, onChange, opts);
      onChange();
    };
  }

  App.renderForm = renderForm;
})(window);
