// js/feed.js
// Loads published articles from Firestore and updates the homepage UI
// Does NOT modify any CSS or layout — only innerHTML of existing elements

(function () {
  // Wait for SAU.firebase to be ready
  function waitForFirebase(cb, tries = 0) {
    if (window.SAU && window.SAU.firebase && window.SAU.firebase.db) return cb(window.SAU.firebase.db);
    if (tries > 40) return console.warn('[SAU Feed] Firebase not available');
    setTimeout(() => waitForFirebase(cb, tries + 1), 100);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function timeAgo(date) {
    if (!date) return '';
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60)   return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' hr ago';
    if (diff < 604800) return Math.floor(diff / 86400) + ' days ago';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function readTime(body) {
    const words = (body || '').split(/\s+/).length;
    return Math.max(1, Math.round(words / 200)) + ' min';
  }

  function heatLabel(views) {
    if (views > 500) return '🔥🔥🔥 Hot';
    if (views > 200) return '🔥🔥 Trending';
    if (views > 50)  return '🔥 Rising';
    return '🔥 Popular';
  }

  function catClass(category) {
    const map = {
      'Campus': 'c-campus', 'Bangladesh': 'c-sara', 'Sara Bangladesh': 'c-sara',
      'Satire': 'c-satire', 'Opinion': 'c-opinion', 'Tech': 'c-tech',
      'Sports': 'c-sports', 'Culture': 'c-culture', 'Feature': 'c-feature',
    };
    return map[category] || 'c-campus';
  }

  function coverImg(url, alt, cls = '') {
    if (!url) return '';
    return `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" class="${cls}" style="width:100%;height:100%;object-fit:cover" />`;
  }

  function articleUrl(article) {
    return `article.html?id=${article.id}`;
  }

  // ── Render functions ──────────────────────────────────────────────────────────

  function renderHero(articles) {
    if (!articles.length) return;

    const lead = articles[0];
    const sides = articles.slice(1, 4);

    // ── Hero Left (Lead article) ──
    const heroLeft = document.querySelector('.hero-left');
    if (heroLeft) {
      const rt = readTime(lead.body);
      const ago = lead.createdAt?.toDate ? timeAgo(lead.createdAt.toDate()) : '';
      heroLeft.innerHTML = `
        <article class="lead">
          <a href="${articleUrl(lead)}" tabindex="-1" aria-hidden="true">
            <div class="cover">
              ${lead.coverImage
                ? `<img src="${esc(lead.coverImage)}" alt="${esc(lead.title)}" loading="eager" />`
                : `<div style="background:var(--bg-2);width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted-2);font-size:40px">📰</div>`}
            </div>
          </a>
          <div class="hero-eyebrow">
            <a href="#" class="cat-pill ${catClass(lead.category)}">${esc(lead.category || 'Campus')}</a>
            <span class="hero-badge">Top Story</span>
          </div>
          <h2><a href="${articleUrl(lead)}">${esc(lead.title)}</a></h2>
          ${lead.excerpt ? `<p class="dek">${esc(lead.excerpt)}</p>` : ''}
          <div class="author-card" style="max-width:400px">
            <div class="author-avatar">${(lead.authorName || 'A')[0].toUpperCase()}</div>
            <div class="author-info">
              <div class="author-name">${esc(lead.authorName || 'SAU News')}</div>
              <div class="author-role">${esc(lead.category || 'Reporter')}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap">
            <span class="read-time">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              ${rt}
            </span>
            ${ago ? `<span class="updated-time"><span class="dot">·</span>Updated <time>${ago}</time></span>` : ''}
          </div>
          ${lead.tags && lead.tags.length ? `<div class="tag-list">${lead.tags.map(t => `<a href="#" class="tag">${esc(t)}</a>`).join('')}</div>` : ''}
          <div class="article-actions" style="margin-top:14px">
            <button class="love-btn" onclick="toggleLove(this,event)" aria-label="Love this story" aria-pressed="false" data-base-count="${lead.loves || 0}">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 10-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              <span class="lv-count">${lead.loves || 0}</span>
            </button>
            <button class="bookmark-btn" onclick="toggleBookmark(this)" aria-label="Bookmark this story">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
              Bookmark
            </button>
          </div>
        </article>`;
    }

    // ── Hero Right (Side articles) ──
    const heroRight = document.querySelector('.hero-right .side-list');
    if (heroRight && sides.length) {
      heroRight.innerHTML = sides.map(a => {
        const ago = a.createdAt?.toDate ? timeAgo(a.createdAt.toDate()) : '';
        return `<article class="side-article">
          <a href="${articleUrl(a)}" tabindex="-1" aria-hidden="true">
            <div class="cover">
              ${a.coverImage
                ? `<img src="${esc(a.coverImage)}" alt="${esc(a.title)}" loading="lazy" />`
                : `<div style="background:var(--bg-2);width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted-2)">📰</div>`}
            </div>
          </a>
          <div>
            <a href="#" class="kicker-tag ${catClass(a.category)}">${esc(a.category || 'Campus')}</a>
            <h3><a href="${articleUrl(a)}">${esc(a.title)}</a></h3>
            <div class="article-meta-row">
              <span class="read-time" style="font-size:11px">${readTime(a.body)}</span>
              ${ago ? `<span class="updated-time"><span class="dot">·</span>${ago}</span>` : ''}
            </div>
          </div>
        </article>`;
      }).join('');
    }
  }

  function renderBreaking(articles) {
    const ticker = document.getElementById('tickerTrack');
    if (!ticker || !articles.length) return;
    // Duplicate for seamless loop
    const items = [...articles, ...articles];
    ticker.innerHTML = items.map(a =>
      `<span class="ticker-item"><a href="${articleUrl(a)}" style="color:inherit;text-decoration:none">${esc(a.title)}</a></span>`
    ).join('');
  }

  function renderTrending(articles) {
    const el = document.querySelector('.trending-items');
    if (!el || !articles.length) return;
    el.innerHTML = articles.slice(0, 6).map((a, i) => `
      <a href="${articleUrl(a)}" class="trending-item">
        <div class="trending-num">${String(i + 1).padStart(2, '0')}</div>
        <div class="trending-info">
          <div class="trending-text">${esc(a.title)}</div>
          <div class="trending-cat">${esc(a.category || 'Campus')} · ${readTime(a.body)}</div>
        </div>
      </a>`).join('');
  }

  function renderPopularToday(articles) {
    const el = document.querySelector('.pt-list');
    if (!el || !articles.length) return;
    el.innerHTML = articles.slice(0, 5).map((a, i) => `
      <li class="pt-item" onclick="location.href='${articleUrl(a)}'" style="cursor:pointer">
        <div class="pt-num">${String(i + 1).padStart(2, '0')}</div>
        <div>
          <div class="pt-title"><a href="${articleUrl(a)}" style="color:inherit">${esc(a.title)}</a></div>
          <div class="pt-meta">${esc(a.category || 'Campus')} · ${readTime(a.body)}</div>
          <div class="pt-heat">${heatLabel(a.views || 0)}</div>
        </div>
      </li>`).join('');
  }

  function renderEditorsPick(articles) {
    const el = document.querySelector('.ep-list');
    if (!el || !articles.length) return;
    el.innerHTML = articles.slice(0, 3).map(a => {
      const ago = a.createdAt?.toDate ? timeAgo(a.createdAt.toDate()) : '';
      return `<li class="ep-item">
        <a href="${articleUrl(a)}" tabindex="-1" aria-hidden="true">
          <div class="cover">
            ${a.coverImage
              ? `<img src="${esc(a.coverImage)}" alt="${esc(a.title)}" loading="lazy" />`
              : `<div style="background:var(--bg-2);width:100%;height:100%"></div>`}
          </div>
        </a>
        <div class="ep-item-body">
          <div class="ep-item-meta">
            <a href="#" class="cat-pill ${catClass(a.category)}">${esc(a.category || 'Campus')}</a>
            <span class="read-time"><svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>${readTime(a.body)}</span>
          </div>
          <h3><a href="${articleUrl(a)}">${esc(a.title)}</a></h3>
          <div class="article-meta-row">
            <span class="author-row" style="margin-top:0">
              <span class="mini-avatar">${(a.authorName || 'A')[0].toUpperCase()}</span>
              <span class="mini-name">${esc(a.authorName || 'SAU News')}</span>
            </span>
            ${ago ? `<span class="updated-time"><span class="dot">·</span>${ago}</span>` : ''}
          </div>
        </div>
      </li>`;
    }).join('');
  }
  function activateCoverImages() {
    document.querySelectorAll(".cover img").forEach(function(img) {
      var cover = img.closest(".cover");
      if (!cover) return;
      if (img.complete) { cover.classList.add("img-loaded"); }
      else {
        img.addEventListener("load", function() { cover.classList.add("img-loaded"); });
        img.addEventListener("error", function() { cover.classList.add("img-loaded"); });
      }
    });
  }


  // ── Main loader ───────────────────────────────────────────────────────────────
  waitForFirebase(async function(db) {
    try {
      const snap = await db.collection('articles')
        .where('status', '==', 'published')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      if (snap.empty) {
        console.log('[SAU Feed] No published articles yet.');
        return;
      }

      const articles = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Sort by views for popular
      const byViews = [...articles].sort((a, b) => (b.views || 0) - (a.views || 0));

      renderBreaking(articles);
      renderHero(articles);
      renderTrending(articles);
      renderPopularToday(byViews);
      renderEditorsPick(articles.slice(4));
      setTimeout(activateCoverImages, 50);

      console.log(`[SAU Feed] Loaded ${articles.length} articles ✓`);
    } catch (e) {
      console.error('[SAU Feed] Error:', e.message);
    }
  });

})();
