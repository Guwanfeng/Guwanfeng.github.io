/* ============================================================
 * admin/import.js —— 批量导入（从表格整块粘贴）
 * ------------------------------------------------------------
 *   H300.parseTable(text)  纯函数，输入 TSV/CSV 文本，输出装备数组
 *   H300.openBulkImport()  弹窗：粘贴 → 解析 → 合并进 state.items
 * 解析规则集中在 ALIAS（表头别名）与 BUFF_WORDS（防御加成写法）两张表，
 * 想加新的表头写法，只改这两张表即可。
 * ============================================================ */
(function (global) {
  'use strict';

  var App = global.H300;
  var Data = global.HeroData;
  var $ = App.$;
  var state = App.state;

  var ALIAS = {
    '名称': 'name', '名字': 'name', '装备': 'name', '装备名': 'name', 'name': 'name',
    '攻击力': 'ad', '攻击': 'ad', 'ad': 'ad',
    '法术强度': 'ap', '法强': 'ap', 'ap': 'ap',
    '攻速': 'asPct', '攻速%': 'asPct', '攻击速度': 'asPct', 'as': 'asPct', 'aspd': 'asPct',
    '基础攻速': 'asBasePct', '基础攻速提高': 'asBasePct',
    '普攻': 'autoAmp', '普攻伤害': 'autoAmp', '连击': 'autoAmp', '普攻%': 'autoAmp',
    '普攻必中': 'autoNoMiss', '必中': 'autoNoMiss', '不会被闪避': 'autoNoMiss',
    '普攻减伤': 'autoReduce', '受到普攻伤害降低': 'autoReduce',
    '迷雾': 'fogUptime',
    '反击': 'reflectPct', '反震': 'reflectPct',
    '无视护甲': 'armorIgnore', '无视护甲%': 'armorIgnore',
    '物转法': 'physToMagic', '物理转法术': 'physToMagic', '转法术': 'physToMagic', '转化': 'physToMagic',
    '暴击率': 'critPct', '暴击': 'critPct', '暴击率%': 'critPct', 'crit': 'critPct',
    '暴击伤害': 'critDmgPct', '暴击伤害%': 'critDmgPct', '暴伤': 'critDmgPct', 'critdmg': 'critDmgPct',
    '护甲穿透': 'penFlat', '固定穿透': 'penFlat', '固定护甲穿透': 'penFlat', '穿透': 'penFlat', 'pen': 'penFlat',
    '百分比穿透': 'penPct', '百分比护甲穿透': 'penPct', '穿透%': 'penPct', 'pen%': 'penPct',
    '吸血': 'lifestealPct', '吸血%': 'lifestealPct', '生命偷取': 'lifestealPct', 'ls': 'lifestealPct',
    '生命值': 'hp', '生命': 'hp', '血量': 'hp', 'hp': 'hp',
    '回血': 'hpRegen5', '每5秒回血': 'hpRegen5', '生命回复': 'hpRegen5', 'regen': 'hpRegen5',
    '护甲': 'armor', 'armor': 'armor',
    '法抗': 'mr', '法术抗性': 'mr', '魔抗': 'mr', 'mr': 'mr',
    '固定法穿': 'mpenFlat', '法穿': 'mpenFlat',
    '百分比法穿': 'mpenPct', '法穿%': 'mpenPct',
    '命中': 'hit', 'hit': 'hit',
    '闪避': 'dodge', 'dodge': 'dodge',
    '无相之力': 'wx', '无相': 'wx', 'wx': 'wx',
    '无相之力%': 'wxPctHp', '无相%': 'wxPctHp', 'wx%': 'wxPctHp',
    '无相%残': 'wxPctHpLow', '残血无相': 'wxPctHpLow', '无相之力%残': 'wxPctHpLow',
    '法强%': 'apAmp', '法强提高': 'apAmp',
    '削甲': 'armorShred', '削护甲': 'armorShred', '降低护甲': 'armorShred',
    '削甲%': 'armorShredPct',
    '削抗': 'mrShred', '削法抗': 'mrShred', '降低魔抗': 'mrShred', '降低法抗': 'mrShred',
    '削抗%': 'mrShredPct', '降低魔抗%': 'mrShredPct',
    '减攻速': 'asSlowPct', '降低攻速': 'asSlowPct',
    '生命%': 'hpPctHp', '生命上限%': 'hpPctHp',
    '回血%': 'regenPctHp5',
    '回血提高': 'regenAmp', '生命回复提高': 'regenAmp', '回血加成': 'regenAmp',
    '增伤': 'amp', '造成伤害': 'amp', 'amp': 'amp',
    '减伤': 'reduce', '承受伤害': 'reduce', 'reduce': 'reduce',
    '重伤': 'gwPct', 'gw': 'gwPct',
    '特效': 'fxDmg', '特效伤害': 'fxDmg', '特效数值': 'fxDmg', 'fxdmg': 'fxDmg',
    '特效类型': 'fxType', '伤害类型': 'fxType', 'fxtype': 'fxType',
    '特效冷却': 'fxCd', '冷却': 'fxCd', 'cd': 'fxCd', '特效cd': 'fxCd',
    '特效名': 'fxName', '特效名称': 'fxName', 'fxname': 'fxName',
    '特效攻击力%': 'fxAdPct', '特效攻击%': 'fxAdPct',
    '特效法强%': 'fxApPct', '特效法强%比': 'fxApPct',
    '特效每级': 'fxPerLv', '特效等级': 'fxPerLv',
    '特效目标生命%': 'fxHpPct', '特效生命%': 'fxHpPct',
    '特效持续': 'fxDur', '持续': 'fxDur', '持续时间': 'fxDur', 'fxdur': 'fxDur',
    '特效每秒': 'fxTick', '每秒跳': 'fxTick',
    '特效层数': 'fxStack', '层数': 'fxStack', '最多层数': 'fxStack', 'fxstack': 'fxStack',
    '特效触发': 'fxChance', '触发概率': 'fxChance',
    '特效暴击': 'fxCrit', '吃暴击': 'fxCrit', 'fxcrit': 'fxCrit',
    '特效吸血': 'fxLeech', '吃吸血': 'fxLeech', 'fxleech': 'fxLeech',
    '特效主动': 'fxActive', '主动': 'fxActive', 'fxactive': 'fxActive',
    '特效防御': 'fxBuff', '防御加成': 'fxBuff', '特效加成': 'fxBuff', 'fxbuff': 'fxBuff',
    '特殊': 'special', '特殊说明': 'special', 'special': 'special',
    '备注': 'note', '说明': 'note', 'note': 'note'
  };

  /* 一格里写若干条属性加成，如「护甲30/法抗20/护盾500/减伤10/吸血15/回血20/攻速45/削抗20」 */
  var BUFF_WORDS = {
    '护盾': 'hp', '护甲': 'armor', '法抗': 'mr', '魔抗': 'mr',
    '减伤': 'reduce', '吸血': 'lifestealPct', '回血': 'hpRegen5', '回复': 'hpRegen5',
    '攻速': 'asPct', '攻击力': 'ad', '法强': 'ap', '无相': 'wx', '暴击': 'critPct',
    '削甲': 'armorShred', '削抗': 'mrShred', '减攻速': 'asSlowPct',
    '重伤': 'gwPct', '增伤': 'amp', '闪避': 'dodge', '命中': 'hit',
    '基础攻速': 'asBasePct', '普攻': 'autoAmp', '迷雾': 'fogUptime',
    '反击': 'reflectPct', '无视护甲': 'armorIgnore', '回血提高': 'regenAmp',
    '物转法': 'physToMagic', '转法术': 'physToMagic',
    '普攻减伤': 'autoReduce', '必中': 'autoNoMiss'
  };

  function parseBuffText(raw) {
    var b = Data.newBuff();
    String(raw == null ? '' : raw).replace(/[,，、;；|]/g, '/').split('/').forEach(function (seg) {
      var m = seg.match(/([^\d\-+]+)\s*([+-]?\d+(?:\.\d+)?)/);
      if (!m) return;
      var w = m[1].replace(/\s|%/g, '');
      var key = BUFF_WORDS[w] || null;
      if (!key) {
        var en = w.toLowerCase();
        if (en === 'hp' || en === 'shield') key = 'hp';
        else if (en === 'armor') key = 'armor';
        else if (en === 'mr') key = 'mr';
        else if (en === 'reduce') key = 'reduce';
        else if (en === 'ls' || en === 'lifesteal') key = 'lifestealPct';
        else if (en === 'regen') key = 'hpRegen5';
      }
      if (key) b[key] += parseFloat(m[2]) || 0;
    });
    return b;
  }

  /* 特效类型的中文/英文写法归一 */
  function fxTypeKey(raw) {
    var s = String(raw == null ? '' : raw).trim().toLowerCase();
    if (/法|魔|magic|mag|ap/.test(s)) return 'magic';
    if (/真|true|real/.test(s)) return 'true';
    return 'phys';
  }

  /* 是/否归一，空值与非肯定词一律 false（默认不吃暴击/吸血） */
  function fxBool(raw) {
    var s = String(raw == null ? '' : raw).trim().toLowerCase();
    return /^(1|y|yes|true|t|是|吃|可|能|✓|√|o|on)$/.test(s);
  }

  function parseTable(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) return { error: '至少要有表头 + 一行数据' };
    var delim = lines[0].indexOf('\t') >= 0 ? '\t' : ',';
    var head = lines[0].split(delim).map(function (h) { return h.trim().toLowerCase(); });
    var keys = head.map(function (h) { return ALIAS[h] || ALIAS[h.replace(/%$/, '')] || null; });
    if (keys.indexOf('name') < 0) return { error: '表头里找不到「名称」列' };

    var out = [];
    var skipped = 0;
    for (var i = 1; i < lines.length; i++) {
      var cells = lines[i].split(delim);
      var row = {
        name: '', note: '', special: '', stats: {},
        fx: Data.newEffect()
      };
      // 只取单元格里的第一个数字：「40% 持续3秒」→ 40，「1,200」→ 1200
      var num = function (raw) {
        var s = String(raw == null ? '' : raw).replace(/,/g, '');
        var m = s.match(/-?\d+(?:\.\d+)?/);
        return m ? parseFloat(m[0]) : 0;
      };

      Data.STAT_DEFS.forEach(function (d) { row.stats[d.key] = 0; });
      keys.forEach(function (k, idx) {
        if (!k) return;
        var raw = (cells[idx] || '').trim();
        if (k === 'name') row.name = raw;
        else if (k === 'note') row.note = raw;
        else if (k === 'special') row.special = raw;
        else if (k === 'fxDmg') row.fx.dmg = num(raw);
        else if (k === 'fxAdPct') row.fx.adPct = num(raw);
        else if (k === 'fxApPct') row.fx.apPct = num(raw);
        else if (k === 'fxPerLv') row.fx.perLv = num(raw);
        else if (k === 'fxHpPct') row.fx.hpPct = num(raw);
        else if (k === 'fxCd') row.fx.cd = num(raw);
        else if (k === 'fxDur') row.fx.dur = num(raw);
        else if (k === 'fxTick') row.fx.tick = num(raw) || 1;
        else if (k === 'fxStack') row.fx.stack = Math.max(1, Math.round(num(raw)) || 1);
        else if (k === 'fxChance') row.fx.chance = num(raw) === 0 && !/\d/.test(raw) ? 100 : num(raw);
        else if (k === 'fxCrit') row.fx.crit = fxBool(raw);
        else if (k === 'fxLeech') row.fx.leech = fxBool(raw);
        else if (k === 'fxActive') row.fx.active = fxBool(raw);
        else if (k === 'fxName') row.fx.name = raw;
        else if (k === 'fxType') row.fx.type = fxTypeKey(raw);
        else if (k === 'fxBuff') row.fx.buff = parseBuffText(raw);
        else row.stats[k] = num(raw);
      });
      if (!row.name) continue;
      // 一个数值都没有的行多半是表格里的杂项文字，跳过
      var hasNum = Data.effectHasPayload(row.fx);
      Data.STAT_DEFS.forEach(function (d) { if (row.stats[d.key]) hasNum = true; });
      if (!hasNum) { skipped++; continue; }

      var it = Data.newItem({
        name: row.name, note: row.note,
        special: Data.normalizeSpecial(row.special),
        effects: Data.effectHasPayload(row.fx) ? [Data.newEffect(row.fx)] : []
      });
      Data.STAT_DEFS.forEach(function (d) { it.stats[d.key] = row.stats[d.key] || 0; });
      out.push(it);
    }
    if (!out.length) return { error: '没有解析到有效数据行' };
    return { items: out, skipped: skipped };
  }

  function openBulkImport() {
    App.openModal(
      '<h3>批量导入装备</h3>' +
      '<p class="hint" style="margin-top:0">从 Excel / 腾讯文档里整块复制（Tab 分隔）或逗号分隔粘贴到下面，第一行必须是表头。<br>' +
      '可用表头：名称 / 攻击力 / 攻速 / 基础攻速 / 普攻% / 暴击率 / 暴击伤害 / 固定穿透 / 百分比穿透 / 无视护甲 / 物转法 / 吸血 / 法术强度 / 固定法穿 / 百分比法穿 / 生命值 / 回血 / 回血提高 / 护甲 / 法抗 / 命中 / 普攻必中 / 闪避 / 普攻减伤 / 反击 / 迷雾 / 增伤 / 减伤 / 重伤 / 无相之力 / 无相%残 / 削甲 / 削抗 / 减攻速 / 法强% / 生命% / 回血%（也支持 ad、as、crit、hp 这类英文键）<br>' +
      '<b>分类不用给</b>：由属性自动判定（有特效的进「特效」，一条都不沾的进「其它」），表里的分类列会被忽略；<b>重伤一律按永久</b>，「重伤持续」列同样忽略。<br>' +
      '特效列：<b>特效伤害</b>（固定值）、<b>特效攻击力%</b> / <b>特效法强%</b> / <b>特效每级</b> / <b>特效目标生命%</b>（跟着面板走的加成）、' +
      '<b>特效类型</b>（物理/魔法/真实，默认物理）、<b>特效冷却</b>（秒，0 或留空 = 每次普攻附带）、<b>特效名</b>、' +
      '<b>特效持续</b>（秒，0 = 瞬时）、<b>特效每秒</b>（每秒跳几次，默认 1）、<b>特效层数</b>（默认 1）、<b>特效触发</b>（%，默认 100）、' +
      '<b>特效暴击</b> / <b>特效吸血</b> / <b>特效主动</b>（填 1/是/吃 才算，留空 = 否；主动加成只在「爆发 1s」档生效）、' +
      '<b>特效加成</b>（一格里写多条，如「护甲30/攻速45/削抗20/减攻速25」）。一行只能带一条特效，多条请用「新增/编辑」里的特效区。<br>' +
      '<b>特殊</b>列写本工具没建模的机制，只做展示。<br>' +
      '带 % 的属性只填数字：「攻速 35」= 35%。同名的装备会被覆盖更新。</p>' +
      '<textarea id="bulkText" placeholder="名称&#9;攻击力&#9;攻速&#9;特效伤害&#9;特效类型&#9;特效冷却&#10;示例装备&#9;60&#9;25&#9;220&#9;魔法&#9;6"></textarea>' +
      '<div class="modal-actions"><button class="ghost" data-close>取消</button>' +
      '<button class="primary" id="bulkGo">导入</button></div>'
    );

    $('#bulkGo').onclick = function () {
      var text = $('#bulkText').value.trim();
      if (!text) { App.toast('先粘贴数据'); return; }
      var res = parseTable(text);
      if (res.error) { App.toast(res.error); return; }

      var added = 0, updated = 0;
      res.items.forEach(function (it) {
        var exist = state.items.find(function (x) { return x.name === it.name; });
        if (exist) {
          if (it.note) exist.note = it.note;
          Data.STAT_DEFS.forEach(function (d) {
            if (it.stats[d.key]) exist.stats[d.key] = it.stats[d.key];
          });
          if (it.effects && it.effects.length) exist.effects = it.effects;
          if (it.special && it.special.length) exist.special = it.special;
          updated++;
        } else {
          state.items.push(it);
          added++;
        }
      });
      App.save();
      App.closeModal();
      App.renderItemTable();
      App.initCalcIfVisible();
      App.toast('新增 ' + added + ' 件，更新 ' + updated + ' 件' + (res.skipped ? '，跳过 ' + res.skipped + ' 行无数值的行' : ''));
    };
  }

  App.parseTable = parseTable;
  App.parseBuffText = parseBuffText;
  App.openBulkImport = openBulkImport;
})(window);
