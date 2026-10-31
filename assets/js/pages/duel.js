/* ============================================================
 * pages/duel.js —— 「斗蛐蛐」页
 * ------------------------------------------------------------
 * 双方各自的人物属性 + 普攻构成 + 装备，按当前特效口径算谁先倒下。
 * 我方在计算器页选的那套英雄属性与装备是共用的。
 * ============================================================ */
(function (global) {
  'use strict';

  var App = global.H300;
  var Engine = global.HeroEngine;
  var $ = App.$;
  var esc = App.esc;
  var fmt = App.fmt;
  var state = App.state;

  function initDuel() {
    App.renderForm($('#duelFormA'), state.hero, App.HERO_FIELDS, function () {
      App.save(); App.renderDuelChips(); runDuel();
    }, { withAuto: true });

    App.renderForm($('#duelFormB'), state.enemy.hero, App.HERO_FIELDS, function () {
      App.save(); App.renderDuelChips(); runDuel();
    }, { withAuto: true });

    renderDuelGrids();
    App.renderDuelChips();
    renderFxModeLine();
    runDuel();
  }

  function renderFxModeLine() {
    var el = $('#duelFxModes');
    if (el) el.innerHTML = App.fxModeButtons();
  }

  function renderDuelGrids() {
    App.renderItemGrid($('#duelItemsA'), state.selected, {
      after: function () {
        App.renderPickSummary();
        $('#duelPickA').textContent = '已选 ' + state.selected.length + ' 件';
        runDuel();
      }
    });
    App.renderItemGrid($('#duelItemsB'), state.enemy.selected, {
      after: function () {
        $('#duelPickB').textContent = '已选 ' + state.enemy.selected.length + ' 件';
        runDuel();
      }
    });
    $('#duelPickA').textContent = '已选 ' + state.selected.length + ' 件';
    $('#duelPickB').textContent = '已选 ' + state.enemy.selected.length + ' 件';
  }

  /* 普攻 DPS 按伤害类型拆开（已乘迷雾的空窗折扣，才能和上面的「普攻 DPS」对得上） */
  function splitText(side) {
    var m = +side.fogMul || 1;
    var a = side.auto || {};
    var out = [fmt((a.phys || 0) * m, 1), fmt((a.magic || 0) * m, 1)];
    if ((a.true || 0) > 0) out.push(fmt(a.true * m, 1));
    return out.join(' / ');
  }

  function runDuel() {
    var itemsA = App.itemsOf(state.selected), itemsB = App.itemsOf(state.enemy.selected);
    var r = Engine.duel({ base: state.hero, items: itemsA }, { base: state.enemy.hero, items: itemsB }, state.fxMode);
    /* 参战属性：已含特效加成的折算值与对方施加的减攻速 */
    var sA = r.A.stats, sB = r.B.stats;

    var box = $('#duelResult');
    if (!box) return;

    var verdictText, verdictSub, winnerSide = r.winner;
    if (r.draw) {
      verdictText = '打不死';
      verdictSub = '双方都无法击杀对方';
      winnerSide = null;
    } else if (r.remainPct < 0.1) {
      verdictText = '同归于尽';
      verdictSub = '用时 ' + r.time.toFixed(2) + 's · 双方同时倒下';
      winnerSide = null;
    } else if (r.winner === 'A') {
      verdictText = '我方胜';
      verdictSub = '用时 ' + r.time.toFixed(2) + 's · 剩余 ' + r.remainPct.toFixed(1) + '%';
    } else {
      verdictText = '敌方胜';
      verdictSub = '用时 ' + r.time.toFixed(2) + 's · 剩余 ' + r.remainPct.toFixed(1) + '%';
    }

    function sideHtml(title, s, dps, net, t, isWinner, fx) {
      var tags = [];
      tags.push('命中 ' + fmt(s.hit, 0) + ' · 闪避 ' + fmt(s.dodge, 0));
      if (+s.amp) tags.push('增伤 ' + fmt(s.amp, 0) + '%');
      if (+s.reduce) tags.push('减伤 ' + fmt(s.reduce, 0) + '%');
      if (+s.gw) tags.push('重伤 ' + fmt(s.gw, 0) + '%');
      return '<div class="duel-side' + (isWinner ? ' win' : '') + '">' +
        '<h4>' + title + (isWinner ? ' · 胜' : '') + '</h4>' +
        '<div class="big">' + (isFinite(t) ? t.toFixed(2) + '<span class="unit" style="font-size:12px;color:var(--dim)"> s 存活</span>' : '不灭') + '</div>' +
        '<p>对对方 DPS ' + fmt(dps, 1) + '</p>' +
        (fx && fx.total > 0 ? '<p class="fx-inline">其中特效 ' + fmt(fx.total, 1) + '</p>' : '') +
        '<p>生命 ' + fmt(s.hp, 0) + ' · 护甲 ' + fmt(s.armor, 1) + ' · 法抗 ' + fmt(s.mr, 1) + '</p>' +
        '<p class="fx-inline">' + tags.join(' · ') + '</p>' +
        '<p>净掉血 ' + fmt(net, 1) + ' /s</p>' +
        '</div>';
    }

    /* 生命 / 护甲 / 法抗 / 减伤 用「叠加防御特效平均值后」的数值，那才是实际参战值 */
    var eA = r.A.defStats || sA, eB = r.B.defStats || sB;
    var rows = [
      ['生命值', fmt(eA.hp, 0), fmt(eB.hp, 0)],
      ['护甲', fmt(eA.armor, 1), fmt(eB.armor, 1)],
      ['法术抗性', fmt(eA.mr, 1), fmt(eB.mr, 1)],
      ['攻速', sA.as.toFixed(3), sB.as.toFixed(3)],
      ['暴击因子', sA.critFactor.toFixed(3), sB.critFactor.toFixed(3)],
      ['命中 / 闪避', fmt(sA.hit, 0) + ' / ' + fmt(sA.dodge, 0), fmt(sB.hit, 0) + ' / ' + fmt(sB.dodge, 0)],
      ['增伤 / 减伤', fmt(sA.amp, 0) + '% / ' + fmt(eA.reduce, 0) + '%', fmt(sB.amp, 0) + '% / ' + fmt(eB.reduce, 0) + '%'],
      ['受普攻减伤', eA.autoReduce ? fmt(eA.autoReduce, 0) + '%' : '—',
                     eB.autoReduce ? fmt(eB.autoReduce, 0) + '%' : '—'],
      ['打对方命中率', (r.A.hitRate * 100).toFixed(1) + '%', (r.B.hitRate * 100).toFixed(1) + '%'],
      ['重伤', sA.gw ? fmt(sA.gw, 0) + '%' : '—',
                sB.gw ? fmt(sB.gw, 0) + '%' : '—'],
      ['普攻 DPS', fmt(r.A.baseDps, 1), fmt(r.B.baseDps, 1)],
      ['其中 物理 / 魔法' + ((r.A.auto.true > 0 || r.B.auto.true > 0) ? ' / 真实' : ''),
        splitText(r.A), splitText(r.B)]
    ];
    if (state.fxMode !== 'none') {
      rows.push(['特效 DPS', '+' + fmt(r.A.fxOut !== undefined ? r.A.fxOut : r.A.fx.total, 1),
                             '+' + fmt(r.B.fxOut !== undefined ? r.B.fxOut : r.B.fx.total, 1)]);
    }
    if ((r.A.buffs && App.hasBuffs(r.A.buffs)) || (r.B.buffs && App.hasBuffs(r.B.buffs))) {
      rows.push(['特效加成', App.buffText(r.A.buffs) || '—', App.buffText(r.B.buffs) || '—']);
    }
    if (r.fog > 0) {
      rows.push(['迷雾', (r.A.fogMul < 1 ? '自身输出 ×' + r.A.fogMul.toFixed(2) : '普攻不受影响'),
                        (r.B.fogMul < 1 ? '自身输出 ×' + r.B.fogMul.toFixed(2) : '普攻不受影响')]);
    }
    if (sA.reflectPct || sB.reflectPct) {
      rows.push(['反击（对方承受）', sA.reflectPct ? fmt(r.A.reflect, 1) + ' /s' : '—',
                                sB.reflectPct ? fmt(r.B.reflect, 1) + ' /s' : '—']);
    }
    rows = rows.concat([
      ['对对方 DPS', fmt(r.A.dps, 1), fmt(r.B.dps, 1)],
      ['每秒回血', fmt(r.A.regen, 2), fmt(r.B.regen, 2)],
      ['吸血回复', fmt(r.A.leechDps * (r.A.defStats || sA).lifesteal, 1),
                   fmt(r.B.leechDps * (r.B.defStats || sB).lifesteal, 1)],
      ['实际回复（含重伤）', fmt(r.A.heal, 2), fmt(r.B.heal, 2)],
      ['净掉血速度', fmt(r.A.net, 1), fmt(r.B.net, 1)],
      ['预计存活', isFinite(r.A.t) ? r.A.t.toFixed(2) + 's' : '无法击杀', isFinite(r.B.t) ? r.B.t.toFixed(2) + 's' : '无法击杀']
    ]);

    var modeNote = '<p class="hint" style="margin:0 0 12px">当前特效口径：<b>' +
      ((App.FX_MODE_MAP[state.fxMode] || {}).label || '不含特效') + '</b> — ' +
      esc((App.FX_MODE_MAP[state.fxMode] || {}).desc || '') + '</p>';

    box.innerHTML = modeNote +
      '<div class="duel-summary">' +
        sideHtml('我方', sA, r.A.dps, r.A.net, r.A.t, winnerSide === 'A', r.A.fx) +
        '<div class="verdict"><span class="vs">VS</span>' + verdictText + '<br><span class="muted">' + verdictSub + '</span></div>' +
        sideHtml('敌方', sB, r.B.dps, r.B.net, r.B.t, winnerSide === 'B', r.B.fx) +
      '</div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>项目</th><th>我方</th><th>敌方</th></tr></thead><tbody>' +
        rows.map(function (row) { return '<tr><td>' + row[0] + '</td><td class="num">' + row[1] + '</td><td class="num">' + row[2] + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  App.initDuel = initDuel;
  App.renderFxModeLine = renderFxModeLine;
  App.runDuel = runDuel;
})(window);
