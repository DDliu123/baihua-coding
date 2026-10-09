/* 白话编程 — 交互层
   分组改为「你要做什么事」的任务轴，技术主题降级为侧栏筛选。
   无框架、无构建。数据来自 window.BHC（data/taxonomy.js）。 */
(function () {
  'use strict';

  var DATA = window.BHC;
  if (!DATA || !DATA.groups) return;

  var LS_FAV = 'bhc-favorites';
  var LS_ACCENT = 'bhc-accent';
  var LS_MODE = 'bhc-color-mode';

  var GROUPS = DATA.groups;
  var TERMS = DATA.terms;
  var ORDER = DATA.order;

  var state = {
    group: GROUPS[0].key,
    side: null,       // null | 't:主题key' | 'c:分类名'
    favOnly: false,
    query: '',
    favs: loadJSON(LS_FAV, {})
  };

  /* ---------- helpers ---------- */

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function loadJSON(k, fb) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; }
  }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function byId(id) { return document.getElementById(id); }

  function isFav(slug) { return !!state.favs[slug]; }

  function groupById(key) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].key === key) return GROUPS[i];
    return GROUPS[0];
  }

  var ITEM_MAP = null;
  function findItem(slug) {
    if (!ITEM_MAP) {
      ITEM_MAP = {};
      GROUPS.forEach(function (g) {
        g.sections.forEach(function (s) {
          s.items.forEach(function (it) { ITEM_MAP[it.slug] = it; });
        });
      });
    }
    return ITEM_MAP[slug];
  }

  /* 症状标签 → 术语。症状是用户原话，检索价值高但字面常不命中术语名，故并入索引 */
  var SYMPTOM_TEXT = (function () {
    var map = {};
    GROUPS.forEach(function (g) {
      (g.symptoms || []).forEach(function (s) {
        (s.slugs || []).forEach(function (slug) {
          map[slug] = map[slug] ? map[slug] + ' ' + s.label : s.label;
        });
      });
    });
    return map;
  })();

  function firstScene(t) {
    var s = t && t.scenes;
    return (s && s.length) ? s[0] : '';
  }

  /* ---------- 搜索索引 ---------- */

  var INDEX = null;

  function index() {
    if (INDEX) return INDEX;
    INDEX = {};
    ORDER.forEach(function (slug, i) {
      var t = TERMS[slug] || {};
      /* 检索面只覆盖自撰字段：名称、一句话痛点、用户原话、使用边界、症状标签。
         不索引 demo / full —— 两者已从数据层移除。 */
      var body = [
        t.tagline, t.oneline, SYMPTOM_TEXT[slug], t.alias,
        (t.scenes || []).join(' '), (t.pitfalls || []).join(' ')
      ].join(' ');
      INDEX[slug] = {
        seq: i,
        names: ((t.zh || '') + ' ' + (t.en || '') + ' ' + slug).toLowerCase(),
        text: ((t.zh || '') + ' ' + (t.en || '') + ' ' + slug + ' ' + body).toLowerCase()
      };
    });
    return INDEX;
  }

  /* 名称命中优先，其次正文命中；同级保持目录序 */
  function search(q) {
    var idx = index();
    var out = [];
    ORDER.forEach(function (slug) {
      var e = idx[slug];
      var inName = e.names.indexOf(q) !== -1;
      if (!inName && e.text.indexOf(q) === -1) return;
      out.push({ slug: slug, tier: inName ? 0 : 1, seq: e.seq });
    });
    out.sort(function (a, b) { return (a.tier - b.tier) || (a.seq - b.seq); });
    return out.map(function (r) { return r.slug; });
  }

  /* ---------- 渲染 ---------- */

  function renderTabs() {
    byId('groupTabs').innerHTML = GROUPS.map(function (g) {
      var on = !state.query && !state.favOnly && g.key === state.group;
      var n = g.sections.reduce(function (a, s) { return a + s.count; }, 0);
      return '<button class="gtab" role="tab" data-g="' + esc(g.key) + '" aria-selected="' +
        (on ? 'true' : 'false') + '">' + esc(g.name) + '<b>' + n + '</b></button>';
    }).join('');
  }

  function renderSide() {
    var g = groupById(state.group);
    var slugs = [];
    g.sections.forEach(function (s) {
      s.items.forEach(function (it) { slugs.push(it.slug); });
    });
    var inGroup = {};
    slugs.forEach(function (s) { inGroup[s] = 1; });

    var html = '<button class="stab" data-s="all" aria-pressed="' +
      (state.side === null ? 'true' : 'false') + '">全部</button>';

    DATA.sideFilters.topics.forEach(function (t) {
      var has = slugs.some(function (s) { return TERMS[s] && TERMS[s].topic === t.key; });
      if (!has) return;
      var on = state.side === 't:' + t.key;
      html += '<button class="stab" data-s="t:' + esc(t.key) + '" aria-pressed="' +
        (on ? 'true' : 'false') + '">' + esc(t.name) + '</button>';
    });

    g.sections.forEach(function (s) {
      var on = state.side === 'c:' + s.name;
      html += '<button class="stab" data-s="c:' + esc(s.name) + '" aria-pressed="' +
        (on ? 'true' : 'false') + '">' + esc(s.name) + '</button>';
    });

    byId('sideTabs').innerHTML = html;
  }

  function cardHTML(it) {
    var t = TERMS[it.slug] || {};
    var on = isFav(it.slug);
    return '<article class="card">' +
      '<div class="card-head">' +
        '<a class="card-title" href="#' + esc(it.slug) + '" data-slug="' + esc(it.slug) + '">' +
          '<h3>' + esc(it.zh) + (it.en ? '<em>' + esc(it.en) + '</em>' : '') + '</h3>' +
        '</a>' +
        '<button type="button" class="star" data-fav="' + esc(it.slug) + '" aria-pressed="' +
          (on ? 'true' : 'false') + '" aria-label="' + (on ? '取消收藏' : '收藏') +
          '" title="' + (on ? '取消收藏' : '收藏') + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M12 3.6l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8z"/></svg>' +
        '</button>' +
      '</div>' +
      (it.tagline ? '<p class="card-tagline">' + esc(it.tagline) + '</p>' : '') +
      (firstScene(t) ? '<p class="card-scene">' + esc(firstScene(t)) + '</p>' : '') +
    '</article>';
  }

  function passes(it) {
    if (state.favOnly && !isFav(it.slug)) return false;
    if (!state.side) return true;
    var t = TERMS[it.slug] || {};
    if (state.side.indexOf('t:') === 0) return t.topic === state.side.slice(2);
    if (state.side.indexOf('c:') === 0) return t.cat === state.side.slice(2);
    return true;
  }

  function renderSheet() {
    var box = byId('results');
    var totalAll = 0;
    GROUPS.forEach(function (g) {
      g.sections.forEach(function (s) { totalAll += s.count; });
    });

    /* --- 搜索态：跨全部分组 --- */
    if (state.query) {
      var slugs = search(state.query.toLowerCase()).filter(function (s) {
        return !(state.favOnly && !isFav(s));
      });

      byId('groupName').textContent = '「' + state.query + '」的结果';
      byId('groupDesc').textContent = slugs.length
        ? '共 ' + slugs.length + ' 条，名称命中的排在前面。不限分组。'
        : '没有匹配的术语。';
      byId('groupPills').innerHTML = '';

      if (!slugs.length) {
        box.innerHTML = '<div class="empty"><b>没找到「' + esc(state.query) + '」</b>' +
          '<p>换个说法试试——把「弹窗」写成「能关掉的浮层」，把「一直转圈」写成「加载」。</p></div>';
        return;
      }

      var buckets = [];
      var gi = {};
      GROUPS.forEach(function (g) { gi[g.key] = buckets.length; buckets.push({ g: g, items: [] }); });
      slugs.forEach(function (s) {
        var t = TERMS[s] || {};
        var it = findItem(s);
        var k = gi[t.group];
        if (it && k != null) buckets[k].items.push(it);
      });

      box.innerHTML = buckets.filter(function (b) { return b.items.length; })
        .map(function (b) {
          return '<section class="cat"><div class="cat-title">' + esc(b.g.name) +
            '<span>' + b.items.length + ' 条</span></div><div class="grid">' +
            b.items.map(cardHTML).join('') + '</div></section>';
        }).join('');
      return;
    }

    /* --- 分组态 --- */
    var g = groupById(state.group);
    byId('groupName').textContent = g.name;
    byId('groupDesc').textContent = g.desc;

    var total = g.sections.reduce(function (a, s) { return a + s.count; }, 0);
    byId('groupPills').innerHTML =
      '<span class="pills-label">不知道该搜什么？从这里进</span>' +
      (g.symptoms || []).map(function (s) {
        return '<button type="button" class="pill" data-slugs="' +
          esc(s.slugs.join(',')) + '">' + esc(s.label) + '</button>';
      }).join('');

    var sections = g.sections.map(function (s) {
      return { name: s.name, items: s.items.filter(passes) };
    }).filter(function (s) { return s.items.length; });

    var shown = sections.reduce(function (a, s) { return a + s.items.length; }, 0);
    if (state.favOnly || state.side) {
      byId('groupDesc').textContent = g.desc + '（当前 ' + shown + ' / ' + total + ' 条）';
    }

    if (!sections.length) {
      box.innerHTML = '<div class="empty"><b>这里还没有内容</b><p>' +
        (state.favOnly
          ? '点卡片右上角的星标就能收藏，收藏后在这里快速找到。'
          : '换一个分类看看，或点「全部」回到完整列表。') + '</p></div>';
      return;
    }

    box.innerHTML = sections.map(function (s) {
      return '<section class="cat"><div class="cat-title">' + esc(s.name) +
        '<span>' + s.items.length + ' 条</span></div><div class="grid">' +
        s.items.map(cardHTML).join('') + '</div></section>';
    }).join('');
  }

  function syncStars() {
    $$('.star').forEach(function (b) {
      var on = isFav(b.getAttribute('data-fav'));
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', on ? '取消收藏' : '收藏');
      b.setAttribute('title', on ? '取消收藏' : '收藏');
    });
    byId('favCount').textContent = String(Object.keys(state.favs).length);
  }

  function render() {
    renderTabs();
    renderSide();
    renderSheet();
    syncStars();
  }

  /* ---------- 详情 ---------- */

  function openDetail(slug) {
    var it = findItem(slug);
    var t = TERMS[slug] || {};
    if (!it) return;

    function sec(title, hint, inner) {
      if (!inner) return '';
      return '<section class="d-sec"><h4>' + esc(title) + '</h4>' +
        (hint ? '<p class="d-hint">' + esc(hint) + '</p>' : '') + inner + '</section>';
    }

    function listHTML(items, cls) {
      return (items || []).length ? '<ul class="' + cls + '">' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '';
    }
    function textSection(title, body, cls) {
      return body ? '<section class="d-sec"><h4>' + esc(title) + '</h4><div class="d-prose ' + (cls || '') + '">' + esc(body) + '</div></section>' : '';
    }
    var scenes = listHTML(t.scenes || [], 'd-scenes');
    var pits = listHTML(t.pitfalls || [], 'd-pitfalls');
    var code = t.code && t.code.body
      ? (t.code.title ? '<p class="d-code-title">' + esc(t.code.title) + '</p>' : '') +
        '<pre class="d-code">' + esc(t.code.body) + '</pre>'
      : '<p class="d-empty-note">这个概念不一定适合用一小段代码说明。先理解它解决的问题，再结合项目实际实现。</p>';
    var alias = (t.alias && t.alias !== t.en) || t.topicName || t.cat
      ? '<div class="d-tags">' + (t.alias && t.alias !== t.en ? '<span>别名：' + esc(t.alias) + '</span>' : '') +
        '<span>' + esc(t.topicName || '') + '</span><span>' + esc(t.cat || '') + '</span></div>' : '';
    var related = (t.relatedTerms || []).length ? '<div class="d-related">' + t.relatedTerms.map(function (r) {
      return '<button type="button" class="d-related-item" data-related-slug="' + esc(r.slug) + '"><b>' + esc(r.zh) + '</b>' +
        (r.en ? '<span>' + esc(r.en) + '</span>' : '') + '<small>' + esc(r.reason || '相关概念') + '</small></button>';
    }).join('') + '</div>' : '';
    var prompt = t.aiPrompt ? '<pre class="d-prompt">' + esc(t.aiPrompt) + '</pre><button type="button" class="d-copy" data-copy>复制 AI Coding 指令</button>' : '';
    var back = document.createElement('div');
    back.className = 'sheet-back';
    back.innerHTML =
      '<article class="detail" role="dialog" aria-modal="true" aria-label="' + esc(it.zh) + '">' +
        '<div class="detail-head">' +
          '<h3>' + esc(it.zh) + (it.en ? '<em>' + esc(it.en) + '</em>' : '') + '</h3>' +
          '<div class="detail-meta">' +
            '<span class="detail-tag">' + esc(groupById(t.group).name) + '</span>' +
            '<button type="button" class="detail-close" aria-label="关闭">×</button>' +
          '</div>' +
        '</div>' +
        (it.tagline ? '<p class="detail-tagline">' + esc(it.tagline) + '</p>' : '') +
        alias +
        textSection('快速理解', t.plainExplanation || t.summary, 'd-summary') +
        sec('你可能会这样描述', '先从真实需求出发，再认识对应的技术概念。', scenes) +
        textSection('什么时候使用', t.whenToUse, 'd-usage') +
        textSection('什么时候不适合', t.whenNotToUse, 'd-caution') +
        textSection('它在代码或系统里怎么工作', t.howItWorks, 'd-how') +
        sec('实现示例', null, code) +
        sec('容易踩的坑', '优先关注会导致功能错误或用户体验不一致的问题。', pits) +
        sec('相关概念', '遇到相近需求时，可以继续对比这些词条。', related) +
        sec('带着这个概念去开发', '指令会优先沿用当前项目的技术栈与实现约定。', prompt) +
      '</article>';

    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { back.setAttribute('data-open', ''); });

    function close() {
      back.removeAttribute('data-open');
      document.body.style.overflow = '';
      setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 200);
    }
    back.addEventListener('click', function (e) {
      var relatedBtn = e.target.closest('[data-related-slug]');
      if (relatedBtn) { close(); openDetail(relatedBtn.getAttribute('data-related-slug')); return; }
      var copy = e.target.closest('.d-copy');
      if (copy) {
        var pre = $('.d-prompt', back);
        if (!pre) return;
        var done = function () {
          copy.textContent = '已复制';
          copy.setAttribute('data-done', '1');
          setTimeout(function () {
            copy.textContent = '复制 AI Coding 指令';
            copy.removeAttribute('data-done');
          }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(pre.textContent).then(done, done);
        } else {
          var ta = document.createElement('textarea');
          ta.value = pre.textContent;
          document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); } catch (err) {}
          document.body.removeChild(ta); done();
        }
        return;
      }
      if (e.target === back || e.target.closest('.detail-close')) close();
    });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });
    $('.detail-close', back).focus();
  }

  /* ---------- 交互 ---------- */

  function toggleClear() {
    var btn = $('.find-clear');
    if (btn) btn.hidden = !byId('q').value;
  }

  /* 症状胶囊：不做文本搜索（用户原话常常一个字都不命中），
     直接展示人工挑选好的术语。 */
  function showSymptom(slugs, label) {
    state.query = '';
    byId('q').value = '';
    toggleClear();
    state.favOnly = false;
    byId('favBtn').setAttribute('aria-pressed', 'false');

    var items = slugs.map(findItem).filter(Boolean);
    byId('groupName').textContent = label;
    byId('groupDesc').textContent =
      '这 ' + items.length + ' 个术语通常能解决「' + label + '」这个问题。';
    byId('groupPills').innerHTML = '<span class="pills-label">换个问题</span>' +
      (groupById(state.group).symptoms || []).map(function (s) {
        return s.label === label ? '' :
          '<button type="button" class="pill" data-slugs="' + esc(s.slugs.join(',')) + '">' +
          esc(s.label) + '</button>';
      }).join('');

    byId('results').innerHTML =
      '<section class="cat"><div class="cat-title">' + esc(label) +
      '<span>' + items.length + ' 条</span></div><div class="grid">' +
      items.map(cardHTML).join('') + '</div></section>';
    syncStars();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function runSearch(q) {
    if (!q) { clearSearch(); return; }
    state.query = q;
    state.favOnly = false;
    byId('favBtn').setAttribute('aria-pressed', 'false');
    try { history.replaceState(null, '', '?q=' + encodeURIComponent(q)); } catch (e) {}
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearSearch() {
    state.query = '';
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    toggleClear();
    render();
  }

  function bind() {
    byId('groupTabs').addEventListener('click', function (e) {
      var b = e.target.closest('.gtab');
      if (!b) return;
      state.group = b.getAttribute('data-g');
      state.side = null;
      state.favOnly = false;
      byId('favBtn').setAttribute('aria-pressed', 'false');
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    byId('sideTabs').addEventListener('click', function (e) {
      var b = e.target.closest('.stab');
      if (!b) return;
      var s = b.getAttribute('data-s');
      state.side = s === 'all' ? null : s;
      render();
    });

    byId('groupPills').addEventListener('click', function (e) {
      var b = e.target.closest('.pill');
      if (!b) return;
      var slugs = (b.getAttribute('data-slugs') || '').split(',').filter(Boolean);
      showSymptom(slugs, b.textContent);
    });

    byId('favBtn').addEventListener('click', function () {
      state.favOnly = !state.favOnly;
      this.setAttribute('aria-pressed', state.favOnly ? 'true' : 'false');
      if (state.favOnly) { state.query = ''; byId('q').value = ''; toggleClear(); }
      render();
    });

    byId('results').addEventListener('click', function (e) {
      var star = e.target.closest('.star');
      if (star) {
        e.preventDefault();
        var slug = star.getAttribute('data-fav');
        if (state.favs[slug]) delete state.favs[slug];
        else state.favs[slug] = Date.now();
        saveJSON(LS_FAV, state.favs);
        if (state.favOnly) render(); else syncStars();
        return;
      }
      var link = e.target.closest('.card-title');
      if (link) { e.preventDefault(); openDetail(link.getAttribute('data-slug')); }
    });

    var input = byId('q');
    input.addEventListener('input', toggleClear);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); runSearch(input.value.trim()); }
      else if (e.key === 'Escape') { input.value = ''; clearSearch(); input.blur(); }
    });
  }

  /* ---------- 主题色 / 明暗 ---------- */

  var ACCENTS = {
    indigo: { '--accent': '#4F46E5', '--accent-ink': '#4338CA', '--accent-soft': '#EEF0FF', '--accent-line': '#C7CCFF' },
    pine:   { '--accent': '#0F766E', '--accent-ink': '#115E59', '--accent-soft': '#E6F5F2', '--accent-line': '#A7DDD5' },
    plum:   { '--accent': '#9333EA', '--accent-ink': '#7E22CE', '--accent-soft': '#F6ECFE', '--accent-line': '#DCB8FB' },
    rust:   { '--accent': '#C2410C', '--accent-ink': '#9A3412', '--accent-soft': '#FDF0E6', '--accent-line': '#F5C39B' }
  };

  function applyAccent(id) {
    var v = ACCENTS[id] || ACCENTS.indigo;
    var root = document.documentElement.style;
    Object.keys(v).forEach(function (k) { root.setProperty(k, v[k]); });
    $$('.accent').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-accent') === id ? 'true' : 'false');
    });
  }

  function applyMode(mode) {
    document.documentElement.dataset.colorMode = mode;
    var b = byId('modeBtn');
    if (b) b.setAttribute('aria-label', mode === 'dark' ? '切换到浅色' : '切换到深色');
  }

  /* ---------- 启动 ---------- */

  function init() {
    var accent = 'indigo';
    try { accent = localStorage.getItem(LS_ACCENT) || accent; } catch (e) {}
    applyAccent(accent);
    applyMode(document.documentElement.dataset.colorMode || 'light');

    $('.accents').addEventListener('click', function (e) {
      var b = e.target.closest('.accent');
      if (!b) return;
      var id = b.getAttribute('data-accent');
      applyAccent(id);
      try { localStorage.setItem(LS_ACCENT, id); } catch (err) {}
    });

    byId('modeBtn').addEventListener('click', function () {
      var next = document.documentElement.dataset.colorMode === 'dark' ? 'light' : 'dark';
      applyMode(next);
      try { localStorage.setItem(LS_MODE, next); } catch (e) {}
    });

    var clear = document.createElement('button');
    clear.className = 'find-clear';
    clear.type = 'button';
    clear.setAttribute('aria-label', '清空搜索');
    clear.textContent = '×';
    clear.hidden = true;
    clear.addEventListener('click', function () {
      byId('q').value = '';
      clearSearch();
      byId('q').focus();
    });
    $('.find').appendChild(clear);

    document.addEventListener('keydown', function (e) {
      var tag = document.activeElement ? document.activeElement.tagName : '';
      if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(tag)) {
        e.preventDefault();
        byId('q').focus();
      }
    });

    bind();

    var q0 = '';
    try { q0 = new URLSearchParams(location.search).get('q') || ''; } catch (e) {}
    if (q0) { byId('q').value = q0; runSearch(q0); }
    else { render(); toggleClear(); }
  }

  /* The script sits at the end of <body>. In practice the nodes are already
     parsed, but DOMContentLoaded may still be pending — so try now and fall back
     to the event (and a short retry) rather than relying on readyState alone. */
  var booted = false;
  function boot() {
    if (booted) return;
    if (!byId('groupTabs') || !byId('results')) return;
    booted = true;
    init();
  }

  boot();
  if (!booted) {
    document.addEventListener('DOMContentLoaded', boot);
    setTimeout(boot, 60);
  }
})();
