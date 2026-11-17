/**
 * Inquiry Work Gallery, the signed-in app. One page, screens picked by the address after "#".
 * No framework and no build step. Each screen makes at most one API call, and what it loads is kept for the visit.
 */

// ---------- Small helpers ----------
/** Makes an element. Text always goes in as text, never as HTML. */
function el(tag, attrs = {}, ...children) {
  const node = tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'rect' ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.setAttribute('class', v);
    else if (k in node && typeof v === 'boolean') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}
const icon = (paths, size = 18) => {
  const svg = el('svg', { 'aria-hidden': 'true', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  svg.append(...paths);
  return svg;
};
const searchIcon = () => icon([el('circle', { cx: 11, cy: 11, r: 7 }), el('path', { d: 'M21 21l-4.3-4.3' })]);
const backIcon = () => icon([el('path', { d: 'M15 18l-6-6 6-6' })]);
const cameraIcon = () => icon([el('rect', { x: 3, y: 6, width: 18, height: 14, rx: 2 }), el('circle', { cx: 12, cy: 13, r: 3.5 }), el('path', { d: 'M8 6l1.5-2h5L16 6' })], 22);
const STAR = 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z';

async function api(path, options) {
  const res = await fetch(path, options && { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(options) });
  if (res.status === 401) { location.href = '/signin.html'; throw new Error('Sign in first'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}
const shortDate = (iso) => (iso ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso)) : '');
const errorBox = (message) => el('p', { class: 'error', role: 'alert' }, message);

// ---------- What is kept for the visit ----------
const root = document.getElementById('app');
const kept = { home: null, gallery: null, districts: new Map(), works: new Map(), cameFrom: { label: 'Gallery', hash: '#/gallery' } };
const home = () => (kept.home ??= api('/api/home').catch((e) => { kept.home = null; throw e; }));
const remember = (works) => { works.forEach((w) => kept.works.set(w.id, w)); return works; };

// Favorites. Until the favorites table exists in Airtable the server answers `favorites: null`, and the stars
// are kept in this browser only (they do not follow the person to another phone).
const favorites = {
  set: new Set(), server: false, key: '',
  load(h) {
    this.server = Array.isArray(h.favorites);
    this.key = `iwg:favorites:${h.me.email}`;
    if (this.server) this.set = new Set(h.favorites);
    else { try { this.set = new Set(JSON.parse(localStorage.getItem(this.key) || '[]')); } catch { this.set = new Set(); } }
  },
  async toggle(gsid) {
    const on = !this.set.has(gsid);
    on ? this.set.add(gsid) : this.set.delete(gsid);
    if (this.server) {
      try { await api('/api/favorites', { gsid, on }); }
      catch (e) { on ? this.set.delete(gsid) : this.set.add(gsid); throw e; }
    } else { try { localStorage.setItem(this.key, JSON.stringify([...this.set])); } catch { /* private window: the star lasts for this visit */ } }
  },
};

// ---------- Shared pieces of screens ----------
const TABS = [['Districts', '#/'], ['Gallery', '#/gallery'], ['Submit work', '#/add'], ['Testimonials', '#/testimonials']];
const tabs = (current) => el('nav', { class: 'tabs', 'aria-label': 'Sections' }, TABS.map(([label, hash]) => el('a', { href: hash, 'aria-current': label === current ? 'page' : null }, label)));
const backbar = (label, hash) => el('div', { class: 'backbar' }, el('a', { href: hash }, backIcon(), label));
const field = (label, id, control, hint) => el('div', { class: 'field' }, el('label', { class: 'label', for: id }, label), control, hint && el('span', { class: 'small' }, hint));
const chip = (label, pressed, onclick, name) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(pressed), 'aria-label': name || null, onclick }, label);
const photoBox = (work, cls = '') => el('div', { class: `photo ${cls} ${work.photos.length ? '' : 'empty'}` }, work.photos.length ? el('img', { src: work.photos[0].thumb, alt: `Student work: ${work.title}`, loading: 'lazy' }) : 'Student work photo');
const gradesOf = (w) => w.grades.join(', ') || 'Grade not given';

function show(...nodes) { root.replaceChildren(...nodes); window.scrollTo(0, 0); }
function showError(e, back) { show(back || tabs(''), el('main', { class: 'screen' }, errorBox(e.message), el('a', { class: 'btn secondary', href: location.hash || '#/', onclick: () => setTimeout(route) }, 'Try again'))); }
const loading = (bar) => show(bar, el('main', { class: 'screen' }, el('p', { class: 'body' }, 'Loading...')));

/**
 * "Share as PDF". The first tap builds the PDF; the button then reads "PDF ready" and the next tap opens the
 * phone's share sheet (a share has to start from a tap). Where a browser can't share files, it downloads instead.
 */
function shareButton(cls, url, fallbackName) {
  let file = null;
  const button = el('button', { type: 'button', class: cls }, 'Share as PDF');
  const problem = el('p', { class: 'small', role: 'alert', hidden: true });
  button.addEventListener('click', async () => {
    problem.hidden = true;
    try {
      if (!file) {
        button.disabled = true; button.textContent = 'Making the PDF...';
        const res = await fetch(url);
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The PDF could not be made. Try again.');
        const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || fallbackName;
        file = new File([await res.blob()], name, { type: 'application/pdf' });
        button.textContent = 'PDF ready. Tap to share';
        return;
      }
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: file.name });
      else {
        const link = el('a', { href: URL.createObjectURL(file), download: file.name });
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 60000);
      }
    } catch (e) {
      if (e.name !== 'AbortError') { problem.textContent = e.message; problem.hidden = false; if (!file) button.textContent = 'Share as PDF'; }
    } finally { button.disabled = false; }
  });
  return [button, problem];
}

/** Pick a district from the Gainsight list by typing part of its name. `value()` is the chosen gsid, or ''. */
function districtPicker(id, districts, startGsid) {
  let chosen = districts.find((d) => d.gsid === startGsid) || null;
  const box = el('div', { class: 'stack' });
  const draw = () => {
    if (chosen) {
      box.replaceChildren(el('div', { class: 'picked' }, el('span', { class: 'body bold head' }, `${chosen.name}${chosen.state ? `, ${chosen.state}` : ''}`),
        el('button', { type: 'button', class: 'textlink', onclick: () => { chosen = null; draw(); box.querySelector('input').focus(); } }, 'Change')));
      return;
    }
    const results = el('div', { class: 'picker-results', hidden: true });
    const input = el('input', { id, type: 'search', autocomplete: 'off', placeholder: 'Type a district name', oninput: () => {
      const q = input.value.trim().toLowerCase();
      const hits = q ? districts.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 6) : [];
      results.replaceChildren(...hits.map((d) => el('button', { type: 'button', onclick: () => { chosen = d; draw(); } }, `${d.name}${d.state ? `, ${d.state}` : ''}`)),
        ...(q && !hits.length ? [el('p', { class: 'small', style: 'padding: var(--space-12) var(--space-16)' }, 'No district matches that name.')] : []));
      results.hidden = !q;
    } });
    box.replaceChildren(el('div', { class: 'search' }, searchIcon(), input), results);
  };
  draw();
  return { node: box, value: () => chosen?.gsid || '' };
}

// ---------- 1. Your districts ----------
async function districtsScreen() {
  loading(tabs('Districts'));
  const h = await home();
  let q = '';
  const list = el('div', { class: 'stack-16' });
  const row = (d) => {
    const on = favorites.set.has(d.gsid);
    const star = icon([el('path', { d: STAR })], 22);
    star.setAttribute('fill', on ? 'currentColor' : 'none');
    return el('div', { class: 'drow' },
      el('a', { href: `#/district/${encodeURIComponent(d.gsid)}` }, el('span', {}, d.name), el('span', {}, d.state)),
      el('button', { type: 'button', class: 'star', 'aria-pressed': String(on), 'aria-label': `${on ? 'Remove favorite' : 'Add favorite'}: ${d.name}`, onclick: async () => {
        try { const wait = favorites.toggle(d.gsid); draw(); await wait; } catch (e) { draw(); list.prepend(errorBox(e.message)); }
      } }, star));
  };
  const section = (title, source, rows, emptyText, note) => el('section', { class: 'stack' },
    el('div', { class: 'row' }, el('h2', { class: 'small bold head' }, title), el('span', { class: 'caption' }, source)),
    rows.length ? el('div', { class: 'card' }, rows.map(row)) : el('p', { class: 'small' }, emptyText),
    note && el('p', { class: 'small' }, note));
  function draw() {
    const needle = q.trim().toLowerCase();
    if (needle) {
      const hits = h.districts.filter((d) => d.name.toLowerCase().includes(needle) || d.state.toLowerCase().includes(needle));
      list.replaceChildren(section('Results', 'All districts', hits.slice(0, 25), 'No district matches that name.', hits.length > 25 ? `Showing 25 of ${hits.length}. Keep typing to narrow it down.` : ''));
    } else {
      list.replaceChildren(
        section('Assigned to you', 'From Gainsight', h.districts.filter((d) => d.assigned), 'Gainsight lists no districts for you yet.'),
        section('Your favorites', favorites.server ? 'Starred by you' : 'Starred by you, on this phone', h.districts.filter((d) => !d.assigned && favorites.set.has(d.gsid)), 'Search for a district and tap the star to keep it here.'));
    }
  }
  draw();
  show(tabs('Districts'),
    el('section', { class: 'hero' }, el('h1', { class: 'h1' }, 'Your districts'), el('p', { class: 'body' }, 'Pick a district to see its student work, share it with a leader, or add work from a visit.')),
    el('main', { class: 'screen' },
      el('div', { class: 'field' }, el('label', { class: 'label', for: 'district-search' }, 'Find a district'),
        el('div', { class: 'search' }, searchIcon(), el('input', { id: 'district-search', type: 'search', placeholder: 'District or state', autocomplete: 'off', oninput: (e) => { q = e.target.value; draw(); } }))),
      list,
      el('div', { class: 'stack-12 push' },
        el('a', { class: 'btn', href: '#/add' }, 'Add work'),
        el('p', { class: 'small center' }, 'Keep it on your phone: tap Share, then Add to Home Screen.'),
        el('p', { class: 'small center' }, el('a', { href: '/api/auth/logout' }, 'Sign out')))));
}

// ---------- 2. One district ----------
async function districtScreen(gsid) {
  const bar = backbar('Districts', '#/');
  loading(bar);
  if (!kept.districts.has(gsid)) kept.districts.set(gsid, await api(`/api/work?gsid=${encodeURIComponent(gsid)}`));
  const { district, works } = kept.districts.get(gsid);
  remember(works);
  kept.cameFrom = { label: district.name, hash: `#/district/${encodeURIComponent(gsid)}` };
  let picked = 'All';
  const present = [...new Set(works.flatMap((w) => w.grades))];
  const order = (await home()).grades.map((g) => g.label).filter((g) => present.includes(g));
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by grade' });
  const grid = el('div', { class: 'grid2' });
  const empty = el('p', { class: 'body', hidden: true }, 'No student work from this district is in the gallery yet. Add some from your next visit.');
  function draw() {
    chips.replaceChildren(...['All', ...order].map((g) => chip(g, g === picked, () => { picked = g; draw(); }, g === 'All' ? 'All grades' : g)));
    const shown = works.filter((w) => picked === 'All' || w.grades.includes(picked));
    grid.replaceChildren(...shown.map((w) => el('a', { class: 'card tile', href: `#/work/${w.id}` }, photoBox(w),
      el('div', {}, el('span', { class: 'wtitle' }, w.title), el('span', { class: 'small' }, [gradesOf(w), w.school && w.school !== w.district ? w.school : ''].filter(Boolean).join(' · ')), el('span', { class: 'caption bold' }, w.sharing)))));
    empty.hidden = works.length > 0; chips.hidden = works.length === 0;
  }
  draw();
  show(bar,
    el('section', { class: 'hero roomy' },
      el('div', { class: 'stack-4' }, el('p', { class: 'small bold' }, district.state ? `District in ${district.state}` : 'District'), el('h1', { class: 'h1' }, district.name)),
      el('div', { class: 'stack-12' }, ...shareButton('btn on-hero', `/api/pdf?gsid=${encodeURIComponent(gsid)}`, 'student-work.pdf'), el('a', { class: 'btn on-hero-2', href: `#/add/${encodeURIComponent(gsid)}` }, 'Add work')),
      el('p', { class: 'small' }, "Makes one PDF of this district's work, limited to pieces the teacher said yes to sharing. You send it from your own email or messages. Nothing is posted online.")),
    el('main', { class: 'screen' }, chips, grid, empty));
}

// ---------- 3. Gallery ----------
async function galleryScreen() {
  loading(tabs('Gallery'));
  const [h, g] = await Promise.all([home(), (kept.gallery ??= api('/api/work').catch((e) => { kept.gallery = null; throw e; }))]);
  remember(g.works);
  kept.cameFrom = { label: 'Gallery', hash: '#/gallery' };
  const state = (kept.galleryState ??= { q: '', district: '', grade: 'All' });
  const names = [...new Set(g.works.map((w) => w.district).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const present = new Set(g.works.flatMap((w) => w.grades));
  const grades = h.grades.map((x) => x.label).filter((x) => present.has(x));
  const short = (label) => (label === 'Kindergarten' ? 'K' : label.replace('Grade ', ''));
  const chips = el('div', { class: 'chips', role: 'group', 'aria-labelledby': 'grade-label' });
  const list = el('div', { class: 'stack-16' });
  function draw() {
    chips.replaceChildren(...['All', ...grades].map((x) => chip(x === 'All' ? 'All' : short(x), x === state.grade, () => { state.grade = x; draw(); }, x === 'All' ? 'All grades' : x)));
    const needle = state.q.trim().toLowerCase();
    const shown = g.works.filter((w) => (!state.district || w.district === state.district) && (state.grade === 'All' || w.grades.includes(state.grade))
      && (!needle || [w.district, w.school, w.unit, w.title].some((s) => s.toLowerCase().includes(needle))));
    list.replaceChildren(...(shown.length ? shown.map((w) => el('a', { class: 'card wrow', href: `#/work/${w.id}` }, photoBox(w),
      el('div', {}, el('span', { class: 'wtitle' }, w.title), el('span', { class: 'small' }, `${gradesOf(w)} · ${w.district}`)))) : [el('p', { class: 'body' }, 'No work matches. Try another district or grade.')]));
  }
  draw();
  show(tabs('Gallery'), el('main', { class: 'screen' },
    el('div', { class: 'field' }, el('label', { class: 'label', for: 'gallery-search' }, 'Search the gallery'),
      el('div', { class: 'search' }, searchIcon(), el('input', { id: 'gallery-search', type: 'search', placeholder: 'District, school or unit', autocomplete: 'off', value: state.q, oninput: (e) => { state.q = e.target.value; draw(); } }))),
    field('District', 'district-filter', el('select', { id: 'district-filter', class: 'select', onchange: (e) => { state.district = e.target.value; draw(); } },
      el('option', { value: '' }, 'All districts'), names.map((n) => el('option', { value: n, selected: n === state.district }, n)))),
    el('div', { class: 'field' }, el('span', { class: 'label', id: 'grade-label' }, 'Grade'), chips),
    el('p', { class: 'small' }, `Showing work teachers said any district can see.${g.more ? ` These are the newest ${g.works.length} pieces.` : ''}`),
    list));
}

// ---------- 4. One piece of work ----------
async function workScreen(id) {
  const bar = backbar(kept.cameFrom.label, kept.cameFrom.hash);
  loading(bar);
  const w = kept.works.get(id) || (await api(`/api/work?id=${encodeURIComponent(id)}`)).work;
  kept.works.set(id, w);
  const big = el('div', { class: 'photo bigphoto' });
  const thumbs = el('div', { class: 'thumbs', hidden: w.photos.length < 2 });
  const showPhoto = (i) => {
    big.replaceChildren(w.photos.length ? el('img', { src: w.photos[i].large, alt: `Student work: ${w.title}, photo ${i + 1} of ${w.photos.length}` }) : 'Student work photo');
    thumbs.replaceChildren(...w.photos.map((p, n) => el('button', { type: 'button', 'aria-pressed': String(n === i), 'aria-label': `Photo ${n + 1}`, onclick: () => showPhoto(n) }, el('img', { src: p.thumb, alt: '' }))));
  };
  showPhoto(0);
  const fact = (label, value) => value && el('div', {}, el('dt', {}, label), el('dd', {}, value));
  const canShare = w.shareDistrict || w.shareAcross;
  const note = el('textarea', { class: 'textarea', id: 'leader-note', rows: 5 }, `Hi [LEADER NAME], I wanted you to see this work from a ${gradesOf(w)} class at ${w.school || w.district}. [ONE LINE ON WHAT STUDENTS DID.] I've attached it as a PDF.`);
  const copy = el('button', { type: 'button', class: 'btn secondary start', onclick: async () => {
    try { await navigator.clipboard.writeText(note.value); } catch { note.select(); document.execCommand('copy'); }
    copy.textContent = 'Note copied';
  } }, 'Copy note');
  show(bar, big, thumbs, el('main', { class: 'screen roomy' },
    el('div', { class: 'stack' }, el('div', { class: 'badges' }, el('span', { class: `badge ${canShare ? '' : 'stop'}` }, w.sharing)), el('h1', { class: 'h1 head' }, w.title)),
    el('dl', { class: 'facts' }, fact('Grade', gradesOf(w)), fact('District', w.district), fact('School', w.school !== w.district ? w.school : ''), fact('Type of work', w.workType), fact('Teacher', w.teacher)),
    w.challenge && el('div', { class: 'stack' }, el('h2', { class: 'body bold head' }, 'Inquiry Challenge'), el('p', { class: 'body', style: 'white-space: pre-wrap' }, w.challenge)),
    w.description && el('div', { class: 'stack' }, el('h2', { class: 'body bold head' }, 'What the teacher said'), el('p', { class: 'body', style: 'white-space: pre-wrap' }, w.description)),
    canShare && el('div', { class: 'callout warm' }, el('label', { class: 'body bold head', for: 'leader-note' }, 'Note for a district leader'), note, copy),
    el('div', { class: 'stack-12 push' }, canShare ? shareButton('btn', `/api/pdf?id=${encodeURIComponent(id)}`, 'student-work.pdf') : el('p', { class: 'small bold head' }, 'The teacher has not agreed to share this piece, so it stays inside inquirED.'))));
}

// ---------- 5. Add work for a teacher ----------
/** Makes a photo at most 1600px on its long side and saves it as JPEG, in the browser, before anything is sent. */
async function shrink(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const k = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = el('canvas', { width: Math.round(bitmap.width * k), height: Math.round(bitmap.height * k) });
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', 0.82);
  return { preview: url, base64: url.slice(url.indexOf(',') + 1) };
}
const BATCH = 3_600_000; // base64 characters per request, under Netlify's 6 MB limit

async function addScreen(startGsid) {
  loading(tabs('Submit work'));
  const h = await home();
  const picker = districtPicker('w-district', h.districts, startGsid);
  let photos = [], contestAnswer = null;
  const grades = new Set();
  const input = (id, type, extra = {}) => el('input', { id, type, class: 'input', ...extra });
  const name = input('t-name', 'text', { autocomplete: 'off' }), email = input('t-email', 'email', { autocomplete: 'off', inputmode: 'email' }), school = input('t-school', 'text', { autocomplete: 'off' });
  const unit = el('select', { id: 't-unit', class: 'select' }, el('option', { value: '' }, 'Choose a unit'), h.units.map((u) => el('option', { value: u }, u)));
  const description = el('textarea', { id: 't-desc', class: 'textarea', rows: 4 });
  const gradeChips = el('div', { class: 'chips', role: 'group', 'aria-labelledby': 'grades-label' });
  const drawGrades = () => gradeChips.replaceChildren(...h.grades.map((g) => chip(g.label === 'Kindergarten' ? 'K' : g.label.replace('Grade ', ''), grades.has(g.value), () => { grades.has(g.value) ? grades.delete(g.value) : grades.add(g.value); drawGrades(); }, g.label)));
  drawGrades();
  const previews = el('div', { class: 'previews', hidden: true });
  const photoNote = el('span', { class: 'small' }, `Up to ${h.maxPhotos}. Photos are made smaller on your phone before they upload.`);
  const drawPhotos = () => {
    previews.hidden = !photos.length;
    previews.replaceChildren(...photos.map((p, i) => el('div', {}, el('img', { src: p.preview, alt: `Photo ${i + 1}` }), el('button', { type: 'button', 'aria-label': `Remove photo ${i + 1}`, onclick: () => { photos.splice(i, 1); drawPhotos(); } }, '×'))));
  };
  const picker2 = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async () => {
    for (const f of [...picker2.files].slice(0, h.maxPhotos - photos.length)) {
      try { photos.push(await shrink(f)); } catch { photoNote.textContent = `"${f.name}" could not be read as a photo. Try a JPEG or PNG.`; }
    }
    picker2.value = ''; drawPhotos();
  } });
  const check = (text) => { const box = el('input', { type: 'checkbox' }); return { box, node: el('label', { class: 'check' }, box, text) }; };
  const c1 = check('No student faces in the photos'), c2 = check('No full student names showing'), c3 = check('The teacher said yes to sharing');
  const contestChips = el('div', { class: 'chips two' });
  const drawContest = () => contestChips.replaceChildren(chip('Yes', contestAnswer === true, () => { contestAnswer = true; drawContest(); }), chip('No', contestAnswer === false, () => { contestAnswer = false; drawContest(); }));
  drawContest();
  const problem = el('div', {});
  const submit = el('button', { type: 'submit', class: 'btn', style: 'margin-top: var(--space-8)' }, 'Submit work');

  const form = el('form', { class: 'screen', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const fail = (m) => { problem.replaceChildren(errorBox(m)); problem.scrollIntoView({ block: 'center' }); };
    if (!name.value.trim()) return fail('Add the teacher name.');
    if (!email.validity.valid || !email.value.trim()) return fail('Add the teacher email.');
    if (!picker.value()) return fail('Pick the district from the list.');
    if (!unit.value) return fail('Choose the unit.');
    if (!grades.size) return fail('Pick at least one grade.');
    if (!photos.length) return fail('Add at least one photo.');
    if (!(c1.box.checked && c2.box.checked && c3.box.checked)) return fail('Tick all three boxes under "Before you submit".');
    if (h.contest && contestAnswer === null) return fail(`Say yes or no to the ${h.contest.name}.`);
    submit.disabled = true; submit.textContent = 'Sending...'; problem.replaceChildren();
    try {
      // As many photos as fit go with the first call; any left over follow in calls of their own.
      const batches = [[]]; let size = 0;
      for (const p of photos) { if (size + p.base64.length > BATCH && batches.at(-1).length) { batches.push([]); size = 0; } batches.at(-1).push(p.base64); size += p.base64.length; }
      const made = await api('/api/work', {
        teacherName: name.value, teacherEmail: email.value, gsid: picker.value(), school: school.value, unit: unit.value, grades: [...grades], description: description.value,
        checks: { noFaces: true, noNames: true, teacherYes: true }, contest: h.contest && contestAnswer ? h.contest.name : null, photos: batches[0],
      });
      let saved = made.photosSaved, from = batches[0].length;
      for (const batch of batches.slice(1)) { saved += (await api('/api/work', { upload: made.upload, from, photos: batch })).photosSaved; from += batch.length; }
      show(tabs('Submit work'), el('main', { class: 'screen' },
        el('div', { class: 'callout' }, el('h1', { class: 'h4' }, 'Sent for review'),
          el('p', { class: 'body' }, 'LaKethia White, Supervising Lead of Professional Learning, reviews it before it shows in the gallery.'),
          made.contest && el('p', { class: 'body' }, `It is entered in the ${made.contest}.`),
          saved < photos.length && el('p', { class: 'body bold head' }, `${saved} of ${photos.length} photos were saved. Add the rest in Airtable, or submit them again.`)),
        el('a', { class: 'btn', href: '#/add', onclick: () => setTimeout(route) }, 'Add more work'), el('a', { class: 'btn secondary', href: '#/' }, 'Back to districts')));
    } catch (err) { fail(err.message); submit.disabled = false; submit.textContent = 'Submit work'; }
  } },
    el('div', { class: 'stack' }, el('h1', { class: 'h4' }, 'Add work for a teacher'),
      el('p', { class: 'body' }, 'The teacher is listed as the owner. One unit per submission. LaKethia White, Supervising Lead of Professional Learning, reviews it before it shows in the gallery.')),
    field('Teacher name', 't-name', name), field('Teacher email', 't-email', email),
    field('District', 'w-district', picker.node, 'From the Gainsight list.'), field('School', 't-school', school),
    field('Unit', 't-unit', unit, h.units.length ? '' : 'The unit list could not be loaded. Try again in a minute.'),
    el('div', { class: 'field' }, el('span', { class: 'label', id: 'grades-label' }, 'Grades'), gradeChips),
    field('What the teacher said about it', 't-desc', description, 'Shows in the gallery with the work.'),
    el('div', { class: 'field' }, el('span', { class: 'label' }, 'Photos'), previews, el('button', { type: 'button', class: 'addphotos', onclick: () => picker2.click() }, cameraIcon(), 'Add photos'), picker2, photoNote),
    h.contest && el('div', { class: 'field', role: 'group', 'aria-labelledby': 'contest-label' }, el('span', { class: 'label', id: 'contest-label' }, `Enter this in the ${h.contest.name} too?`), contestChips,
      h.contest.rulesUrl && el('a', { class: 'textlink', href: h.contest.rulesUrl, target: '_blank', rel: 'noopener' }, 'Read the rules >>')),
    el('div', { class: 'callout', role: 'group', 'aria-labelledby': 'check-heading' }, el('h2', { class: 'body bold head', id: 'check-heading' }, 'Before you submit'), el('div', {}, c1.node, c2.node, c3.node)),
    problem, submit);
  show(tabs('Submit work'), form);
}

// ---------- 6. Testimonials ----------
function statusLine(t) {
  if (t.status === 'Signed') return `Consent signed ${shortDate(t.signedAt)}. Copy emailed.`;
  if (t.status === 'Waiting on speaker') return `Waiting on speaker. Form emailed ${shortDate(t.sentAt)}. Not for use yet.`;
  if (t.status === 'Declined') return 'The speaker said no. Not for use.';
  return 'Needs consent. Not for use yet.';
}
async function testimonialsScreen() {
  loading(tabs('Testimonials'));
  const { items } = await api('/api/testimonials');
  let picked = 'All';
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by consent' });
  const list = el('div', { class: 'stack-16' });
  function draw() {
    chips.replaceChildren(...['All', 'Signed', 'Not signed'].map((f) => chip(f, f === picked, () => { picked = f; draw(); })));
    const shown = items.filter((t) => picked === 'All' || (picked === 'Signed' ? t.signed : !t.signed));
    list.replaceChildren(...(shown.length ? shown.map(card) : [el('p', { class: 'body' }, items.length ? 'None here.' : 'You have not added a testimonial yet.')]));
  }
  function card(t) {
    const problem = el('p', { class: 'small', role: 'alert', hidden: true });
    const canSend = !t.signed && t.status !== 'Declined' && t.hasEmail;
    const send = canSend && el('button', { type: 'button', class: 'btn secondary start', onclick: async () => {
      send.disabled = true; problem.hidden = true;
      try { Object.assign(t, (await api('/api/testimonials', { send: t.id })).item); draw(); }
      catch (e) { problem.textContent = e.message; problem.hidden = false; send.disabled = false; }
    } }, t.status === 'Waiting on speaker' ? 'Send again' : 'Email consent form');
    return el('article', { class: 'card tcard' },
      el('div', { class: 'row' }, el('div', { class: 'badges' }, t.products.map((p) => el('span', { class: 'badge' }, p)), !t.signed && el('span', { class: 'badge stop' }, 'Not for use')), el('span', { class: 'caption' }, 'Typed')),
      el('p', { class: 'quote' }, t.quote),
      el('p', { class: 'small' }, `${[t.name, t.role].filter(Boolean).join(', ')} · ${t.district}`),
      el('p', { class: 'small bold head' }, statusLine(t)),
      t.districtApproval && el('p', { class: 'small' }, 'District office must approve too.'),
      send, problem);
  }
  draw();
  show(tabs('Testimonials'), el('main', { class: 'screen' },
    el('div', { class: 'stack' }, el('h1', { class: 'h4' }, 'Testimonials'),
      el('p', { class: 'body' }, 'What teachers and leaders told you, with their consent on file. Olivia Page, Product Marketing Manager, reviews signed ones before marketing uses them.')),
    el('a', { class: 'btn', href: '#/testimonials/add' }, 'Add testimonial'), chips, list));
}

// ---------- 7. Add a testimonial, with consent ----------
async function testimonialAddScreen() {
  const bar = backbar('Testimonials', '#/testimonials');
  loading(bar);
  const h = await home();
  const picker = districtPicker('s-district', h.districts);
  const products = new Set();
  let way = 'Email the form', saved = null;
  const input = (id, type, extra = {}) => el('input', { id, type, class: 'input', autocomplete: 'off', ...extra });
  const name = input('s-name', 'text'), role = input('s-role', 'text', { placeholder: 'Grade 2 teacher, principal' }), email = input('s-email', 'email', { inputmode: 'email' });
  const quote = el('textarea', { id: 's-quote', class: 'textarea', rows: 5 });
  const agree = el('input', { type: 'checkbox' }), signName = input('s-sign', 'text'), office = el('input', { type: 'checkbox' });
  const productChips = el('div', { class: 'chips two', role: 'group', 'aria-labelledby': 'product-label' });
  const drawProducts = () => productChips.replaceChildren(...h.products.map((p) => chip(p, products.has(p), () => { products.has(p) ? products.delete(p) : products.add(p); drawProducts(); })));
  drawProducts();
  const wayChips = el('div', { class: 'chips two' });
  const problem = el('div', {});
  const fail = (m) => { problem.replaceChildren(errorBox(m)); problem.scrollIntoView({ block: 'center' }); };
  const draft = () => ({ name: name.value, role: role.value, gsid: picker.value(), email: email.value, products: [...products], quote: quote.value, districtApproval: office.checked });
  const ready = () => {
    if (!name.value.trim()) return fail('Add the speaker name.');
    if (!picker.value()) return fail('Pick the district from the list.');
    if (!email.validity.valid || !email.value.trim()) return fail('Add the speaker email. It is where their copy goes.');
    if (!products.size) return fail('Pick at least one product.');
    if (!quote.value.trim()) return fail('Add their words.');
    problem.replaceChildren();
    return true;
  };

  const sendNote = el('p', { class: 'small' }, 'Goes to the speaker email above.');
  const sendButton = el('button', { type: 'button', class: 'btn', onclick: async () => {
    if (!saved && !ready()) return;
    sendButton.disabled = true;
    try {
      const res = saved ? await api('/api/testimonials', { send: saved.id }) : await api('/api/testimonials', { ...draft(), consent: { way: 'email' } });
      saved = res.item;
      if (res.note) { sendNote.textContent = res.note; sendButton.textContent = 'Send again'; }
      else { sendButton.textContent = 'Send again'; sendNote.textContent = 'Sent to the speaker just now. Status: waiting on speaker.'; }
      saveButton.textContent = 'Done'; saveNote.textContent = 'Saved. Until the speaker signs, it stays out of use.';
      form.querySelectorAll('.lock input, .lock textarea, .lock button').forEach((n) => { n.disabled = true; });
    } catch (e) { fail(e.message); }
    sendButton.disabled = false;
  } }, 'Email consent form');
  const emailPanel = el('div', { class: 'callout roomy', role: 'group', 'aria-labelledby': 'email-heading' }, el('h2', { class: 'body bold head', id: 'email-heading' }, 'Email the consent form'),
    el('p', { class: 'body' }, 'We email the speaker their words and a link to sign. It comes from the shared inquirED address with your name in it, and you get a copy when they sign.'),
    sendButton, sendNote, el('button', { type: 'button', class: 'textlink', onclick: async () => {
      try { emailPreview(await api('/api/testimonials', { ...draft(), preview: true })); } catch (e) { fail(e.message); }
    } }, 'See the email >>'));
  const herePanel = el('div', { class: 'callout roomy lock', role: 'group', 'aria-labelledby': 'consent-heading' }, el('h2', { class: 'body bold head', id: 'consent-heading' }, 'For the speaker: your consent'),
    el('p', { class: 'body' }, h.consentWording), el('label', { class: 'check agree' }, agree, 'I agree'),
    field('Type your full name to sign', 's-sign', signName), el('p', { class: 'small' }, 'We save the date and time with your name, and email you a copy.'));
  const drawWay = () => {
    wayChips.replaceChildren(...['Email the form', 'Sign here now'].map((w) => chip(w, w === way, () => { if (!saved) { way = w; drawWay(); } })));
    emailPanel.hidden = way !== 'Email the form'; herePanel.hidden = way === 'Email the form';
  };
  drawWay();

  const saveNote = el('p', { class: 'small center' }, 'Until the speaker signs, it stays out of use.');
  const saveButton = el('button', { type: 'button', class: 'btn secondary', onclick: async () => {
    if (saved) { location.hash = '#/testimonials'; return; }
    if (!ready()) return;
    const signing = way === 'Sign here now' && (agree.checked || signName.value.trim());
    if (signing && !(agree.checked && signName.value.trim())) return fail('To sign now, the speaker ticks "I agree" and types their full name.');
    saveButton.disabled = true;
    try {
      const res = await api('/api/testimonials', { ...draft(), consent: signing ? { way: 'here', agree: true, signedName: signName.value } : { way: 'none' } });
      saved = res.item;
      if (res.note) { saveButton.textContent = 'Done'; saveNote.textContent = res.note; fail(res.note); } else location.hash = '#/testimonials';
    } catch (e) { fail(e.message); }
    saveButton.disabled = false;
  } }, 'Save testimonial');

  const form = el('form', { class: 'screen', novalidate: true, onsubmit: (e) => e.preventDefault() },
    el('div', { class: 'stack' }, el('h1', { class: 'h4' }, 'Add a testimonial'), el('p', { class: 'body' }, 'Capture what they said, then get their consent by email or on your phone.')),
    el('div', { class: 'stack-16 lock' },
      field('Speaker name', 's-name', name), field('Role', 's-role', role), field('District', 's-district', picker.node, 'From the Gainsight list.'), field('Speaker email', 's-email', email),
      el('div', { class: 'field' }, el('span', { class: 'label', id: 'product-label' }, 'Product'), productChips),
      field('Their words', 's-quote', quote)),
    el('div', { class: 'field', role: 'group', 'aria-labelledby': 'how-label' }, el('span', { class: 'label', id: 'how-label' }, 'How to get consent'), wayChips),
    emailPanel, herePanel,
    el('label', { class: 'check lock' }, office, 'District office must approve too'),
    problem,
    el('div', { class: 'stack' }, saveButton, saveNote));
  show(bar, form);
}

/** The consent email as the speaker would read it, over the form. */
function emailPreview(mail) {
  const close = () => { sheet.remove(); document.body.style.overflow = ''; };
  const sheet = el('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'The consent email', style: 'position: fixed; inset: 0; z-index: 10; background: var(--grey-0); overflow-y: auto' },
    el('div', { class: 'app' },
      el('div', { class: 'backbar' }, el('button', { type: 'button', class: 'textlink', style: 'align-self: center; font: var(--type-body); font-weight: var(--link-weight)', onclick: close }, 'Close')),
      el('div', { class: 'mail-head' }, el('p', { class: 'caption' }, `From: ${mail.from}`), el('p', { class: 'caption' }, `To: ${mail.to}`), el('p', { class: 'body bold head' }, mail.subject)),
      el('main', { class: 'screen' }, el('p', { class: 'mail-body' }, mail.text))));
  document.body.style.overflow = 'hidden';
  document.body.append(sheet);
  sheet.querySelector('button').focus();
}

// ---------- Which screen ----------
async function route() {
  const [, name = '', arg = '', arg2 = ''] = (location.hash || '#/').split('/').map(decodeURIComponent);
  try {
    const h = await home();
    if (!route.ready) { favorites.load(h); document.getElementById('signed-in').textContent = `Signed in: ${h.me.name}`; route.ready = true; }
    if (name === '') await districtsScreen();
    else if (name === 'district' && arg) await districtScreen(arg);
    else if (name === 'gallery') await galleryScreen();
    else if (name === 'work' && arg) await workScreen(arg);
    else if (name === 'add') await addScreen(arg);
    else if (name === 'testimonials' && arg === 'add') await testimonialAddScreen();
    else if (name === 'testimonials' && !arg2) await testimonialsScreen();
    else location.hash = '#/';
  } catch (e) { showError(e); }
}
window.addEventListener('hashchange', route);
route();

// An older version of this app saved pages on the phone. Clear that copy: these pages need a sign-in every time.
navigator.serviceWorker?.getRegistrations().then((list) => list.forEach((r) => r.unregister())).catch(() => {});
if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
