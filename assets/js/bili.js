/* ============================================================
 * B站视频 + 评论区快照
 *
 * 数据来源：data/bili-comments.json
 *   该文件由仓库里的 GitHub Action（.github/workflows/bili-comments.yml）
 *   定时调用 tools/fetch_bili_comments.py 抓取后提交。
 *   （浏览器直连 B站接口会被跨域拦截，所以走「服务器抓 → 存文件 → 页面读」）
 * ============================================================ */
window.HeroBili = (function () {
  'use strict';

  var CFG = {
    dataUrl: 'data/bili-comments.json',
    videoUrl: '',      // 可选兜底：数据还没抓到时可先给个链接
    hotCount: 8,
    latestCount: 8
  };

  var data = null;
  var loading = false;
  var tried = false;
  var sortMode = 'hot';
  var rootVideo = null;
  var rootList = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtNum(n) {
    n = +n || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return String(n);
  }

  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts * 1000);
    var p = function (v) { return v < 10 ? '0' + v : v; };
    var now = new Date();
    if (d.getFullYear() === now.getFullYear()) return p(d.getMonth() + 1) + '-' + p(d.getDate());
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function fmtStamp(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var p = function (v) { return v < 10 ? '0' + v : v; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function videoUrl(v) {
    return (v && v.url) || CFG.videoUrl || '';
  }

  /* ---------------- 视频卡 ---------------- */

  function renderVideo() {
    if (!rootVideo) return;
    var v = (data && data.video) || {};
    var url = videoUrl(v);

    if (!url) {
      rootVideo.innerHTML =
        '<div class="bili-empty">' +
          '<p>还没配置视频。</p>' +
          '<p class="muted">在仓库根目录的 <code>bili.config.json</code> 里填上 BV 号，' +
          '再运行一次同步（Action 页面点 Run workflow，或等定时任务），这里就会出现视频信息和评论。</p>' +
        '</div>';
      return;
    }

    var cover = v.cover ? '<img class="bili-cover" src="' + esc(v.cover) + '" alt="" referrerpolicy="no-referrer" loading="lazy">' : '';

    rootVideo.innerHTML =
      '<div class="bili-card">' +
        '<a class="bili-cover-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + cover + '</a>' +
        '<div class="bili-info">' +
          '<h3>' + esc(v.title || 'B站视频') + '</h3>' +
          '<p class="bili-meta">' +
            (v.owner ? 'UP 主 ' + esc(v.owner) : '') +
            (v.view ? ' · 播放 ' + fmtNum(v.view) : '') +
            (v.danmaku ? ' · 弹幕 ' + fmtNum(v.danmaku) : '') +
            (v.pubdate ? ' · 发布 ' + fmtDate(v.pubdate) : '') +
          '</p>' +
          '<a class="primary" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">去 B站 看视频 / 发评论</a>' +
        '</div>' +
      '</div>';
  }

  /* ---------------- 评论列表 ---------------- */

  function cmtHtml(c) {
    var text = esc(c.content || '');
    var long = text.length > 140;
    return '<div class="cmt">' +
      (c.avatar
        ? '<img class="cmt-avatar" src="' + esc(c.avatar) + '" alt="" referrerpolicy="no-referrer" loading="lazy">'
        : '<div class="cmt-avatar cmt-avatar-empty"></div>') +
      '<div class="cmt-main">' +
        '<div class="cmt-head">' +
          '<span class="who">' + esc(c.user || '匿名') + '</span>' +
          '<span>' + fmtDate(c.ctime) + '</span>' +
          (c.like ? '<span class="cmt-like">赞 ' + fmtNum(c.like) + '</span>' : '') +
          (c.rcount ? '<span>回复 ' + fmtNum(c.rcount) + '</span>' : '') +
        '</div>' +
        '<div class="cmt-text' + (long ? ' clamp' : '') + '">' + text + '</div>' +
        (long ? '<button class="cmt-more" type="button">展开</button>' : '') +
      '</div>' +
    '</div>';
  }

  function renderComments() {
    if (!rootList) return;
    var list = (data && data[sortMode]) || [];
    var limit = sortMode === 'hot' ? CFG.hotCount : CFG.latestCount;

    if (!list.length) {
      var hasVideo = !!(data && data.video);
      rootList.innerHTML = hasVideo
        ? '<p class="empty">' + (data.note ? esc(data.note) : '这个视频暂时没抓到评论（可能已关闭评论区，或该视频还没人评论）。') + '</p>'
        : '<p class="empty">评论快照还没就位。数据由 GitHub Action 定时抓取，配好 BV 号后跑一次就有。</p>';
      return;
    }

    var shown = list.slice(0, limit);
    rootList.innerHTML = shown.map(cmtHtml).join('') +
      '<p class="hint">显示 ' + shown.length + ' / ' + list.length + ' 条（' +
      (sortMode === 'hot' ? '按热度' : '按时间倒序') + '）' +
      (data.note ? ' · ' + esc(data.note) : '') + '。</p>';
  }

  /* ---------------- 加载 ---------------- */

  function paint() {
    renderVideo();
    renderComments();
    var badge = document.getElementById('biliSync');
    if (badge) {
      badge.textContent = data && data.updated
        ? '快照同步于 ' + fmtStamp(data.updated)
        : '';
    }
    var tabs = document.getElementById('biliTabs');
    if (tabs) {
      Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-sort') === sortMode);
      });
    }
  }

  function load(done) {
    if (data || loading) { if (done) done(); return; }
    loading = true;
    // 加时间戳避免 GitHub Pages 的 CDN 缓存住旧数据
    fetch(CFG.dataUrl + '?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { data = j; })
      .catch(function () { data = null; })
      .then(function () { loading = false; tried = true; if (done) done(); });
  }

  function init() {
    rootVideo = document.getElementById('biliVideo');
    rootList = document.getElementById('biliComments');
    if (!rootVideo || !rootList) return;

    if (data || tried) { paint(); return; }
    rootVideo.innerHTML = '<p class="empty">加载中…</p>';
    rootList.innerHTML = '';
    load(paint);
  }

  /* 切换 热门 / 最新 */
  document.addEventListener('click', function (e) {
    var tab = e.target.closest('#biliTabs button');
    if (tab) {
      sortMode = tab.getAttribute('data-sort');
      paint();
      return;
    }
    var more = e.target.closest('.cmt-more');
    if (more) {
      var txt = more.parentNode.querySelector('.cmt-text');
      var clamped = txt.classList.toggle('clamp');
      more.textContent = clamped ? '展开' : '收起';
    }
  });

  return { init: init, config: CFG, reload: function () { data = null; tried = false; init(); } };
})();
