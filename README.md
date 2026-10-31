# 300英雄 · 装备属性计算器

纯静态站点，无构建步骤。部署地址：<https://guwanfeng.github.io/>

- **计算器**：人物属性 + 装备 → 每秒伤害 / 肉度，三档特效口径并列对比
- **斗蛐蛐**：双方各自配装，算谁先倒下
- **装备图鉴**：只读列表，支持搜索与按属性分类筛选
- **B站评论**：读取 `data/bili-comments.json`（由 GitHub Action 定时抓取）

口径要点：普攻走「攻速 × 暴击因子 × 命中率 × 增伤 × 减伤 × 每条成分过抗性后的伤害」；
特效自身的乘数只有「攻击力（含系数）/ 对应抗性的承伤率 / 触发频率（cd，没填才按攻速）」，
默认不吃暴击，但**命中率 / 增伤 / 减伤是共有修正，特效照样要过**。

---

## 目录结构

```
index.html              页面骨架（只剩结构，不含逻辑）
.nojekyll               关掉 GitHub Pages 的 Jekyll 处理
bili.config.json        B 站视频 BV 号与抓取条数

data/
  items.js              ★ 装备数据：日常唯一需要改的文件
  bili-comments.json    Action 抓回来的评论（自动生成，勿手改）

assets/css/style.css    全部样式

assets/js/
  data.js               字段定义：属性表、默认值、上限、特效类型、分类判定
  engine.js             纯计算：属性汇总、DPS、肉度、斗蛐蛐（不碰 DOM）
  core.js               命名空间 H300、DOM/格式化小工具、状态存取
  ui/form.js            属性表单 + 普攻构成
  ui/items.js           装备卡片文案、卡片网格、分类筛选条
  ui/result.js          顶部结果条、三档口径表、属性 chips
  pages/calc.js         计算器页装配
  pages/duel.js         斗蛐蛐页装配
  pages/gallery.js      装备图鉴页
  admin/editor.js       装备编辑器（?dev=1 才有入口）
  admin/import.js       批量导入（表格粘贴 → 装备）
  admin/export.js       导出 data/items.js
  main.js               视图切换、全局事件委托、启动
  bili.js               B 站评论区

tools/fetch_bili_comments.py   评论抓取脚本（Action 调用）
.github/workflows/bili-comments.yml  每 6 小时抓一次评论
```

## 模块之间怎么连

所有模块只通过一个全局命名空间 `window.H300` 通信，脚本顺序在 `index.html` 底部固定：

```
data.js → engine.js → items.js → core.js
        → ui/* → pages/* → admin/* → bili.js → main.js
```

- 依赖方向是单向的：`pages/*` 可以调用 `ui/*` 和 `core`，反过来不行；
  `engine.js` 只依赖 `data.js`，完全不认识 DOM，方便单独跑测试。
- 页面交互统一走 `main.js` 里挂在 `document` 上的一个 click 委托：
  按钮带 `data-act="..."`、分类按钮带 `data-cat`、图鉴行带 `data-edit` / `data-del` 就会自动被处理，
  加新按钮不用再单独绑事件。
- 用的是普通 `<script>`（不是 ES Module），所以直接双击 `index.html` 也能打开；
  只有「B站评论」需要读 json，得用本地服务器预览。

## 日常维护装备数据

两种方式，结果一样：

1. **直接改 `data/items.js`** —— 文件头有全部字段说明：
   `stats` 的键（含基础攻速 / 普攻倍率 / 普攻必中 / 无视护甲 / 物转法 / 回血提高 / 受普攻减伤 / 反击 / 迷雾 / 削甲 / 削抗 / 减攻速 / 法强% / 生命% / 回血% / 无相%残），
   `effects` 的 `dmg / adPct / apPct / perLv / hpPct / type / cd / dur / tick / stack / chance / crit / leech / active / buff`，
   以及 `special`（本工具没建模的机制，只做展示）。
2. **在页面上改**：网址后面加 `?dev=1`，图鉴页会出现「新增 / 编辑 / 删除 / 批量导入 / 导出 items.js」，
   改完点「导出 items.js」，用下载的文件覆盖 `data/items.js`。
   期间数据存在浏览器 localStorage 的草稿里，工具条上的「丢弃本地草稿」可以还原。

分类不用填：由 `stats` / `effects` 自动判定（攻击 / 法强 / 生命回复 / 生命值 / 护甲 / 法抗 / 命中 / 闪避 / 特效 / 重伤 / 其它），
一件装备可以同时属于多个分类。

几种常见写法的对照：

| 原文写法 | 怎么写 |
|---|---|
| 造成（150+15% 法强）魔法伤害（cd 8s） | `{ dmg: 150, apPct: 15, type: 'magic', cd: 8 }` |
| 每 0.5 秒造成（40+2% 法强）魔法伤害，持续 4.5 秒 | `{ dmg: 40, apPct: 2, type: 'magic', cd: 15, dur: 4.5, tick: 2 }` |
| 每 45 秒「主动」提供 50% 攻速 5 秒 | `{ cd: 45, dur: 5, active: true, buff: { asPct: 50 } }`（主动不折算，只在爆发档全额生效） |
| 每 25 秒削 20% 法抗、持续 5 秒 | `{ cd: 25, dur: 5, buff: { mrShredPct: 20 } }`（被动，按覆盖率折算） |
| 施加 25% 减攻速、40% 重伤（永久） | 直接写 `stats: { asSlowPct: 25, gwPct: 40 }` |
| 降低敌人 30 护甲 | `stats: { armorShred: 30 }`（削抗与穿透等价） |
| 普攻 10% 概率额外造成（75+25% 攻击）物理伤害 | `{ dmg: 75, adPct: 25, type: 'phys', chance: 10 }` |
| 普攻造成（2% 目标生命上限）魔法伤害 | `{ hpPct: 2, type: 'magic' }`（cd 留空 = 每次普攻） |
| 普攻不会被闪避 | `stats: { autoNoMiss: 1 }`（特效里也能写，配合 `active` 表示主动期间才生效） |
| 普攻 33% 概率连击 2 次 | `stats: { autoAmp: 33 }`（等效普攻 ×1.33，连击那下也吃暴击） |
| 物理伤害 50% 概率无视护甲 | `stats: { armorIgnore: 50 }`（按期望承伤率折算） |
| 30% 物理伤害转法术 | `stats: { physToMagic: 30 }`（物理伤害按 0.7×护甲承伤 + 0.3×法抗承伤；主动里再写 `physToMagic: 40` 凑到 70%） |
| 提供 20% 基础攻速 | `stats: { asBasePct: 20 }`（放大基础攻速本身，0.69 → 0.828） |
| 每损失 1% 生命 +1% 回血（按全程 +50%） | `stats: { regenAmp: 50 }`（只放大自然回血） |
| 受到普攻伤害降低 12% | `stats: { autoReduce: 12 }`（不减特效伤害） |
| 反击「对方 DPS 的 30%」真实伤害 | `stats: { reflectPct: 30 }`（只在斗蛐蛐里生效） |
| 伤害转化 / 伤害暂缓 / 法力值 …… | 写进 `special`，只展示不计算 |

## 本地预览

```bash
cd 300hero-calc
python -m http.server 8899 --bind 127.0.0.1
# 打开 http://127.0.0.1:8899/
```

## 发布到 guwanfeng.github.io

用户站点的仓库根目录就是站点根目录，所以直接把本目录**里面的全部内容**放到
`Guwanfeng/Guwanfeng.github.io` 仓库根下（`index.html` 在仓库根，不要多套一层 `300hero-calc/`），
推上去后 GitHub Pages 会自动发布。注意两点：

- `.nojekyll` 必须一起提交，否则以下划线开头的文件/目录会被 Jekyll 忽略。
- 仓库里原来的 `index.html` 会被覆盖；想保留旧版就先另存一份。

B 站评论要在 Actions 里能跑起来，需要 `bili.config.json` 里填上 `bvid`（或在仓库 Variables 里加 `BILI_BVID`）。
