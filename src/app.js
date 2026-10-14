import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

const $ = (id) => document.getElementById(id);
const state = { me: null, doc: null, saveTimer: null, dirty: false, saving: null, openSeq: 0 };

async function api(path, { method = 'GET', body, form, keepalive = false } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method, keepalive,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw Object.assign(new Error('Network error. Check your connection'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') sessionExpired();
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

// Last line of defence: any failed action surfaces as a message instead of failing silently.
window.addEventListener('unhandledrejection', (e) => {
  e.preventDefault();
  if (e.reason?.status !== 401) toast(e.reason?.message ?? 'Something went wrong'); // 401 is already handled by sessionExpired()
});

function sessionExpired() {
  if (!$('login').hidden) return;
  clearInterval(state.presenceTimer); $('presence').innerHTML = ''; // no DELETE call: the session is already gone
  closeDocView();
  toast('Your session ended. Please sign in again.');
  showLogin();
}

/** Tear down the open document completely, so nothing of it survives into the next session or user. */
function closeDocView() {
  state.openSeq++; // any openDoc still in flight is now stale
  state.doc = null; state.dirty = false; clearTimeout(state.saveTimer);
  editor?.destroy(); editor = null;
  $('editor-view').hidden = true; $('empty').hidden = false; $('remote-banner').hidden = true;
  document.title = 'Ajaia Docs';
  if (location.hash) history.replaceState(null, '', location.pathname);
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 4500);
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function fmtRelative(s) {
  const secs = Math.round((new Date(s).getTime() - Date.now()) / 1000);
  const steps = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of steps) if (Math.abs(secs) >= size) return RELATIVE.format(Math.round(secs / size), unit);
  return 'just now';
}

const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const hue = (name) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const avatar = (name, cls = '') =>
  `<span class="avatar ${cls}" style="--h:${hue(name)}" aria-hidden="true">${escapeHtml(initials(name))}</span>`;
const icon = (id) => `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;

// ---------- auth ----------
const DEMO_ROLE_HINT = {
  'alice@example.com': 'Creates and shares documents',
  'bob@example.com': 'Gets edit access in the demo',
  'carol@example.com': 'Gets view-only access in the demo',
};
async function showLogin() {
  $('app').hidden = true; $('login').hidden = false; $('toast').hidden = true;
  const users = await api('/api/users');
  $('user-list').innerHTML = users.map((u) =>
    `<button class="user-btn" data-email="${escapeHtml(u.email)}">${avatar(u.name)}
      <span><span class="who">${escapeHtml(u.name)}</span>
      <span class="what">${escapeHtml(DEMO_ROLE_HINT[u.email] ?? u.email)}</span></span></button>`).join('');
}
$('user-list').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  try {
    await api('/api/login', { method: 'POST', body: { email: b.dataset.email } });
    boot();
  } catch (err) { toast(err.message); }
});

// ---------- mobile drawer ----------
const mobileNav = window.matchMedia('(max-width: 760px)');
function setNav(open) {
  $('app').classList.toggle('nav-open', open);
  $('menu-btn').setAttribute('aria-expanded', String(open));
  $('scrim').hidden = !open;
  // A closed drawer is only moved off-screen; inert keeps its links out of the Tab order and screen readers.
  $('sidebar').inert = mobileNav.matches && !open;
  if (open) $('new-doc').focus();
}
mobileNav.addEventListener('change', () => setNav(false));
$('menu-btn').addEventListener('click', () => setNav(!$('app').classList.contains('nav-open')));
$('nav-close').addEventListener('click', () => { setNav(false); $('menu-btn').focus(); });
$('scrim').addEventListener('click', () => setNav(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });
$('logout').addEventListener('click', async () => {
  if (!(await flushSave())) return;
  stopPresence(); // before logout: the "left the document" call still needs the session
  await api('/api/logout', { method: 'POST' });
  closeDocView();
  showLogin();
});

// ---------- document list ----------
const SKELETON = '<li aria-hidden="true"><div class="skeleton"></div></li>'.repeat(2);

async function refreshList() {
  state.listAt = Date.now();
  const { owned, shared } = await api('/api/docs');
  const active = state.doc?.id;
  const link = (d, sub) => `<li><a href="#/doc/${d.id}" class="${d.id === active ? 'active' : ''}"${d.id === active ? ' aria-current="page"' : ''}>
      ${icon('file')}<span class="doc-name">${escapeHtml(d.title)}</span>${sub}</a></li>`;
  $('owned').innerHTML = owned.length
    ? owned.map((d) => link(d, `<span class="doc-sub"><span>Edited ${escapeHtml(fmtRelative(d.updated_at))}</span></span>`)).join('')
    : '<li class="list-empty">No documents yet. Create one or import a file.</li>';
  $('shared').innerHTML = shared.length
    ? shared.map((d) => link(d, `<span class="doc-sub">${avatar(d.owner_name, 'avatar-sm')}<span>${escapeHtml(d.owner_name)}</span>
        <span class="pill ${d.role === 'editor' ? 'pill-edit' : ''}">${d.role === 'editor' ? 'can edit' : 'view only'}</span></span>`)).join('')
    : '<li class="list-empty">Nothing has been shared with you yet.</li>';

  const hasDocs = owned.length + shared.length > 0;
  $('empty-title').textContent = hasDocs ? 'Pick up where you left off' : 'Start a document';
  $('empty-text').textContent = hasDocs
    ? 'Choose a document from the sidebar, or start a new one.'
    : 'Create a blank document, or import a .txt, .md or .docx file. You can share it with a teammate as an editor or viewer.';
}

async function createDoc() {
  setNav(false);
  // Lock the current document while the new one loads, so early keystrokes can't land in the wrong title or body.
  $('editor-view').inert = true;
  try {
    const { id } = await api('/api/docs', { method: 'POST', body: { title: 'Untitled document' } });
    state.selectTitleOnOpen = true; // done by openDoc once the doc is mounted; a timer could steal focus later
    location.hash = `#/doc/${id}`;
    await refreshList();
  } catch (err) {
    $('editor-view').inert = false;
    throw err;
  }
}
$('new-doc').addEventListener('click', createDoc);
$('empty-new').addEventListener('click', createDoc);

$('upload').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  if (!/\.(txt|md|docx)$/i.test(file.name)) return toast('Unsupported file. Use .txt, .md or .docx');
  if (file.size > 2 * 1024 * 1024) return toast('File too large (max 2 MB)');
  const form = new FormData(); form.append('file', file);
  try {
    const { id } = await api('/api/upload', { method: 'POST', form });
    toast(`Imported "${file.name}" as a new document`);
    setNav(false);
    location.hash = `#/doc/${id}`; await refreshList();
  } catch (err) { toast(err.message); }
});

// ---------- editor ----------
// Tiptap (ProseMirror): schema-enforced formatting, so stored HTML is always well-formed.
// A fresh editor per document so undo history never crosses documents.
let editor = null;
function mountEditor(content, editable) {
  editor?.destroy();
  editor = new Editor({
    element: $('editor'),
    extensions: [StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      code: false, codeBlock: false, horizontalRule: false,
      link: { openOnClick: false, autolink: true },
    })],
    content,
    editable,
    onUpdate: scheduleSave,
    onTransaction: updateToolbar,
  });
}

async function openDoc(id) {
  const seq = ++state.openSeq; // if another document is opened before this one loads, this call stands down
  $('editor-view').inert = true;
  if (!(await flushSave())) {
    $('editor-view').inert = false;
    history.replaceState(null, '', `#/doc/${state.doc.id}`); // user chose to stay; presence keeps running
    return;
  }
  if (seq !== state.openSeq) return;
  stopPresence();
  state.dirty = false; clearTimeout(state.saveTimer); // the user agreed to leave: nothing carries over
  let doc;
  try {
    doc = await api(`/api/docs/${id}`);
  } catch (err) {
    if (seq !== state.openSeq) return;
    closeDocView();
    toast(err.message); return refreshList();
  }
  if (seq !== state.openSeq) return; // a newer openDoc won the race
  state.doc = doc;
  $('editor-view').inert = false;
  const d = state.doc, canEdit = d.role !== 'viewer';
  setNav(false);
  $('empty').hidden = true; $('editor-view').hidden = false;
  $('title').value = d.title; $('title').readOnly = !canEdit;
  mountEditor(d.content || '', canEdit);
  if (state.selectTitleOnOpen) { state.selectTitleOnOpen = false; $('title').select(); }
  $('readonly-banner').hidden = canEdit;
  $('toolbar').querySelectorAll('button, select').forEach((el) => (el.disabled = !canEdit));
  $('share-btn').hidden = d.role !== 'owner';
  $('delete-btn').hidden = d.role !== 'owner';
  renderMeta();
  setStatus(`Saved ${fmtRelative(d.updated_at)}`, 'saved');
  updateWordCount();
  document.title = `${d.title} · Ajaia Docs`;
  document.querySelector('.sheet-wrap').dataset.title = d.title;
  $('remote-banner').hidden = true;
  startPresence();
  refreshList();
}

// ---------- presence + "someone else changed this" ----------
// Polling every 10 s: simple, works through any proxy, and is enough to show who's here. WebSockets/Yjs is the upgrade path.
function startPresence() {
  stopPresence();
  const doc = state.doc;
  const tick = async () => {
    if (state.doc !== doc || document.hidden) return;
    let p;
    try {
      p = await api(`/api/docs/${doc.id}/presence`, { method: 'POST' });
    } catch (err) {
      if (state.doc === doc) accessMayHaveChanged(err);
      return;
    }
    if (state.doc !== doc) return;
    renderPresence(p.others);
    const theirs = new Date(p.updated_at).getTime(), ours = new Date(doc.updated_at).getTime();
    if (theirs > ours && !state.dirty && !state.inFlight) {
      if ($('remote-banner').hidden) state.warnedOverwrite = false; // a new remote change: warn again on the next edit
      $('remote-text').textContent = `${p.last_editor ?? 'Someone'} updated this document.`;
      $('remote-banner').hidden = false;
    }
  };
  tick();
  state.presenceTimer = setInterval(tick, 10_000);
}
function stopPresence() {
  clearInterval(state.presenceTimer);
  if (state.doc) api(`/api/docs/${state.doc.id}/presence`, { method: 'DELETE' }).catch(() => {});
  $('presence').innerHTML = '';
}
function renderPresence(others) {
  $('presence').innerHTML = others.length
    ? others.slice(0, 4).map((o) => avatar(o.name).replace('<span class="avatar', `<span title="${escapeHtml(o.name)} is viewing" class="avatar`)).join('')
      + `<span class="presence-label">${others.length === 1 ? `${escapeHtml(others[0].name)} is here` : `${others.length} others here`}</span>`
    : '';
}
$('remote-reload').addEventListener('click', () => openDoc(state.doc.id));

/** 403/404 on an open document means the owner changed or removed our access: reload it to pick up the new role. */
function accessMayHaveChanged(err) {
  if (err.status !== 403 && err.status !== 404) return false;
  state.dirty = false; clearTimeout(state.saveTimer); // unsaveable under the new role; avoids a "leave anyway?" loop
  toast('Your access to this document changed.');
  openDoc(state.doc.id);
  return true;
}

// ---------- version history ----------
let historyVersions = [], historySelected = null;
async function selectVersion(index) {
  const v = historyVersions[index];
  historySelected = v;
  for (const b of $('history-list').querySelectorAll('button')) b.setAttribute('aria-current', String(Number(b.dataset.i) === index));
  const full = await api(`/api/docs/${state.doc.id}/versions/${v.id}`);
  if (historySelected !== v) return; // a later click won; never preview one version while Restore targets another
  $('history-preview').innerHTML = full.content || '<p class="muted">This version is empty.</p>'; // content is sanitised on the server
  $('history-meta').textContent = index === 0 ? 'This is the current version.' : `${v.author_name} · ${new Date(v.saved_at).toLocaleString()}`;
  $('history-restore').hidden = state.doc.role === 'viewer';
  $('history-restore').disabled = index === 0;
}
$('history-btn').addEventListener('click', async () => {
  await flushSave();
  historyVersions = await api(`/api/docs/${state.doc.id}/versions`);
  $('history-list').innerHTML = historyVersions.length
    ? historyVersions.map((v, i) => `<li><button type="button" data-i="${i}">${avatar(v.author_name)}
        <span><b>${escapeHtml(fmtRelative(v.saved_at))}</b>
        <small>${escapeHtml(v.note ? v.note.replace(/from \S+T\S+$/, 'from an earlier version') : v.author_name)}</small></span></button></li>`).join('')
    : '<li class="list-empty">No versions yet. They appear after the first edit.</li>';
  $('history-preview').innerHTML = '';
  $('history-meta').textContent = '';
  $('history-restore').hidden = true;
  $('history-dialog').showModal();
  if (historyVersions.length) await selectVersion(0);
});
$('history-list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]'); if (b) selectVersion(Number(b.dataset.i));
});
$('history-restore').addEventListener('click', async () => {
  if (!historySelected) return;
  try {
    await api(`/api/docs/${state.doc.id}/versions/${historySelected.id}/restore`, { method: 'POST' });
    $('history-dialog').close();
    toast(`Restored the version from ${new Date(historySelected.saved_at).toLocaleString()}`);
    await openDoc(state.doc.id);
  } catch (err) { toast(err.message); }
});

// ---------- export PDF: the print stylesheet prints only the document; the browser offers "Save as PDF" ----------
$('pdf-btn').addEventListener('click', () => window.print());

function renderMeta() {
  const d = state.doc;
  $('doc-meta').textContent = d.role === 'owner'
    ? (d.shares.length ? `You own this document · shared with ${d.shares.length} ${d.shares.length === 1 ? 'person' : 'people'}` : 'You own this document · private')
    : `Owned by ${d.owner.name} · you can ${d.role === 'editor' ? 'edit' : 'view'}`;
}

function updateWordCount() {
  const words = editor ? editor.getText().trim().split(/\s+/).filter(Boolean).length : 0;
  $('word-count').textContent = `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`;
}

/** state: 'saved' | 'saving' | 'dirty' | 'error'. Text of the "saved" state must stay "All changes saved" after a save. */
function setStatus(text, kind = 'saved') {
  const s = $('save-status');
  s.textContent = text; s.dataset.state = kind; s.classList.toggle('error', kind === 'error');
}

function scheduleSave() {
  if (!$('remote-banner').hidden && !state.warnedOverwrite) {
    state.warnedOverwrite = true;
    toast('Someone else changed this document. Saving will replace their version (it stays in History). Use “Load latest” to see it first.');
  }
  state.dirty = true; setStatus('Unsaved changes…', 'dirty'); updateWordCount();
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(save, 800);
}

async function save({ keepalive = false } = {}) {
  clearTimeout(state.saveTimer);
  await state.saving; // one save in flight at a time, so an older save can never land after a newer one
  if (!state.doc || !state.dirty || state.doc.role === 'viewer') return;
  const title = $('title').value.trim();
  if (!title) { setStatus('Add a title to save', 'error'); return; }
  state.dirty = false; setStatus('Saving…', 'saving');
  const doc = state.doc;
  state.inFlight = true; // tells the presence check that a newer server timestamp is our own save
  state.saving = api(`/api/docs/${doc.id}`, { method: 'PUT', body: { title, content: editor.getHTML() }, keepalive })
    .then((r) => {
      const titleChanged = doc.title !== title;
      doc.title = title; doc.updated_at = r.updated_at;
      if (state.doc === doc && !state.dirty) {
        setStatus('All changes saved', 'saved');
        document.title = `${title} · Ajaia Docs`;
        document.querySelector('.sheet-wrap').dataset.title = title;
      }
      // Autosave runs about once a second while typing; re-fetching the list each time doubled API traffic.
      if (titleChanged || Date.now() - state.listAt > 30_000) refreshList();
    })
    .catch((err) => {
      if (state.doc !== doc) return;
      if (accessMayHaveChanged(err)) return;
      state.dirty = true;
      setStatus(`Not saved: ${err.message}`, 'error');
      // Transient failures (offline, rate limit, server error) retry; validation errors wait for the user's next edit.
      if (err.status === 0 || err.status === 429 || err.status >= 500) state.saveTimer = setTimeout(save, 5000);
    })
    .finally(() => { state.inFlight = false; });
  await state.saving;
}
async function flushSave() {
  if (state.dirty) await save(); else await state.saving;
  return !state.dirty || confirm('Your latest changes could not be saved. Leave this document anyway?');
}

$('title').addEventListener('input', scheduleSave);
// view.focus() is synchronous; Tiptap's focus command waits a frame, which lets a fast next keystroke land in the title.
$('title').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); editor?.view.focus(); } });
// keepalive lets the final save finish while the tab closes (browser limit: 64 KB body).
window.addEventListener('beforeunload', (e) => { if (state.dirty) { save({ keepalive: true }); e.preventDefault(); } });

// Toolbar -> Tiptap commands. Pasted content is normalised by the editor schema (and sanitised again on the server).
const COMMANDS = {
  bold: (c) => c.toggleBold(), italic: (c) => c.toggleItalic(), underline: (c) => c.toggleUnderline(),
  strike: (c) => c.toggleStrike(), bulletList: (c) => c.toggleBulletList(), orderedList: (c) => c.toggleOrderedList(),
  blockquote: (c) => c.toggleBlockquote(), undo: (c) => c.undo(), redo: (c) => c.redo(),
};
$('toolbar').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // keep selection
$('toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cmd]');
  if (b && editor) COMMANDS[b.dataset.cmd](editor.chain().focus()).run();
});
// Keyboard users step through options with the arrow keys (each fires "change"), so focus only returns to the
// document after a mouse/touch pick or when they press Enter/Escape.
let blockStyleByPointer = false;
$('block-style').addEventListener('pointerdown', () => { blockStyleByPointer = true; });
$('block-style').addEventListener('keydown', (e) => {
  blockStyleByPointer = false;
  if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); editor?.view.focus(); }
});
$('block-style').addEventListener('change', (e) => {
  const level = Number(e.target.value.slice(1));
  const chain = editor.chain();
  (e.target.value === 'p' ? chain.setParagraph() : chain.setHeading({ level })).run();
  if (blockStyleByPointer) editor.view.focus();
});
function updateToolbar() {
  if (!editor) return;
  for (const b of $('toolbar').querySelectorAll('button[data-cmd]')) {
    const cmd = b.dataset.cmd;
    if (cmd === 'undo' || cmd === 'redo') b.disabled = !editor.isEditable || !editor.can()[cmd]();
    else b.classList.toggle('on', editor.isActive(cmd));
  }
  const level = [1, 2, 3].find((l) => editor.isActive('heading', { level: l }));
  $('block-style').value = level ? `h${level}` : 'p';
}

// ---------- delete / export ----------
$('delete-btn').addEventListener('click', () => {
  const shared = state.doc.shares.length;
  $('delete-text').textContent = `"${state.doc.title}" will be permanently deleted${shared ? ` for you and the ${shared} ${shared === 1 ? 'person' : 'people'} it is shared with` : ''}. This cannot be undone.`;
  // <dialog> keeps its last returnValue, and Escape doesn't change it: reset it so only a click on Delete counts.
  $('delete-dialog').returnValue = '';
  $('delete-dialog').showModal();
});
$('delete-dialog').addEventListener('close', async (e) => {
  if (e.target.returnValue !== 'confirm') return;
  try {
    stopPresence();
    await api(`/api/docs/${state.doc.id}`, { method: 'DELETE' });
    closeDocView(); // only after the server confirmed: a failed delete keeps the document and its unsaved edits
    toast('Document deleted');
    refreshList();
  } catch (err) {
    startPresence();
    toast(err.message);
  }
});

// Markdown needs delimiters hugging the text: "**Ship **it" doesn't render, "**Ship** it" does.
const wrapMark = (inner, mark) => {
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  return core ? `${lead}${mark}${core}${mark}${trail}` : inner;
};
// List items: their blocks become lines, and continuation lines are indented under the marker
// so nested lists and second paragraphs stay inside the item.
const listItem = (marker, body) => marker + body.trim().replace(/\n{2,}/g, '\n').replace(/\n(?=.)/g, `\n${' '.repeat(marker.length)}`);

function htmlToMarkdown(root) {
  const walk = (node) => [...node.childNodes].map((n) => {
    if (n.nodeType === 3) return n.textContent;
    if (n.nodeType !== 1) return '';
    const inner = walk(n), tag = n.tagName.toLowerCase();
    switch (tag) {
      case 'h1': case 'h2': case 'h3': return `${'#'.repeat(+tag[1])} ${inner.trim()}\n\n`;
      case 'strong': case 'b': return wrapMark(inner, '**');
      case 'em': case 'i': return wrapMark(inner, '*');
      case 'u': return inner;
      case 's': return wrapMark(inner, '~~');
      case 'br': return '  \n'; // two trailing spaces = a hard line break in Markdown
      case 'ul': return [...n.children].map((li) => listItem('- ', walk(li))).join('\n') + '\n\n';
      case 'ol': return [...n.children].map((li, i) => listItem(`${i + 1}. `, walk(li))).join('\n') + '\n\n';
      case 'blockquote': return inner.trim().split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
      case 'a': return `[${inner}](${n.getAttribute('href')})`;
      case 'p': case 'div': return `${inner.trim()}\n\n`;
      default: return inner;
    }
  }).join('');
  return walk(root).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
$('export-btn').addEventListener('click', () => {
  const blob = new Blob([htmlToMarkdown(editor.view.dom)], { type: 'text/markdown' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: `${($('title').value || 'document').replace(/[\\/:*?"<>|]/g, '_')}.md`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000); // revoking in the same tick can cancel the download in some browsers
});

// ---------- sharing ----------
async function renderShareList() {
  const d = await api(`/api/docs/${state.doc.id}`);
  state.doc.shares = d.shares;
  const person = (name, email, trailing) => `<li>${avatar(name)}<span class="who"><b>${escapeHtml(name)}</b>
    <small>${escapeHtml(email)}</small></span>${trailing}</li>`;
  $('share-list').innerHTML = person(state.me.name, state.me.email, '<span class="pill">Owner</span>') +
    d.shares.map((s) => person(s.name, s.email,
      `<select data-user="${s.id}" aria-label="Access for ${escapeHtml(s.name)}">
         <option value="editor"${s.role === 'editor' ? ' selected' : ''}>Can edit</option>
         <option value="viewer"${s.role === 'viewer' ? ' selected' : ''}>Can view</option>
       </select>
       <button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove="${s.id}" aria-label="Remove ${escapeHtml(s.name)}" title="Remove access">${icon('x')}</button>`)).join('');
  renderMeta();
}
$('share-list').addEventListener('change', async (e) => {
  const userId = e.target.dataset.user; if (!userId) return;
  const person = state.doc.shares.find((s) => String(s.id) === userId);
  try {
    await api(`/api/docs/${state.doc.id}/share`, { method: 'POST', body: { email: person.email, role: e.target.value } });
    await renderShareList();
    toast(`${person.name} can now ${e.target.value === 'editor' ? 'edit' : 'view'} this document`);
  } catch (err) { $('share-error').textContent = err.message; await renderShareList(); }
});
$('share-btn').addEventListener('click', async () => {
  $('share-error').textContent = '';
  // The user picker is filled once per open, so it never resets under the user while they pick.
  const users = await api('/api/users');
  $('share-email').innerHTML = users.filter((u) => u.id !== state.me.id).map((u) =>
    `<option value="${escapeHtml(u.email)}">${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>`).join('');
  await renderShareList();
  $('share-dialog').showModal();
});
$('share-add').addEventListener('click', async (e) => {
  $('share-error').textContent = '';
  e.target.disabled = true;
  try {
    await api(`/api/docs/${state.doc.id}/share`, { method: 'POST', body: { email: $('share-email').value, role: $('share-role').value } });
    await renderShareList();
    toast(`Shared with ${$('share-email').selectedOptions[0].text.replace(/ \(.*/, '')}`);
  } catch (err) { $('share-error').textContent = err.message; }
  finally { e.target.disabled = false; }
});
$('share-list').addEventListener('click', async (e) => {
  const id = e.target.closest('[data-remove]')?.dataset.remove; if (!id) return;
  try { await api(`/api/docs/${state.doc.id}/share/${id}`, { method: 'DELETE' }); await renderShareList(); }
  catch (err) { $('share-error').textContent = err.message; }
});

// ---------- routing / boot ----------
function route() {
  const m = /^#\/doc\/(\d+)$/.exec(location.hash);
  if (m) openDoc(Number(m[1]));
}
window.addEventListener('hashchange', route);

async function boot() {
  state.me = await api('/api/me');
  if (!state.me) return showLogin();
  $('login').hidden = true; $('app').hidden = false; $('toast').hidden = true;
  setNav(false); // closed drawer starts inert on phones
  $('owned').innerHTML = SKELETON; $('shared').innerHTML = SKELETON; // shown only until the first list arrives
  $('me-name').textContent = state.me.name;
  $('me-avatar').innerHTML = '';
  $('me-avatar').outerHTML = avatar(state.me.name).replace('class="avatar ', 'id="me-avatar" class="avatar ');
  await refreshList();
  route();
}
boot().catch((err) => toast(err.message));
