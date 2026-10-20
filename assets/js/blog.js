/* ==========================================================================
   余白 · blog.js
   路由 / 渲染 / 写作台 / 设置 / 本地存储 / 导入导出
   ========================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'blog.site.v1';
  var UI_KEY = 'blog.ui.v1';
  var SEED_VERSION = 2;
  var MAX_SOCIALS = 6;

  var THEMES = {
    ink: { label: '墨蓝', a: '#2f4a7a', b: '#4a6a9a' },
    pine: { label: '松绿', a: '#2f5d50', b: '#437a67' },
    ochre: { label: '赭石', a: '#94572f', b: '#b57a4e' },
    rouge: { label: '胭脂', a: '#97394f', b: '#b35b6f' }
  };

  /* ---------- 工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(str) { return window.BlogMarkdown.escapeHtml(str); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function trim(str) { return String(str == null ? '' : str).trim(); }

  function safeUrl(url) {
    var value = trim(url);
    if (!value) return '';
    if (/^(javascript|vbscript|data):/i.test(value)) return '';
    if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
    if (/^[\w.-]+\.[a-z]{2,}/i.test(value)) return 'https://' + value;
    return '';
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fmtDate(iso) {
    return String(iso || '').slice(0, 10).replace(/-/g, '.');
  }

  function fmtMonth(iso) {
    return String(iso || '').slice(0, 7).replace('-', '.');
  }

  function fmtTime(date) {
    return pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function splitTags(value) {
    return String(value || '')
      .split(/[,，、;；#]/)
      .map(function (tag) { return tag.trim(); })
      .filter(Boolean)
      .slice(0, 6);
  }

  function plainText(markdown) {
    return String(markdown || '')
      .replace(/~~~[\s\S]*?~~~/g, ' ')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/[*_~`]/g, '')
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function wordCount(markdown) {
    var text = plainText(markdown);
    var chars = text.replace(/\s/g, '').length;
    return { chars: chars, minutes: Math.max(1, Math.ceil(chars / 320)) };
  }

  function excerpt(markdown, length) {
    var text = plainText(markdown);
    if (text.length <= length) return text;
    return text.slice(0, length).replace(/[，。；：、,.\s]+$/, '') + '…';
  }

  function summaryOf(post) {
    return trim(post.summary) || excerpt(post.content, 90);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function legacyCopy(value) {
    var area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.top = '-2000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(area);
    return ok;
  }

  function copyText(value) {
    return new Promise(function (resolve) {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(value).then(function () { resolve(true); }, function () {
          resolve(legacyCopy(value));
        });
      } else {
        resolve(legacyCopy(value));
      }
    });
  }

  function notify(message) {
    var node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    $('toasts').appendChild(node);
    while ($('toasts').children.length > 3) $('toasts').removeChild($('toasts').firstChild);
    setTimeout(function () { node.classList.add('in'); }, 20);
    setTimeout(function () {
      node.classList.remove('in');
      setTimeout(function () { node.remove(); }, 260);
    }, 2200);
  }

  /* ---------- 存储 ---------- */
  var storageOK = (function () {
    try {
      localStorage.setItem('__blog_probe__', '1');
      localStorage.removeItem('__blog_probe__');
      return true;
    } catch (err) { return false; }
  })();

  function normalizeProfile(raw) {
    var base = clone(window.SEED_PROFILE);
    if (!raw || typeof raw !== 'object') return base;

    Object.keys(base).forEach(function (key) {
      if (key === 'socials' || key === 'avatar') return;
      if (typeof raw[key] === 'string') base[key] = raw[key].slice(0, 400);
    });

    base.socials = (Array.isArray(raw.socials) ? raw.socials : base.socials)
      .filter(function (item) { return item && typeof item === 'object'; })
      .slice(0, MAX_SOCIALS)
      .map(function (item) {
        return { label: trim(item.label).slice(0, 12), url: trim(item.url).slice(0, 200) };
      })
      .filter(function (item) { return item.label || item.url; });

    if (!base.socials.length && Array.isArray(raw.socials)) base.socials = [];
    base.avatar = typeof raw.avatar === 'string' && /^data:image\//.test(raw.avatar) ? raw.avatar : '';

    return base;
  }

  function normalizePost(raw, index) {
    if (!raw || typeof raw !== 'object') return null;

    var date = /^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') ? raw.date : todayISO();
    var id = typeof raw.id === 'string' && raw.id ? raw.id.replace(/[^\w-]/g, '') : 'p-' + Date.now().toString(36) + index;

    return {
      id: id,
      title: trim(raw.title).slice(0, 120) || '未命名文章',
      date: date,
      tags: Array.isArray(raw.tags)
        ? raw.tags.filter(function (tag) { return typeof tag === 'string'; }).map(function (tag) { return tag.trim(); }).filter(Boolean).slice(0, 6)
        : splitTags(raw.tags),
      summary: trim(raw.summary).slice(0, 200),
      pinned: !!raw.pinned,
      draft: !!raw.draft,
      content: String(raw.content || '')
    };
  }

  function normalizeState(raw) {
    var profile = normalizeProfile(raw && raw.profile);
    var posts = raw && Array.isArray(raw.posts)
      ? raw.posts.map(normalizePost).filter(Boolean)
      : [];
    return { profile: profile, posts: posts };
  }

  function loadState() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (raw && raw.profile && Array.isArray(raw.posts)) {
        var storedSeed = 0;
        try { storedSeed = Number(localStorage.getItem('blog.seed.v1') || 0); } catch (err) { storedSeed = 0; }
        var isOldDemo = raw.profile.name === '林知远' && raw.profile.siteName === '余白';
        if (isOldDemo && storedSeed < SEED_VERSION) {
          return { state: normalizeState({ profile: window.SEED_PROFILE, posts: window.SEED_POSTS }), seeded: true };
        }
        return { state: normalizeState(raw), seeded: false };
      }
    } catch (err) { /* 忽略损坏数据 */ }
    return { state: normalizeState({ profile: window.SEED_PROFILE, posts: window.SEED_POSTS }), seeded: true };
  }

  var loaded = loadState();
  var state = loaded.state;

  var ui = (function () {
    var fallback = { theme: 'ink', mode: 'auto' };
    try {
      var raw = JSON.parse(localStorage.getItem(UI_KEY) || 'null') || {};
      if (THEMES[raw.theme]) fallback.theme = raw.theme;
      if (['light', 'dark', 'auto'].indexOf(raw.mode) !== -1) fallback.mode = raw.mode;
    } catch (err) { /* 忽略 */ }
    return fallback;
  })();

  function saveState() {
    if (!storageOK) return false;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ profile: state.profile, posts: state.posts }));
      return true;
    } catch (err) {
      notify('保存失败：浏览器存储空间可能已满');
      return false;
    }
  }

  function saveUI() {
    if (!storageOK) return;
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (err) { /* 忽略 */ }
  }

  /* ---------- 主题 ---------- */
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function resolvedMode() {
    if (ui.mode === 'light' || ui.mode === 'dark') return ui.mode;
    return media && media.matches ? 'dark' : 'light';
  }

  function applyUI() {
    var root = document.documentElement;
    root.dataset.theme = ui.theme;
    root.dataset.mode = resolvedMode();

    var meta = $('metaTheme');
    if (meta) meta.setAttribute('content', resolvedMode() === 'dark' ? '#141312' : '#f5f2ec');

    document.querySelectorAll('.theme-switch button').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.mode === ui.mode);
    });

    var mobileIcon = $('btnMobileTheme') && $('btnMobileTheme').querySelector('use');
    if (mobileIcon) mobileIcon.setAttribute('href', resolvedMode() === 'dark' ? '#i-sun' : '#i-moon');

    var favicon = $('favicon');
    if (favicon) {
      var theme = THEMES[ui.theme] || THEMES.ink;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop stop-color="' + theme.a + '"/><stop offset="1" stop-color="' + theme.b + '"/></linearGradient></defs>' +
        '<rect width="32" height="32" rx="9" fill="url(#g)"/>' +
        '<path d="M9 22V10h14M9 16h10" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
      favicon.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
    }
  }

  function setMode(mode) {
    ui.mode = mode;
    saveUI();
    applyUI();
  }

  /* ---------- 数据访问 ---------- */
  function allPosts() {
    return state.posts.slice().sort(function (a, b) {
      if (a.date === b.date) return a.id < b.id ? 1 : -1;
      return a.date < b.date ? 1 : -1;
    });
  }

  function publishedPosts() {
    return allPosts().filter(function (post) { return !post.draft; });
  }

  function findPost(id) {
    for (var i = 0; i < state.posts.length; i++) {
      if (state.posts[i].id === id) return state.posts[i];
    }
    return null;
  }

  function tagStats() {
    var map = Object.create(null);
    publishedPosts().forEach(function (post) {
      post.tags.forEach(function (tag) { map[tag] = (map[tag] || 0) + 1; });
    });
    return Object.keys(map).map(function (tag) { return { tag: tag, count: map[tag] }; })
      .sort(function (a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); });
  }

  var filter = { tag: '', q: '' };

  function filterActive() {
    return !!filter.tag || !!filter.q;
  }

  function filteredPosts() {
    var list = publishedPosts();
    if (filter.tag) list = list.filter(function (post) { return post.tags.indexOf(filter.tag) !== -1; });
    if (filter.q) {
      var q = filter.q.toLowerCase();
      list = list.filter(function (post) {
        return (post.title + ' ' + post.summary + ' ' + post.tags.join(' ') + ' ' + plainText(post.content))
          .toLowerCase().indexOf(q) !== -1;
      });
    }
    return list;
  }

  function featuredPost() {
    var posts = publishedPosts();
    if (!posts.length) return null;
    for (var i = 0; i < posts.length; i++) {
      if (posts[i].pinned) return posts[i];
    }
    return posts[0];
  }

  function visibleList() {
    if (filterActive()) return filteredPosts();
    var featured = featuredPost();
    return publishedPosts().filter(function (post) { return !featured || post.id !== featured.id; });
  }

  /* ---------- 路由 ---------- */
  var route = { name: 'home', id: null };
  var view = $('view');

  function parseRoute() {
    var raw = location.hash.replace(/^#\/?/, '');
    var parts = raw.split('/').filter(Boolean);
    if (!parts.length) return { name: 'home' };
    if (parts[0] === 'p') return { name: 'post', id: decodeURIComponent(parts.slice(1).join('/')) };
    if (parts[0] === 'write') return { name: 'write', id: parts[1] ? decodeURIComponent(parts[1]) : null };
    if (parts[0] === 'archive' || parts[0] === 'about' || parts[0] === 'manage') return { name: parts[0] };
    return { name: '404' };
  }

  function onRoute() {
    flushEditor();
    var previous = route.name;
    route = parseRoute();

    if (route.name === 'home' && previous !== 'home') {
      filter.tag = '';
      filter.q = '';
    }

    renderView();
    window.scrollTo(0, 0);
    closeOverlays();
  }

  /* ---------- 侧栏 ---------- */
  function firstName(name) {
    var chars = Array.from(trim(name));
    return chars.length ? chars[0] : '余';
  }

  function updateSidebar() {
    var p = state.profile;
    $('wordmarkText').textContent = trim(p.siteName) || '博客';
    $('mobileTitle').textContent = trim(p.siteName) || '博客';
    $('profileName').textContent = trim(p.name) || '你的名字';
    $('profileRole').textContent = trim(p.role);
    $('profileTagline').textContent = trim(p.tagline);

    var mono = firstName(p.name);
    $('avatarMono').textContent = mono;
    $('settingsAvatarMono').textContent = mono;

    var hasAvatar = !!p.avatar;
    $('avatarImg').hidden = !hasAvatar;
    $('settingsAvatarImg').hidden = !hasAvatar;
    if (hasAvatar) {
      $('avatarImg').src = p.avatar;
      $('settingsAvatarImg').src = p.avatar;
    }
    $('avatarMono').hidden = hasAvatar;
    $('settingsAvatarMono').hidden = hasAvatar;

    var meta = [];
    if (trim(p.location)) {
      meta.push('<li><svg class="icon" aria-hidden="true"><use href="#i-pin"></use></svg><span>' + esc(p.location) + '</span></li>');
    }
    if (trim(p.email)) {
      meta.push('<li><a href="mailto:' + esc(p.email) + '"><svg class="icon" aria-hidden="true"><use href="#i-mail"></use></svg><span>' + esc(p.email) + '</span></a></li>');
    }
    $('profileMeta').innerHTML = meta.join('');

    $('profileSocials').innerHTML = p.socials.map(function (social) {
      var url = safeUrl(social.url);
      if (!url) return '';
      var external = /^https?:/i.test(url);
      return '<li><a href="' + esc(url) + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(social.label || url) + '</a></li>';
    }).join('');

    var count = publishedPosts().length;
    $('navCount').textContent = count;
    $('navArchive').textContent = count;
    $('footYear').textContent = new Date().getFullYear();
    $('footSite').textContent = trim(p.siteName) || '博客';
    $('footCopy').textContent = '© ' + new Date().getFullYear() + ' ' + (trim(p.siteName) || '博客');
  }

  function syncNav() {
    var map = { home: 'home', post: 'home', archive: 'archive', about: 'about', manage: 'manage', write: 'manage' };
    var active = map[route.name] || '';
    document.querySelectorAll('.nav a').forEach(function (link) {
      link.classList.toggle('is-active', link.dataset.nav === active);
    });
  }

  /* ---------- 渲染：首页 ---------- */
  function tagChips() {
    var stats = tagStats();
    var html = '<button class="chip' + (!filter.tag ? ' is-active' : '') + '" type="button" data-tag="">全部</button>';
    html += stats.map(function (item) {
      return '<button class="chip' + (filter.tag === item.tag ? ' is-active' : '') + '" type="button" data-tag="' + esc(item.tag) + '">' +
        esc(item.tag) + ' <span>' + item.count + '</span></button>';
    }).join('');
    return html;
  }

  function postRow(post) {
    var metrics = wordCount(post.content);
    return '<a class="post-row" href="#/p/' + encodeURIComponent(post.id) + '">' +
      '<span class="post-row__date">' + fmtDate(post.date) + '</span>' +
      '<div class="post-row__body">' +
      '<h3 class="post-row__title">' + esc(post.title) + '</h3>' +
      '<p class="post-row__summary">' + esc(summaryOf(post)) + '</p>' +
      '<div class="post-row__meta">' +
      post.tags.map(function (tag) { return '<span class="tag">' + esc(tag) + '</span>'; }).join('') +
      (post.tags.length ? '<span class="dot"></span>' : '') +
      '<span>' + metrics.minutes + ' 分钟阅读</span>' +
      (post.draft ? '<span class="dot"></span><span>草稿</span>' : '') +
      '</div></div>' +
      '<span class="post-row__arrow" aria-hidden="true"><svg class="icon"><use href="#i-arrow-right"></use></svg></span>' +
      '</a>';
  }

  function featuredCard(post) {
    var metrics = wordCount(post.content);
    return '<a class="featured" href="#/p/' + encodeURIComponent(post.id) + '">' +
      '<span class="featured__label"><i></i>' + (post.pinned ? '置顶文章' : '最新文章') + '</span>' +
      '<span class="featured__arrow" aria-hidden="true"><svg class="icon"><use href="#i-arrow-up-right"></use></svg></span>' +
      '<h2>' + esc(post.title) + '</h2>' +
      '<p>' + esc(summaryOf(post)) + '</p>' +
      '<div class="featured__meta">' +
      '<span>' + fmtDate(post.date) + '</span>' +
      '<span>' + metrics.minutes + ' 分钟阅读</span>' +
      (post.tags[0] ? '<span>#' + esc(post.tags[0]) + '</span>' : '') +
      '</div>' +
      '<span class="featured__index" aria-hidden="true">01</span>' +
      '</a>';
  }

  function emptyList() {
    if (!filterActive() && publishedPosts().length && featuredPost()) {
      return '<p class="list-end">已经读完所有文章了，新的文字正在路上。</p>';
    }
    if (filterActive()) {
      return '<div class="empty"><h3>没有找到相关文章</h3><p>换个关键词，或者清空筛选试试。</p>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-clear-filter>清空筛选</button></div>';
    }
    return '<div class="empty"><h3>还没有文章</h3><p>写下第一篇，这里就会热闹起来。</p>' +
      '<a class="btn btn-primary btn-sm" href="#/write">写第一篇</a></div>';
  }

  function updateList() {
    var list = visibleList();
    var container = $('postList');
    if (!container) return;
    container.innerHTML = list.length ? list.map(postRow).join('') : emptyList();

    var count = $('listCount');
    if (count) count.textContent = list.length;

    var label = $('listLabel');
    if (label) label.textContent = filterActive() ? (filter.q ? '搜索结果' : '标签筛选') : (featuredPost() ? '更多文章' : '全部文章');

    var featuredWrap = $('featuredWrap');
    if (featuredWrap) featuredWrap.hidden = filterActive();

    document.querySelectorAll('#filters .chip').forEach(function (chip) {
      chip.classList.toggle('is-active', (chip.dataset.tag || '') === filter.tag);
    });
  }

  function homeView() {
    var posts = publishedPosts();
    var tags = tagStats();
    var featured = featuredPost();
    var latest = posts[0];
    var list = visibleList();

    return '<div class="home">' +
      '<section class="hero">' +
      '<p class="eyebrow">Personal blog</p>' +
      '<h1>你好，我是<em>' + esc(trim(state.profile.name) || '你') + '</em>。</h1>' +
      '<p class="hero__lede">' + esc(trim(state.profile.tagline) || '在这里记录一些值得慢下来的事。') + '</p>' +
      '<div class="hero__stats">' +
      '<div class="stat"><b>' + posts.length + '</b><span>篇文章</span></div>' +
      '<div class="stat"><b>' + tags.length + '</b><span>个标签</span></div>' +
      '<div class="stat"><b>' + (latest ? fmtMonth(latest.date) : '—') + '</b><span>最近更新</span></div>' +
      '</div></section>' +

      (featured ? '<div id="featuredWrap">' + featuredCard(featured) + '</div>' : '') +

      '<div class="list-head">' +
      '<p class="list-head__title"><span id="listLabel">' + (featured ? '更多文章' : '全部文章') + '</span> <b id="listCount">' + list.length + '</b></p>' +
      '<div class="search"><svg class="icon" aria-hidden="true"><use href="#i-search"></use></svg>' +
      '<input id="q" type="search" aria-label="搜索文章" placeholder="搜索标题、摘要或标签（/）" autocomplete="off"></div>' +
      '</div>' +
      '<div class="filters" id="filters">' + tagChips() + '</div>' +
      '<div class="post-list" id="postList">' + (list.length ? list.map(postRow).join('') : emptyList()) + '</div>' +
      '</div>';
  }

  /* ---------- 渲染：归档 ---------- */
  function archiveView() {
    var posts = publishedPosts();
    var groups = [];
    posts.forEach(function (post) {
      var year = post.date.slice(0, 4);
      var group = groups.filter(function (g) { return g.year === year; })[0];
      if (!group) { group = { year: year, posts: [] }; groups.push(group); }
      group.posts.push(post);
    });

    var body = groups.map(function (group) {
      return '<section class="year-group">' +
        '<h2 class="year-group__title">' + group.year + ' <span class="year-group__count">' + group.posts.length + ' 篇</span></h2>' +
        group.posts.map(function (post) {
          var metrics = wordCount(post.content);
          return '<a class="archive-row" href="#/p/' + encodeURIComponent(post.id) + '">' +
            '<span class="archive-row__date">' + post.date.slice(5).replace('-', ' / ') + '</span>' +
            '<span class="archive-row__title">' + esc(post.title) + '</span>' +
            '<span class="archive-row__meta"><span>' + metrics.minutes + ' 分钟</span>' +
            (post.tags[0] ? '<span class="tag">' + esc(post.tags[0]) + '</span>' : '') + '</span>' +
            '</a>';
        }).join('') +
        '</section>';
    }).join('');

    return '<div class="archive">' +
      '<header class="page-head">' +
      '<p class="eyebrow">Archive</p>' +
      '<h1>全部文章</h1>' +
      '<p>按时间排列的写作记录，共 ' + posts.length + ' 篇。' + (posts.length ? '从最新的一篇开始读，或者随意挑一篇。' : '') + '</p>' +
      '</header>' +
      (posts.length ? body : '<div class="empty"><h3>还没有文章</h3><p>去写作台写第一篇吧。</p><a class="btn btn-primary btn-sm" href="#/write">写第一篇</a></div>') +
      '</div>';
  }

  /* ---------- 渲染：关于 ---------- */
  function aboutView() {
    var p = state.profile;
    var paragraphs = String(p.bio || '').split(/\n+/).filter(function (line) { return line.trim(); });
    var socialItems = p.socials.map(function (social) {
      var url = safeUrl(social.url);
      var label = esc(social.label || '');
      if (url) {
        return '<span class="about-social"><a href="' + esc(url) + '"' + (/^https?:/i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(social.label || url) + '</a></span>';
      }
      if (trim(social.url)) {
        return '<span class="about-social">' + (label ? label + ' ' : '') + esc(social.url) + '</span>';
      }
      return '';
    }).filter(Boolean);
    var socials = socialItems.length ? '<span class="about-socials">' + socialItems.join('') + '</span>' : '';

    return '<div class="about">' +
      '<header class="about__head">' +
      '<div class="avatar about__avatar">' +
      (p.avatar ? '<img src="' + esc(p.avatar) + '" alt="头像">' : '<span>' + esc(firstName(p.name)) + '</span>') +
      '</div>' +
      '<div><h1 class="about__name">' + esc(trim(p.name) || '你的名字') + '</h1>' +
      '<p class="about__role">' + esc(trim(p.role) || '写作者') + '</p></div>' +
      '</header>' +

      '<div class="about__bio">' +
      (paragraphs.length ? paragraphs.map(function (line) { return '<p>' + esc(line) + '</p>'; }).join('') : '<p>还没有填写个人简介。</p>') +
      '</div>' +

      '<div class="about__grid">' +
      '<div class="info-card"><p class="info-card__label">所在地</p><p class="info-card__value">' + (esc(trim(p.location)) || '—') + '</p></div>' +
      '<div class="info-card"><p class="info-card__label">邮箱</p><p class="info-card__value">' +
      (trim(p.email) ? '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>' : '—') + '</p></div>' +
      '<div class="info-card"><p class="info-card__label">社交与联系方式</p><p class="info-card__value">' + (socials || '—') + '</p></div>' +
      '<div class="info-card"><p class="info-card__label">写作</p><p class="info-card__value">' + publishedPosts().length + ' 篇文章 · ' +
      tagStats().length + ' 个标签</p></div>' +
      '</div>' +

      '<div class="about__note">这个博客是一个纯静态的网页：没有数据库，没有第三方服务，所有内容都保存在你此刻使用的浏览器里。' +
      '想带走它，可以在「设置 → 导出备份」里保存一份 JSON。</div>' +

      '<div class="about__actions">' +
      '<a class="btn btn-primary" href="#/archive">看看所有文章</a>' +
      '<a class="btn btn-ghost" href="#/write">写点什么</a>' +
      '</div>' +
      '</div>';
  }

  /* ---------- 渲染：写作台 ---------- */
  function manageView() {
    var posts = allPosts();
    var drafts = posts.filter(function (post) { return post.draft; }).length;

    var rows = posts.map(function (post) {
      var metrics = wordCount(post.content);
      return '<div class="manage-row">' +
        '<div class="manage-row__main">' +
        '<p class="manage-row__title">' +
        '<span class="status ' + (post.draft ? 'status--draft' : 'status--live') + '">' + (post.draft ? '草稿' : '已发布') + '</span>' +
        '<a href="#/p/' + encodeURIComponent(post.id) + '">' + esc(post.title) + '</a>' +
        '</p>' +
        '<div class="manage-row__meta"><span>' + fmtDate(post.date) + '</span><span>' + metrics.chars + ' 字</span>' +
        (post.tags.length ? '<span>' + post.tags.map(function (tag) { return '#' + esc(tag); }).join(' ') + '</span>' : '') +
        '</div></div>' +
        '<div class="manage-row__actions">' +
        '<a class="icon-btn" href="#/write/' + encodeURIComponent(post.id) + '" title="编辑" aria-label="编辑">' +
        '<svg class="icon"><use href="#i-edit"></use></svg></a>' +
        '<button class="icon-btn" type="button" data-del="' + esc(post.id) + '" title="删除" aria-label="删除">' +
        '<svg class="icon"><use href="#i-trash"></use></svg></button>' +
        '</div></div>';
    }).join('');

    return '<div class="manage">' +
      '<header class="manage-head">' +
      '<div><p class="eyebrow">Writing desk</p><h1>写作台</h1>' +
      '<p>共 ' + posts.length + ' 篇 · 已发布 ' + (posts.length - drafts) + ' 篇 · 草稿 ' + drafts + ' 篇</p></div>' +
      '<div class="write__actions"><a class="btn btn-primary" href="#/write">＋ 新建文章</a></div>' +
      '</header>' +
      (posts.length ? '<div class="manage-list">' + rows + '</div>' :
        '<div class="empty"><h3>写作台还是空的</h3><p>新建一篇文章，或者先导入一份备份。</p><a class="btn btn-primary btn-sm" href="#/write">新建文章</a></div>') +
      '</div>';
  }

  /* ---------- 渲染：文章 ---------- */
  function notFoundView() {
    return '<div class="not-found"><p class="eyebrow">404</p><h1>没有找到这一页</h1>' +
      '<p>链接可能已经失效，或者文章被删除了。</p>' +
      '<a class="btn btn-primary" href="#/">回到首页</a></div>';
  }

  function tocHtml(headings) {
    if (!headings.length) return '';
    return '<aside class="toc" aria-label="文章目录">' +
      '<p class="toc__title">本文目录</p>' +
      '<div class="toc__list">' +
      headings.map(function (heading) {
        return '<button type="button" data-anchor="' + esc(heading.id) + '" data-level="' + heading.level + '">' + esc(heading.text) + '</button>';
      }).join('') +
      '</div></aside>';
  }

  function articleHtml(post) {
    var rendered = window.BlogMarkdown.render(post.content);
    var metrics = wordCount(post.content);
    var summary = trim(post.summary);
    var bodyStart = plainText(post.content).slice(0, Math.max(12, summary.length));
    var showSummary = !!summary && bodyStart.indexOf(summary) !== 0;
    var list = publishedPosts();
    var index = -1;
    for (var i = 0; i < list.length; i++) { if (list[i].id === post.id) index = i; }
    var newer = index > 0 ? list[index - 1] : null;
    var older = index >= 0 && index < list.length - 1 ? list[index + 1] : null;

    return '<article class="article">' +
      '<a class="article__back" href="#/"><svg class="icon"><use href="#i-arrow-left"></use></svg>返回文章列表</a>' +
      '<div class="article__tags">' +
      (post.draft ? '<span class="status status--draft">草稿</span>' : '') +
      post.tags.map(function (tag) { return '<span class="tag">' + esc(tag) + '</span>'; }).join('') +
      '</div>' +
      '<div class="article__head"><h1>' + esc(post.title) + '</h1>' +
      '<div class="article__meta">' +
      '<span>' + fmtDate(post.date) + '</span><span class="dot"></span>' +
      '<span>' + metrics.minutes + ' 分钟阅读</span><span class="dot"></span>' +
      '<span>' + metrics.chars + ' 字</span>' +
      '</div></div>' +
      (showSummary ? '<p class="article__summary">' + esc(summary) + '</p>' : '') +
      '<div class="article__body">' + rendered.html + '</div>' +
      '<footer class="article__foot">' +
      '<p class="article__foot-note">写于 ' + fmtDate(post.date) + (trim(state.profile.location) ? ' · ' + esc(state.profile.location) : '') + '</p>' +
      '<div class="article__actions">' +
      '<button class="btn btn-ghost btn-sm" type="button" data-action="copy-link"><svg class="icon"><use href="#i-copy"></use></svg>复制链接</button>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-action="to-top"><svg class="icon"><use href="#i-arrow-up"></use></svg>回到顶部</button>' +
      '</div></footer>' +
      '<nav class="post-nav' + ((older ? 1 : 0) + (newer ? 1 : 0) === 1 ? ' post-nav--single' : '') + '" aria-label="相邻文章">' +
      (older ? '<a href="#/p/' + encodeURIComponent(older.id) + '"><span class="post-nav__label">更早的文章</span><span class="post-nav__title">' + esc(older.title) + '</span></a>' : '') +
      (newer ? '<a href="#/p/' + encodeURIComponent(newer.id) + '"><span class="post-nav__label">更新的文章</span><span class="post-nav__title">' + esc(newer.title) + '</span></a>' : '') +
      '</nav>' +
      '</article>';
  }

  function postLayout(id) {
    var post = findPost(id);
    if (!post) return notFoundView();
    var headings = window.BlogMarkdown.render(post.content).headings;
    if (!headings.length) {
      return '<div class="post-layout post-layout--solo">' + articleHtml(post) + '</div>';
    }
    return '<div class="post-layout">' + articleHtml(post) + tocHtml(headings) + '</div>';
  }

  /* ---------- 渲染：编辑器 ---------- */
  var editor = { post: null, isNew: false, dirty: false, timer: 0, savedAt: null };

  function blankPost() {
    return {
      id: 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      title: '',
      date: todayISO(),
      tags: [],
      summary: '',
      pinned: false,
      draft: true,
      content: ''
    };
  }

  function mdToolButtons() {
    return [
      { key: 'h2', label: 'H2', title: '二级标题' },
      { key: 'bold', label: 'B', title: '加粗' },
      { key: 'italic', label: 'I', title: '斜体' },
      { key: 'quote', label: '“', title: '引用' },
      { key: 'list', label: '•', title: '无序列表' },
      { key: 'ordered', label: '1.', title: '有序列表' },
      { key: 'code', label: '</>', title: '代码块' },
      { key: 'link', label: '↗', title: '链接' },
      { key: 'hr', label: '—', title: '分割线' }
    ].map(function (item) {
      return '<button type="button" data-md="' + item.key + '" title="' + item.title + '" aria-label="' + item.title + '">' + item.label + '</button>';
    }).join('');
  }

  function writeView(id) {
    var existing = id ? findPost(id) : null;
    editor.isNew = !existing;
    editor.post = existing ? clone(existing) : blankPost();
    editor.dirty = false;
    editor.savedAt = existing ? new Date() : null;
    clearTimeout(editor.timer);

    var post = editor.post;
    var metrics = wordCount(post.content);

    return '<section class="write" data-post="' + esc(post.id) + '">' +
      '<div class="write__bar">' +
      '<div class="write__left">' +
      '<a class="back-link" href="#/manage"><svg class="icon"><use href="#i-arrow-left"></use></svg>写作台</a>' +
      '<span class="write__status" id="writeStatus">' + (existing ? '已保存' + (editor.savedAt ? ' · ' + fmtTime(editor.savedAt) : '') : '新文章') + '</span>' +
      '</div>' +
      '<div class="write__actions">' +
      (existing ? '<button class="btn btn-ghost btn-sm" type="button" data-action="delete">删除</button>' : '') +
      '<button class="btn btn-ghost btn-sm" type="button" data-action="draft">存草稿</button>' +
      '<button class="btn btn-primary btn-sm" type="button" data-action="publish">发布</button>' +
      '</div>' +
      '</div>' +

      '<input class="write-title" id="edTitle" type="text" maxlength="120" placeholder="文章标题" aria-label="文章标题" value="' + esc(post.title) + '">' +

      '<div class="write-meta">' +
      '<label class="mini-field"><span>日期</span><input id="edDate" type="date" aria-label="发布日期" value="' + esc(post.date) + '"></label>' +
      '<label class="mini-field" style="flex:1"><span>标签（逗号分隔）</span>' +
      '<input id="edTags" type="text" maxlength="80" aria-label="文章标签" value="' + esc(post.tags.join(', ')) + '" placeholder="随笔, 设计"></label>' +
      '<label class="mini-check"><input id="edPinned" type="checkbox" aria-label="置顶文章"' + (post.pinned ? ' checked' : '') + '><span>置顶</span></label>' +
      '</div>' +

      '<label class="write-summary"><span class="section-label">摘要（留空自动截取正文）</span>' +
      '<textarea id="edSummary" rows="2" maxlength="200" aria-label="文章摘要" placeholder="一句话说清这篇文章在讲什么">' + esc(post.summary) + '</textarea></label>' +

      '<div class="editor" id="editorBox">' +
      '<div class="editor__bar">' +
      '<div class="md-tools">' + mdToolButtons() + '</div>' +
      '<div class="md-tab"><button type="button" data-view="write" class="is-active">编写</button>' +
      '<button type="button" data-view="preview">预览</button></div>' +
      '</div>' +
      '<textarea id="edContent" spellcheck="false" aria-label="正文，支持 Markdown" placeholder="从这里开始写。支持 Markdown：## 标题、**加粗**、> 引用、- 列表、```代码```">' + esc(post.content) + '</textarea>' +
      '<div class="editor__preview" id="editorPreview"></div>' +
      '<div class="editor__foot"><span id="wordCount">' + metrics.chars + ' 字 · 约 ' + metrics.minutes + ' 分钟</span>' +
      '<span class="editor__hint">Markdown · Ctrl/⌘ + S 保存</span></div>' +
      '</div>' +
      '</section>';
  }

  /* ---------- 渲染入口 ---------- */
  function renderView() {
    updateSidebar();
    syncNav();

    if (route.name === 'home') view.innerHTML = homeView();
    else if (route.name === 'archive') view.innerHTML = archiveView();
    else if (route.name === 'about') view.innerHTML = aboutView();
    else if (route.name === 'manage') view.innerHTML = manageView();
    else if (route.name === 'write') view.innerHTML = writeView(route.id);
    else if (route.name === 'post') view.innerHTML = postLayout(route.id);
    else view.innerHTML = notFoundView();

    updateTitle();
    updateProgress();
    view.focus({ preventScroll: true });
  }

  function updateTitle() {
    var site = trim(state.profile.siteName) || '博客';
    var name = trim(state.profile.name) || '';
    if (route.name === 'home') document.title = site + (name ? ' · ' + name + '的个人博客' : '');
    else if (route.name === 'post') {
      var post = findPost(route.id);
      document.title = (post ? post.title + ' · ' : '') + site;
    } else if (route.name === 'write') {
      document.title = '写作 · ' + site;
    } else if (route.name === 'archive') document.title = '归档 · ' + site;
    else if (route.name === 'about') document.title = '关于 · ' + site;
    else if (route.name === 'manage') document.title = '写作台 · ' + site;
    else document.title = '404 · ' + site;
  }

  /* ---------- 进度与目录 ---------- */
  var scrollQueued = false;

  function updateProgress() {
    var bar = $('progress');
    if (!bar) return;
    if (route.name !== 'post') { bar.hidden = true; return; }
    bar.hidden = false;

    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.firstElementChild.style.transform = 'scaleX(' + ratio + ')';
  }

  function updateToc() {
    var buttons = document.querySelectorAll('.toc button[data-anchor]');
    if (!buttons.length) return;

    var offset = window.scrollY + 130;
    var currentId = buttons[0].dataset.anchor;
    buttons.forEach(function (button) {
      var heading = document.getElementById(button.dataset.anchor);
      if (heading && heading.offsetTop <= offset) currentId = button.dataset.anchor;
    });

    buttons.forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.anchor === currentId);
    });
  }

  function onScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(function () {
      scrollQueued = false;
      updateProgress();
      updateToc();
    });
  }

  function scrollToAnchor(id) {
    var heading = document.getElementById(id);
    if (!heading) return;
    var top = heading.getBoundingClientRect().top + window.scrollY - 86;
    window.scrollTo({ top: top, behavior: 'smooth' });
  }

  /* ---------- 编辑器逻辑 ---------- */
  function setEditorStatus(text, saving) {
    var node = $('writeStatus');
    if (!node) return;
    node.textContent = text;
    node.classList.toggle('is-saving', !!saving);
  }

  function updateEditorCounts() {
    var node = $('wordCount');
    if (!node || !editor.post) return;
    var metrics = wordCount(editor.post.content);
    node.textContent = metrics.chars + ' 字 · 约 ' + metrics.minutes + ' 分钟';
  }

  function editorHasContent() {
    var post = editor.post;
    return !!(trim(post.title) || trim(post.content) || trim(post.summary));
  }

  function persistEditor(silent) {
    if (!editor.post) return false;
    if (!editorHasContent()) {
      setEditorStatus('新文章', false);
      return false;
    }

    var post = editor.post;
    post.tags = splitTags(post.tagsText != null ? post.tagsText : post.tags.join(','));
    delete post.tagsText;

    var saved = clone(post);
    if (!trim(saved.title)) saved.title = '未命名文章';

    var index = -1;
    for (var i = 0; i < state.posts.length; i++) {
      if (state.posts[i].id === saved.id) { index = i; break; }
    }
    if (index === -1) state.posts.push(saved);
    else state.posts[index] = saved;

    var ok = saveState();
    editor.dirty = false;
    editor.savedAt = new Date();
    if (ok) setEditorStatus('已保存 · ' + fmtTime(editor.savedAt), false);
    if (!silent) updateSidebar();
    return ok;
  }

  function scheduleEditorSave() {
    editor.dirty = true;
    setEditorStatus('保存中…', true);
    clearTimeout(editor.timer);
    editor.timer = setTimeout(function () { persistEditor(true); }, 500);
  }

  function flushEditor() {
    clearTimeout(editor.timer);
    if (editor.post && editor.dirty) persistEditor(true);
    editor.post = null;
    editor.dirty = false;
  }

  function handleEditorInput(target) {
    if (!editor.post) return;
    if (target.id === 'edTitle') editor.post.title = target.value;
    else if (target.id === 'edDate') editor.post.date = target.value || todayISO();
    else if (target.id === 'edTags') editor.post.tagsText = target.value;
    else if (target.id === 'edSummary') editor.post.summary = target.value;
    else if (target.id === 'edContent') editor.post.content = target.value;
    else if (target.id === 'edPinned') editor.post.pinned = target.checked;
    else return;

    scheduleEditorSave();
    updateEditorCounts();
    if (target.id === 'edContent' && $('editorBox') && $('editorBox').classList.contains('is-preview')) {
      renderEditorPreview();
    }
  }

  function renderEditorPreview() {
    var box = $('editorBox');
    var preview = $('editorPreview');
    if (!box || !preview || !editor.post) return;
    preview.innerHTML = window.BlogMarkdown.render(editor.post.content).html ||
      '<p style="color:var(--muted);font-size:12px">还没有内容可预览。</p>';
  }

  function setEditorMode(mode) {
    var box = $('editorBox');
    if (!box) return;
    box.classList.toggle('is-preview', mode === 'preview');
    document.querySelectorAll('.md-tab button').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.view === mode);
    });
    if (mode === 'preview') renderEditorPreview();
  }

  function insertMarkdown(key) {
    var area = $('edContent');
    if (!area || !editor.post) return;

    var start = area.selectionStart;
    var end = area.selectionEnd;
    var value = area.value;
    var selected = value.slice(start, end);
    var before = '';
    var after = '';
    var placeholder = selected || '文字';

    if (key === 'h2') { before = '## '; after = ''; placeholder = selected || '标题'; }
    else if (key === 'bold') { before = '**'; after = '**'; }
    else if (key === 'italic') { before = '*'; after = '*'; }
    else if (key === 'quote') { before = '> '; after = ''; placeholder = selected || '引用内容'; }
    else if (key === 'list') { before = '- '; after = ''; placeholder = selected || '列表项'; }
    else if (key === 'ordered') { before = '1. '; after = ''; placeholder = selected || '列表项'; }
    else if (key === 'code') { before = '~~~\n'; after = '\n~~~'; placeholder = selected || 'code'; }
    else if (key === 'link') { before = '['; after = '](https://)'; placeholder = selected || '链接文字'; }
    else if (key === 'hr') { before = '\n---\n'; after = ''; placeholder = ''; }

    var next = value.slice(0, start) + before + placeholder + after + value.slice(end);
    area.value = next;
    var cursor = start + before.length + placeholder.length;
    area.setSelectionRange(cursor, cursor);
    area.focus();

    editor.post.content = next;
    scheduleEditorSave();
    updateEditorCounts();
    if ($('editorBox') && $('editorBox').classList.contains('is-preview')) renderEditorPreview();
  }

  function publishPost() {
    if (!editor.post) return;
    if (!trim(editor.post.title)) {
      notify('先给文章起个标题');
      var titleInput = $('edTitle');
      if (titleInput) titleInput.focus();
      return;
    }
    editor.post.draft = false;
    editor.dirty = true;
    if (!persistEditor(false)) return;
    var id = editor.post.id;
    editor.dirty = false;
    notify('文章已发布');
    location.hash = '#/p/' + encodeURIComponent(id);
  }

  function saveDraft() {
    if (!editor.post) return;
    if (!trim(editor.post.title)) editor.post.title = trim(editor.post.content) ? excerpt(editor.post.content, 24) : '未命名文章';
    editor.post.draft = true;
    editor.dirty = true;
    if (!persistEditor(false)) return;
    editor.dirty = false;
    notify('草稿已保存');
    location.hash = '#/manage';
  }

  function deleteCurrentPost() {
    if (!editor.post || !findPost(editor.post.id)) {
      location.hash = '#/manage';
      return;
    }
    if (!window.confirm('确定删除《' + (editor.post.title || '未命名文章') + '》吗？删除后无法恢复。')) return;
    state.posts = state.posts.filter(function (post) { return post.id !== editor.post.id; });
    saveState();
    editor.dirty = false;
    editor.post = null;
    notify('文章已删除');
    location.hash = '#/manage';
  }

  /* ---------- 设置 ---------- */
  function updateBioCount() {
    var bio = document.querySelector('[data-field="bio"]');
    var node = $('bioCount');
    if (bio && node) node.textContent = bio.value.length + ' / 300';
  }

  function fillSettings() {
    document.querySelectorAll('[data-field]').forEach(function (input) {
      input.value = state.profile[input.dataset.field] || '';
    });
    updateBioCount();
    renderSocialEditor();
    updateSwatches();
  }

  function renderSocialEditor() {
    var wrap = $('socialEditor');
    if (!wrap) return;

    if (!state.profile.socials.length) {
      wrap.innerHTML = '<p class="field__hint">还没有社交链接，点右上角「添加」增加一个。</p>';
      return;
    }

    wrap.innerHTML = state.profile.socials.map(function (social, index) {
      return '<div class="social-row" data-index="' + index + '">' +
        '<input class="input" type="text" maxlength="12" data-social="label" value="' + esc(social.label) + '" placeholder="平台">' +
        '<input class="input" type="text" maxlength="200" data-social="url" value="' + esc(social.url) + '" placeholder="https://">' +
        '<button class="social-row__remove" type="button" data-remove-social="' + index + '" aria-label="删除">' +
        '<svg class="icon"><use href="#i-close"></use></svg></button>' +
        '</div>';
    }).join('');
  }

  var settingsTimer = 0;

  function scheduleSettingsSave() {
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(function () {
      saveState();
      $('drawerNote').textContent = '已保存 · ' + fmtTime(new Date());
    }, 400);
  }

  function syncLock() {
    var locked = $('settings').classList.contains('is-open') || $('sidebar').classList.contains('is-open');
    document.body.classList.toggle('is-locked', locked);
  }

  function openSettings() {
    if ($('sidebar').classList.contains('is-open')) closeSidebar();
    fillSettings();
    $('settings').classList.add('is-open');
    $('settings').setAttribute('aria-hidden', 'false');
    $('scrim').classList.add('is-open');
    syncLock();
    setTimeout(function () {
      var first = $('settings').querySelector('[data-field="siteName"]');
      if (first) first.focus({ preventScroll: true });
    }, 300);
  }

  function closeSettings(silent) {
    var wasOpen = $('settings').classList.contains('is-open');
    $('settings').classList.remove('is-open');
    $('settings').setAttribute('aria-hidden', 'true');
    syncScrim();
    syncLock();
    if (!wasOpen) return;
    updateSidebar();
    if (!silent && route.name !== 'write') renderView();
  }

  function syncScrim() {
    var open = $('settings').classList.contains('is-open') || $('sidebar').classList.contains('is-open');
    $('scrim').classList.toggle('is-open', open);
  }

  function openSidebar() {
    $('sidebar').classList.add('is-open');
    $('btnMenu').setAttribute('aria-expanded', 'true');
    $('scrim').classList.add('is-open');
    syncLock();
  }

  function closeSidebar() {
    $('sidebar').classList.remove('is-open');
    $('btnMenu').setAttribute('aria-expanded', 'false');
    syncScrim();
    syncLock();
  }

  function closeOverlays() {
    closeSidebar();
    closeSettings(true);
  }

  /* ---------- 主题面板 ---------- */
  function updateSwatches() {
    document.querySelectorAll('.swatch').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.theme === ui.theme);
    });
  }

  function initSwatches() {
    var wrap = $('swatches');
    if (!wrap) return;
    wrap.innerHTML = Object.keys(THEMES).map(function (key) {
      var theme = THEMES[key];
      return '<button class="swatch" type="button" data-theme="' + key + '">' +
        '<span class="swatch__dot" style="background:linear-gradient(135deg,' + theme.a + ',' + theme.b + ')"></span>' +
        '<span>' + theme.label + '</span></button>';
    }).join('');
  }

  /* ---------- 头像 ---------- */
  function processAvatar(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { notify('请选择图片文件'); return; }
    if (file.size > 8 * 1024 * 1024) { notify('图片超过 8MB，请压缩后再上传'); return; }

    var reader = new FileReader();
    reader.onload = function (event) {
      var image = new Image();
      image.onload = function () {
        var side = Math.min(image.width, image.height);
        var size = 320;
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
        state.profile.avatar = canvas.toDataURL('image/jpeg', 0.9);
        updateSidebar();
        saveState();
        notify('头像已更新');
      };
      image.onerror = function () { notify('图片读取失败'); };
      image.src = String(event.target.result);
    };
    reader.onerror = function () { notify('图片读取失败'); };
    reader.readAsDataURL(file);
  }

  /* ---------- 导入导出 ---------- */
  function exportSeedFile() {
    var header = '/*!\n' +
      ' * 博客发布数据（由写作台导出）\n' +
      ' * 用法：替换 assets/js/posts.js，提交并推送到 GitHub 后，访客就能看到这份内容。\n' +
      ' * 导出时间：' + new Date().toLocaleString('zh-CN') + '\n' +
      ' */\n';
    var body = 'window.SEED_PROFILE = ' + JSON.stringify(state.profile, null, 2) + ';\n\n' +
      'window.SEED_POSTS = ' + JSON.stringify(state.posts, null, 2) + ';\n';
    var blob = new Blob([header + body], { type: 'text/javascript;charset=utf-8' });
    downloadBlob(blob, 'posts.js');
    notify('已导出 posts.js，替换 assets/js/posts.js 后上传即可更新公开内容');
  }

  function exportData() {
    var payload = {
      app: 'personal-blog',
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: state.profile,
      posts: state.posts
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, '博客备份-' + todayISO() + '.json');
    notify('已导出备份文件');
  }

  function importData(file) {
    if (!file) return;
    if (!window.confirm('导入会覆盖当前的文章与个人资料，确定继续吗？')) return;
    var reader = new FileReader();
    reader.onload = function (event) {
      try {
        var raw = JSON.parse(String(event.target.result));
        var data = raw && raw.profile && Array.isArray(raw.posts) ? raw : null;
        if (!data) throw new Error('bad format');
        state = normalizeState(data);
        saveState();
        updateSidebar();
        fillSettings();
        renderView();
        notify('备份已导入');
      } catch (err) {
        notify('导入失败：文件格式不正确');
      }
    };
    reader.readAsText(file);
  }

  function resetData() {
    if (!window.confirm('恢复示例内容？当前的文章和个人资料都会被覆盖，建议先导出备份。')) return;
    state = normalizeState({ profile: window.SEED_PROFILE, posts: window.SEED_POSTS });
    saveState();
    updateSidebar();
    fillSettings();
    renderView();
    notify('已恢复示例内容');
  }

  /* ---------- 事件 ---------- */
  function bind() {
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateProgress);
    window.addEventListener('beforeunload', flushEditor);

    if (media) {
      var onMedia = function () { if (ui.mode === 'auto') { applyUI(); } };
      if (media.addEventListener) media.addEventListener('change', onMedia);
      else if (media.addListener) media.addListener(onMedia);
    }

    $('btnMenu').addEventListener('click', openSidebar);
    $('sideClose').addEventListener('click', closeSidebar);
    $('scrim').addEventListener('click', function () {
      if ($('settings').classList.contains('is-open')) closeSettings();
      else closeSidebar();
    });

    $('btnSettings').addEventListener('click', openSettings);
    $('btnCloseSettings').addEventListener('click', function () { closeSettings(); });
    $('btnDone').addEventListener('click', function () { closeSettings(); });
    $('btnWrite').addEventListener('click', function () { location.hash = '#/write'; });

    document.querySelectorAll('.nav a').forEach(function (link) {
      link.addEventListener('click', function () { closeSidebar(); });
    });

    $('settingsAvatar').addEventListener('click', function () { $('avatarInput').click(); });

    $('themeSwitch').addEventListener('click', function (event) {
      var button = event.target.closest('[data-mode]');
      if (button) setMode(button.dataset.mode);
    });

    $('btnMobileTheme').addEventListener('click', function () {
      setMode(resolvedMode() === 'dark' ? 'light' : 'dark');
    });

    var avatarBtn = $('avatarBtn');
    if (avatarBtn) avatarBtn.addEventListener('click', openSettings);

    $('btnUploadAvatar').addEventListener('click', function () { $('avatarInput').click(); });
    $('btnClearAvatar').addEventListener('click', function () {
      if (!state.profile.avatar) { notify('当前没有头像'); return; }
      state.profile.avatar = '';
      updateSidebar();
      saveState();
      notify('已移除头像');
    });
    $('avatarInput').addEventListener('change', function (event) {
      processAvatar(event.target.files && event.target.files[0]);
      event.target.value = '';
    });

    $('settingsBody').addEventListener('input', function (event) {
      var field = event.target.closest('[data-field]');
      if (field) {
        state.profile[field.dataset.field] = field.value;
        updateSidebar();
        updateBioCount();
        scheduleSettingsSave();
        return;
      }

      var socialInput = event.target.closest('[data-social]');
      if (socialInput) {
        var row = socialInput.closest('[data-index]');
        var index = Number(row.dataset.index);
        if (state.profile.socials[index]) {
          state.profile.socials[index][socialInput.dataset.social] = socialInput.value;
          updateSidebar();
          scheduleSettingsSave();
        }
      }
    });

    $('btnAddSocial').addEventListener('click', function () {
      if (state.profile.socials.length >= MAX_SOCIALS) { notify('最多添加 ' + MAX_SOCIALS + ' 个社交链接'); return; }
      state.profile.socials.push({ label: '', url: '' });
      renderSocialEditor();
      updateSidebar();
      scheduleSettingsSave();
      var inputs = $('socialEditor').querySelectorAll('[data-social="label"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    $('socialEditor').addEventListener('click', function (event) {
      var button = event.target.closest('[data-remove-social]');
      if (!button) return;
      state.profile.socials.splice(Number(button.dataset.removeSocial), 1);
      renderSocialEditor();
      updateSidebar();
      scheduleSettingsSave();
    });

    $('swatches').addEventListener('click', function (event) {
      var button = event.target.closest('[data-theme]');
      if (!button) return;
      ui.theme = button.dataset.theme;
      saveUI();
      applyUI();
      updateSwatches();
    });

    $('btnExportSeed').addEventListener('click', exportSeedFile);
    $('btnExport').addEventListener('click', exportData);
    $('btnImport').addEventListener('click', function () { $('importInput').click(); });
    $('importInput').addEventListener('change', function (event) {
      importData(event.target.files && event.target.files[0]);
      event.target.value = '';
    });
    $('btnReset').addEventListener('click', resetData);

    /* 视图内的点击 */
    view.addEventListener('click', function (event) {
      var actionNode = event.target.closest('[data-action]');
      if (actionNode) {
        var action = actionNode.dataset.action;
        if (action === 'publish') { publishPost(); return; }
        if (action === 'draft') { saveDraft(); return; }
        if (action === 'delete') { deleteCurrentPost(); return; }
        if (action === 'copy-link') {
          copyText(location.href).then(function (ok) { notify(ok ? '文章链接已复制' : '复制失败'); });
          return;
        }
        if (action === 'to-top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      }

      var tool = event.target.closest('[data-md]');
      if (tool) { insertMarkdown(tool.dataset.md); return; }

      var mode = event.target.closest('[data-view]');
      if (mode) { setEditorMode(mode.dataset.view); return; }

      var anchor = event.target.closest('[data-anchor]');
      if (anchor) { event.preventDefault(); scrollToAnchor(anchor.dataset.anchor); return; }

      var codeCopy = event.target.closest('[data-copy-code]');
      if (codeCopy) {
        var figure = codeCopy.closest('.codeblock');
        var code = figure && figure.querySelector('code');
        if (code) {
          copyText(code.textContent).then(function (ok) {
            notify(ok ? '代码已复制' : '复制失败');
            if (ok) {
              codeCopy.textContent = '已复制';
              setTimeout(function () { codeCopy.textContent = '复制'; }, 1600);
            }
          });
        }
        return;
      }

      var chip = event.target.closest('[data-tag]');
      if (chip) {
        filter.tag = chip.dataset.tag || '';
        updateList();
        return;
      }

      if (event.target.closest('[data-clear-filter]')) {
        filter.tag = '';
        filter.q = '';
        var input = $('q');
        if (input) input.value = '';
        updateList();
        return;
      }

      var del = event.target.closest('[data-del]');
      if (del) {
        var post = findPost(del.dataset.del);
        if (!post) return;
        if (!window.confirm('确定删除《' + post.title + '》吗？删除后无法恢复。')) return;
        state.posts = state.posts.filter(function (item) { return item.id !== post.id; });
        saveState();
        renderView();
        notify('文章已删除');
      }
    });

    view.addEventListener('input', function (event) {
      if (route.name === 'home' && event.target.id === 'q') {
        filter.q = event.target.value;
        updateList();
        return;
      }
      if (route.name === 'write') handleEditorInput(event.target);
    });

    view.addEventListener('keydown', function (event) {
      if (route.name !== 'write') return;
      if (event.key === 'Tab' && event.target.id === 'edContent') {
        event.preventDefault();
        var area = event.target;
        var start = area.selectionStart;
        var end = area.selectionEnd;
        area.value = area.value.slice(0, start) + '  ' + area.value.slice(end);
        area.setSelectionRange(start + 2, start + 2);
        editor.post.content = area.value;
        scheduleEditorSave();
        updateEditorCounts();
      }
    });

    document.addEventListener('keydown', function (event) {
      var tag = (event.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || event.target.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && (event.key === 's' || event.key === 'S')) {
        if (route.name === 'write') {
          event.preventDefault();
          if (persistEditor(false)) notify('已保存');
        }
        return;
      }

      if (event.key === 'Escape') {
        if ($('settings').classList.contains('is-open')) closeSettings();
        else if ($('sidebar').classList.contains('is-open')) closeSidebar();
        return;
      }

      if (event.key === '/' && !typing && route.name === 'home') {
        event.preventDefault();
        var search = $('q');
        if (search) search.focus();
      }
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    applyUI();
    initSwatches();
    updateSwatches();
    bind();
    route = parseRoute();
    renderView();
    updateProgress();

    if (loaded.seeded) saveState();
    try { localStorage.setItem('blog.seed.v1', String(SEED_VERSION)); } catch (err) { /* 忽略 */ }

    if (!storageOK) {
      setTimeout(function () { notify('浏览器限制了本地存储：修改不会被保存，请先导出备份'); }, 900);
    } else if (loaded.seeded && !location.hash) {
      setTimeout(function () { notify('这是初始内容，点「设置」可以改成你自己的'); }, 1100);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
