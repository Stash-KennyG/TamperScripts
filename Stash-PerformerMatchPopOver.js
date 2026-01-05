// ==UserScript==
// @name         Stash - Performer Match Hover Overlay
// @namespace    kennyg.scripts.stash
// @description  Shows the potential matches of performers
// @version      0.7.0
// @icon         https://raw.githubusercontent.com/stashapp/stash/develop/ui/v2.5/public/favicon.png
// @match        https://localhost:9999/scenes/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const HOVER_DELAY_MS = 1000;
  const MAX_RESULTS = 12;
  const GRAPHQL_ENDPOINT = new URL('/graphql', window.location.origin).toString();

GM_addStyle(
  '.pm-overlay{' +
    'position:fixed;z-index:999999;width:760px;max-width:calc(100vw - 24px);max-height:70vh;overflow:auto;' +
    'background:#111;color:#eee;border:1px solid #333;border-radius:10px;' +
    'box-shadow:0 10px 30px rgba(0,0,0,0.5);padding:10px 12px;font:13px/1.35 system-ui;' +
  '}' +
  '.pm-title{font-weight:700;margin:0 0 4px 0;}' +
  '.pm-sub{color:#aaa;font-size:12px;margin:0 0 10px 0;}' +
  '.pm-toprow{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}' +
  '.pm-close{cursor:pointer;color:#bbb;padding:4px 8px;border-radius:8px;border:1px solid #333;background:#1a1a1a;}' +
  '.pm-close:hover{color:#fff;border-color:#444;}' +
  '.pm-loading{color:#bbb;font-size:12px;margin:6px 0;}' +
  '.pm-hint{color:#9aa0a6;font-size:12px;margin-top:10px;}' +
  '.pm-error{color:#ff6b6b;font-size:12px;white-space:pre-wrap;margin-top:8px;}' +

  // Layout only. Let Stash provide card styling.
  '.pm-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:start;}' +
  '@media (max-width: 900px){.pm-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}' +
  '@media (max-width: 620px){.pm-grid{grid-template-columns:repeat(1,minmax(0,1fr));}}' +
  '.pm-grid .card-popovers{width:100%;}' +
  '.pm-grid .card-popovers .btn{display:inline-flex;align-items:center;gap:6px;}' +
  '.pm-grid .card-popovers svg{width:1em;height:1em;}' +
  '.pm-grid hr{margin:8px 0;border-color:#2a2a2a;}' +
  // Fit Stash cards nicely inside overlay
  '.pm-grid .performer-card{width:100% !important; margin:0 !important;}' +
  '.pm-grid .performer-card-image{height:400px;object-fit:cover;}' +
  '.pm-grid .card-controls{display:none;}' // no selection checkbox in overlay
);



  let timer = null;
  let overlay = null;
  let lastKey = '';

  function removeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  function getSelectedPerformer(selectRoot) {
    const labelEl = selectRoot.querySelector('.react-select__single-value .performer-select-value');
    if (!labelEl) return null;

    const disEl = labelEl.querySelector('.performer-disambiguation');
    const dis = disEl ? disEl.textContent.trim() : '';

    const nameNode = labelEl.childNodes && labelEl.childNodes.length ? labelEl.childNodes[0] : null;
    const rawName = nameNode && nameNode.textContent ? nameNode.textContent.trim() : labelEl.textContent.trim();

    const cleanName = dis ? rawName.replace(dis, '').trim() : rawName;
    return { name: cleanName, disambig: dis };
  }

  // Always derive the query from the anchor text on the same row as the select,
  // i.e. the proposed match coming from StashBox, rather than the dropdown value.
  function getRowSourcePerformerName(selectRoot) {
    if (!selectRoot || !selectRoot.closest) return null;

    // Nearest "row-like" container for this tagger line
    const row =
      selectRoot.closest('.search-item') ||
      selectRoot.closest('tr') ||
      selectRoot.closest('.row') ||
      selectRoot.closest('.tagger-row') ||
      selectRoot.closest('[role="row"]');

    if (!row) return null;

    // Take the first non-empty anchor text in the row that is NOT part of the
    // select control or its button group (e.g. not the "Link to existing" button).
    const anchors = Array.from(row.querySelectorAll('a'));
    for (const a of anchors) {
      if (!a.textContent) continue;
      if (a.closest('.react-select')) continue;
      if (a.closest('.btn-group')) continue;
      const text = a.textContent.trim();
      if (text) return text;
    }

    return null;
  }

  //  use the row anchor text for matching.
  function buildQueryString(selectRoot) {
    const fromRow = getRowSourcePerformerName(selectRoot);
    return (fromRow || '').trim();
  }

  function positionOverlay(anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const margin = 10;

    const w = overlay.offsetWidth || 640;
    const h = overlay.offsetHeight || 240;

    let left = rect.left;
    let top = rect.bottom + margin;

    left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
    top  = Math.max(margin, Math.min(top, window.innerHeight - h - margin));

    overlay.style.left = left + 'px';
    overlay.style.top  = top + 'px';
  }

  function createOverlay(anchorEl, titleText, subtitleText) {
    removeOverlay();

    overlay = document.createElement('div');
    overlay.className = 'pm-overlay';

    const topRow = document.createElement('div');
    topRow.className = 'pm-toprow';

    const left = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'pm-title';
    title.textContent = titleText;

    const sub = document.createElement('div');
    sub.className = 'pm-sub';
    sub.textContent = subtitleText;

    left.appendChild(title);
    left.appendChild(sub);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'pm-close';
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', removeOverlay);

    topRow.appendChild(left);
    topRow.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'pm-body';

    const loading = document.createElement('div');
    loading.className = 'pm-loading';
    loading.textContent = 'Loading matches…';

    body.appendChild(loading);

    overlay.appendChild(topRow);
    overlay.appendChild(body);

    document.body.appendChild(overlay);
    positionOverlay(anchorEl);

    overlay.addEventListener('mouseleave', function () {
      setTimeout(function () {
        if (!overlay) return;
        const stillHoveringOverlay = overlay.matches(':hover');
        const stillHoveringAnchor = anchorEl.matches(':hover') || !!document.querySelector('.react-select.performer-select:hover');
        if (!stillHoveringOverlay && !stillHoveringAnchor) removeOverlay();
      }, 150);
    });

    return body;
  }

  async function gqlFetch(query, variables) {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      credentials: 'same-origin'
    });

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(text); }

    if (json.errors && json.errors.length) {
      throw new Error(json.errors.map(e => e.message).join('\n'));
    }
    return json.data;
  }

  function renderError(bodyEl, err, q) {
    bodyEl.textContent = '';

    const e = document.createElement('div');
    e.className = 'pm-error';
    e.textContent = 'GraphQL lookup failed:\n' + (err && err.message ? err.message : String(err));
    bodyEl.appendChild(e);

    const hint = document.createElement('div');
    hint.className = 'pm-hint';

    const url = new URL('/performers', window.location.origin);
    url.searchParams.set('query', q);

    const a = document.createElement('a');
    a.className = 'pm-name';
    a.href = url.toString();
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Open performer search';

    hint.appendChild(a);
    bodyEl.appendChild(hint);
  }
    function safeStr(v) {
  return (v === null || v === undefined) ? '' : String(v);
}

  function hostFromEndpoint(endpoint) {
  try { return new URL(endpoint).host.replace(/^www\./, ''); }
  catch { return null; }
}
    function addLine(linesEl, key, value) {
  const row = document.createElement('div');
  row.className = 'pm-line';

  const k = document.createElement('div');
  k.className = 'pm-k';
  k.textContent = key;

  const v = document.createElement('div');
  v.className = 'pm-v';
  if (!value) {
    v.classList.add('pm-muted');
    v.textContent = '';
  } else {
    v.textContent = value;
  }

  row.appendChild(k);
  row.appendChild(v);
  linesEl.appendChild(row);
}

function buildSources(p) {
  if (!Array.isArray(p.stash_ids) || !p.stash_ids.length) return '';
  const src = p.stash_ids.map(s => hostFromEndpoint(s.endpoint)).filter(Boolean);
  // uniq while preserving order
  const seen = new Set();
  const uniq = src.filter(x => (seen.has(x) ? false : (seen.add(x), true)));
  return uniq.slice(0, 4).join(', ');
}

function buildAliases(p) {
  if (!Array.isArray(p.alias_list) || !p.alias_list.length) return '';
  return p.alias_list.slice(0, 4).join(', ');
}

  function buildDisambiguation(p) {
    if (p.disambiguation && String(p.disambiguation).trim()) return String(p.disambiguation).trim();

    const bits = [];
    if (p.birthdate) bits.push('DOB ' + p.birthdate);
    if (p.country) bits.push(p.country);

    if (Array.isArray(p.alias_list) && p.alias_list.length) {
      bits.push('aka ' + p.alias_list.slice(0, 3).join(', '));
    }

    if (Array.isArray(p.stash_ids) && p.stash_ids.length) {
      const src = p.stash_ids.map(s => hostFromEndpoint(s.endpoint)).filter(Boolean);
      if (src.length) bits.push(src.slice(0, 3).join(', '));
    }

    return bits.join(' · ');
  }

    function svgEl(pathD, viewBox = '0 0 512 512') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', '1em');
  svg.setAttribute('height', '1em');
  svg.classList.add('fa-icon');

  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('fill', 'currentColor');
  p.setAttribute('d', pathD);
  svg.appendChild(p);
  return svg;
}
    function genderSvgEl(gender) {
  // Stash uses FontAwesome: mars (male), venus (female), transgender
  // We'll inline the same paths and attributes so the markup matches Stash.
  const icons = {
    MALE: {
      // fa-mars
      
      d: 'M372 0H264c-6.5 0-12.3 3.9-14.8 9.9s-1.1 12.9 3.5 17.4l31 31-40.6 40.6C219.9 85 197.4 80 174 80 96.5 80 32 144.5 32 222s64.5 142 142 142 142-64.5 142-142c0-23.4-5-45.9-14.9-66.1L343.7 115l31 31c4.6 4.6 11.5 5.9 17.4 3.5S400 140.3 400 133.8V24c0-13.3-10.7-24-24-24zM174 144c43.1 0 78 34.9 78 78s-34.9 78-78 78-78-34.9-78-78 34.9-78 78-78z',
      title: 'Male',
      dataIcon: 'mars',
      faClass: 'fa-mars'
    },
    FEMALE: {
      // fa-venus
      d: 'M80 176a112 112 0 1 1 224 0A112 112 0 1 1 80 176zM224 349.1c81.9-15 144-86.8 144-173.1C368 78.8 289.2 0 192 0S16 78.8 16 176c0 86.3 62.1 158.1 144 173.1l0 34.9-32 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l32 0 0 32c0 17.7 14.3 32 32 32s32-14.3 32-32l0-32 32 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-32 0 0-34.9z',
      title: 'Female',
      dataIcon: 'venus',
      faClass: 'fa-venus'
    },
    TRANSGENDER: {
      // fa-transgender
      d: 'M112 0c6.5 0 12.3 3.9 14.8 9.9s1.1 12.9-3.5 17.4l-31 31L112 78.1l7-7c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-7 7 15.2 15.2C187.7 107.6 220.5 96 256 96s68.3 11.6 94.9 31.2l68.8-68.8-31-31c-4.6-4.6-5.9-11.5-3.5-17.4S403.5 0 410 0l96 0c8.8 0 16 7.2 16 16l0 96c0 6.5-3.9 12.3-9.9 14.8s-12.9 1.1-17.4-3.5l-31-31-68.8 68.8C404.4 187.7 416 220.5 416 256c0 80.2-59 146.6-136 158.2l0 17.8 16 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-16 0 0 8c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-8-16 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l16 0 0-17.8C155 402.6 96 336.2 96 256c0-35.5 11.6-68.3 31.2-94.9L112 145.9l-7 7c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l7-7L58.3 92.3l-31 31c-4.6 4.6-11.5 5.9-17.4 3.5S0 118.5 0 112L0 16C0 7.2 7.2 0 16 0l96 0zM352 256a96 96 0 1 0 -192 0 96 96 0 1 0 192 0z',
      title: 'Transgender Female',
      dataIcon: 'transgender',
      faClass: 'fa-transgender'
    }
  };

  const key = gender === 'MALE' ? 'MALE' : gender === 'FEMALE' ? 'FEMALE' : gender ? 'TRANSGENDER' : null;
  if (!key || !icons[key]) return null;

  const { viewBox, d, title, dataIcon, faClass } = icons[key];

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'false');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('role', 'img');
  svg.setAttribute('data-prefix', 'fas');
  if (dataIcon) svg.setAttribute('data-icon', dataIcon);
  svg.setAttribute('viewBox', '0 0 384 512');
  svg.classList.add('svg-inline--fa', faClass || 'fa-icon', 'gender-icon'); // gender-icon is what Stash uses

  // Match Stash's accessible title pattern: aria-labelledby + <title id="...">
  const titleId = 'svg-inline--fa-title-' + Math.random().toString(36).slice(2, 11);
  svg.setAttribute('aria-labelledby', titleId);

  const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  titleEl.setAttribute('id', titleId);
  titleEl.textContent = title;
  svg.appendChild(titleEl);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', d);
  svg.appendChild(path);

  return svg;
}


const ICONS = {
  playCircle: 'M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm115.7 256.2-144 88c-7.4 4.5-16.7 4.7-24.3.5-7.6-4.2-12.3-12.3-12.3-20.9V160c0-8.7 4.7-16.7 12.3-20.9 7.6-4.2 16.9-4 24.3.5l144 88c7.1 4.4 11.5 12.1 11.5 20.5s-4.4 16.1-11.5 20.5z',
  film: 'M0 96C0 60.7 28.7 32 64 32h384c35.3 0 64 28.7 64 64v320c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96zm64 0c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 16 16h32c8.8 0 16-7.2 16-16v-32c0-8.8-7.2-16-16-16H64zm352 0c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 16 16h32c8.8 0 16-7.2 16-16v-32c0-8.8-7.2-16-16-16h-32z',
  tag: 'M0 80V229.5c0 17 6.7 33.3 18.7 45.3l176 176c25 25 65.5 25 90.5 0L418.7 317.3c25-25 25-65.5 0-90.5l-176-176C230.7 38.7 214.4 32 197.5 32H48C21.5 32 0 53.5 0 80zm112 32a32 32 0 1 1 0 64 32 32 0 1 1 0-64z',
  oCount: 'M22.855.758L7.875 7.024l12.537 9.733c2.633 2.224 6.377 2.937 9.77 1.518c4.826-2.018 7.096-7.576 5.072-12.413C33.232 1.024 27.68-1.261 22.855.758zm-9.962 17.924L2.05 10.284L.137 23.529a7.993 7.993 0 0 0 2.958 7.803a8.001 8.001 0 0 0 9.798-12.65zm15.339 7.015l-8.156-4.69l-.033 9.223c-.088 2 .904 3.98 2.75 5.041a5.462 5.462 0 0 0 7.479-2.051c1.499-2.644.589-6.013-2.04-7.523z'
};

    function buildCardPopovers(p) {
  const wrap = document.createElement('div');
  wrap.setAttribute('role', 'group');
  wrap.className = 'card-popovers btn-group';

  function addLinkButton({ href, icon, count, className }) {
    const a = document.createElement('a');
    a.className = className;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'minimal btn btn-primary';

    // icon
    if (icon === 'oCount') {
      const svg = svgEl(ICONS.oCount, '0 0 36 36');
      btn.appendChild(svg);
    } else {
      btn.appendChild(svgEl(ICONS[icon]));
    }

    const s = document.createElement('span');
    s.textContent = String(count);
    btn.appendChild(s);

    a.appendChild(btn);
    wrap.appendChild(a);
  }

  function addPlainButton({ icon, count, className }) {
    const outer = document.createElement('div');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'minimal btn btn-primary ' + (className || '');
    btn.appendChild(svgEl(ICONS[icon]));
    const s = document.createElement('span');
    s.textContent = String(count);
    btn.appendChild(s);
    outer.appendChild(btn);
    wrap.appendChild(outer);
  }

  const performerUrl = new URL('/performers/' + p.id, window.location.origin).toString();

  if (p.scene_count) {
    addLinkButton({
      href: performerUrl, // safest default; still matches native styling
      icon: 'playCircle',
      count: p.scene_count,
      className: 'scene-count'
    });
  }

  if (p.group_count) {
    addLinkButton({
      href: performerUrl,
      icon: 'film',
      count: p.group_count,
      className: 'group-count'
    });
  }

  const tagCount = Array.isArray(p.tags) ? p.tags.length : 0;
  if (tagCount) {
    addPlainButton({
      icon: 'tag',
      count: tagCount,
      className: 'tag-count'
    });
  }

  if (p.o_counter) {
    const grp = document.createElement('div');
    grp.setAttribute('role', 'group');
    grp.className = 'count-button increment-only btn-group';

    const btnIcon = document.createElement('button');
    btnIcon.type = 'button';
    btnIcon.className = 'minimal count-icon btn btn-secondary';
    btnIcon.title = 'O Count';
    btnIcon.appendChild(svgEl(ICONS.oCount, '0 0 36 36'));

    const btnVal = document.createElement('button');
    btnVal.type = 'button';
    btnVal.className = 'minimal count-value btn btn-secondary';
    const span = document.createElement('span');
    span.textContent = String(p.o_counter);
    btnVal.appendChild(span);

    grp.appendChild(btnIcon);
    grp.appendChild(btnVal);
    wrap.appendChild(grp);
  }

  return wrap.childNodes.length ? wrap : null;
}


 function renderResults(bodyEl, q, performers) {
  bodyEl.textContent = '';

  if (!performers || !performers.length) {
    const none = document.createElement('div');
    none.className = 'pm-error';
    none.textContent = 'No matches returned.';
    bodyEl.appendChild(none);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'pm-grid';
  bodyEl.appendChild(grid);

  performers.forEach((p) => {
    grid.appendChild(buildStashPerformerCard(p));
  });

  const hint = document.createElement('div');
  hint.className = 'pm-hint';
  hint.textContent = 'Middle-click any performer card to open in a new tab. Query: ' + q;
  bodyEl.appendChild(hint);
}

function buildStashPerformerCard(p) {
  const perfUrl = new URL('/performers/' + p.id, window.location.origin).toString();

  // Outer card container (same classes as Stash)
  const card = document.createElement('div');
  card.className = 'performer-card zoom-1 grid-card card';

  // Thumbnail section
  const thumb = document.createElement('div');
  thumb.className = 'thumbnail-section';

  const aImg = document.createElement('a');
  aImg.href = perfUrl;
    aImg.target = '_blank';
aImg.rel = 'noopener noreferrer';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.className = 'performer-card-image';
  img.alt = p.name || '';
  img.src = p.image_path || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  aImg.appendChild(img);

  thumb.appendChild(aImg);

  // Country flag link if present (uses stash classes; relies on stash CSS being present)
  if (p.country) {
    const aCountry = document.createElement('a');
    aCountry.href = new URL('/performers', window.location.origin).toString(); // safe fallback
    // If you want, you can build the real filter URL later. This keeps it simple.
    const flag = document.createElement('span');
    flag.className = 'performer-card__country-flag fi fi-' + String(p.country).toLowerCase();
    const ctry = document.createElement('span');
    ctry.className = 'performer-card__country-string';
    ctry.textContent = p.country;
    aCountry.appendChild(flag);
    aCountry.appendChild(ctry);
    thumb.appendChild(aCountry);
  }

  // Card section (title + age)
  const section = document.createElement('div');
  section.className = 'card-section';

  const aTitle = document.createElement('a');
  aTitle.href = perfUrl;
    aTitle.target = '_blank';
aTitle.rel = 'noopener noreferrer';

  const h5 = document.createElement('h5');
  h5.className = 'card-section-title flex-aligned';

   const gIcon = genderSvgEl(p.gender);
  if (gIcon) h5.appendChild(gIcon);

  const truncated = document.createElement('div');
  truncated.className = 'TruncatedText';
  truncated.style.webkitLineClamp = '2';

  const inner = document.createElement('div');
  const nameWrap = document.createElement('span');
  nameWrap.className = 'performer-name';
  nameWrap.textContent = p.name || ('Performer ' + p.id);
  inner.appendChild(nameWrap);

  if (p.disambiguation && String(p.disambiguation).trim()) {
    const dis = document.createElement('span');
    dis.className = 'performer-disambiguation';
    dis.textContent = ' (' + String(p.disambiguation).trim() + ')';
    inner.appendChild(dis);
  }

  truncated.appendChild(inner);
  h5.appendChild(truncated);
  aTitle.appendChild(h5);
  section.appendChild(aTitle);

  // Age line: Stash computes age from birthdate. We can approximate without moment libs.
  const ageText = computeAgeText(p.birthdate);
  if (ageText) {
    const age = document.createElement('div');
    age.className = 'performer-card__age';
    age.textContent = ageText;
    section.appendChild(age);
  }

  // Compose card
  card.appendChild(thumb);
  card.appendChild(section);
      // Popovers row (counts)
  const pop = buildCardPopovers(p);
  if (pop) {
    const hr = document.createElement('hr');
    card.appendChild(hr);
    card.appendChild(pop);
  }

  // Middle-click helper: normal <a> already works, but ensure card itself opens on middle click
  //card.addEventListener('auxclick', (ev) => {
  //  if (ev.button === 1) {
  //    window.open(perfUrl, '_blank', 'noopener,noreferrer');
  //  }
  //});

  return card;
}

function computeAgeText(birthdate) {
  if (!birthdate) return '';
  const s = String(birthdate).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const dob = new Date(y, mo, d);
  if (Number.isNaN(dob.getTime())) return '';

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const hasHadBirthday =
    (now.getMonth() > dob.getMonth()) ||
    (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hasHadBirthday) age--;

  if (age <= 0 || age > 120) return ''; // avoid weird data
  return age + ' years old';
}


  async function fetchMatches(q) {
    const query = `
    query FindPerformersForHover($q: String!, $page: Int!, $per_page: Int!) {
      findPerformers(
        performer_filter: { name: { value: $q, modifier: INCLUDES } }
        filter: { page: $page, per_page: $per_page }
      ) {
        performers {
          id
          name
          disambiguation
          gender
          birthdate
          country
          alias_list
          favorite
          image_path
          scene_count
          image_count
          gallery_count
          group_count
          performer_count
          o_counter
          tags { id name }
          stash_ids { endpoint stash_id updated_at }
          rating100
        }
      }
    }
  `;


    const data = await gqlFetch(query, { q, page: 1, per_page: MAX_RESULTS });
    const list = data && data.findPerformers && data.findPerformers.performers;
    return Array.isArray(list) ? list : [];
  }

  function onMouseOver(e) {
    const selectRoot = e.target && e.target.closest ? e.target.closest('.react-select.performer-select') : null;
    if (!selectRoot) return;

    const sel = getSelectedPerformer(selectRoot);
    if (!sel || !sel.name) return;

    const q = buildQueryString(selectRoot);
    if (!q) return;

    const key = q;

    if (overlay && key === lastKey) return;

    if (timer) clearTimeout(timer);
    timer = setTimeout(async function () {
      if (!selectRoot.matches(':hover')) return;

      lastKey = key;

      // Display subtitle uses disambiguation from the dropdown (stashdb-side)
      const subtitle = sel.name + (sel.disambig ? (' ' + sel.disambig) : '');
      const bodyEl = createOverlay(selectRoot, 'Performer match', subtitle);

      try {
        const performers = await fetchMatches(q);
        renderResults(bodyEl, q, performers);
      } catch (err) {
        renderError(bodyEl, err, q);
      }
    }, HOVER_DELAY_MS);
  }

  function onMouseOut(e) {
    const selectRoot = e.target && e.target.closest ? e.target.closest('.react-select.performer-select') : null;
    if (!selectRoot) return;

    if (timer) clearTimeout(timer);
    timer = null;

    setTimeout(function () {
      if (!overlay) return;
      const stillHoveringOverlay = overlay.matches(':hover');
      const anySelectHover = document.querySelector('.react-select.performer-select:hover');
      if (!stillHoveringOverlay && !anySelectHover) removeOverlay();
    }, 150);
  }

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') removeOverlay();
  });
})();