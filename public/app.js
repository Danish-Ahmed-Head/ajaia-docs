const $ = (id) => document.getElementById(id);
const state = { me: null, doc: null, saveTimer: null, dirty: false, saving: null };

async function api(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500);
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (s) => new Date(s.replace(' ', 'T') + 'Z').toLocaleString();

// ---------- auth ----------
async function showLogin() {
  $('app').hidden = true; $('login').hidden = false;
  const users = await api('/api/users');
  $('user-list').innerHTML = users.map((u) =>
    `<button data-email="${escapeHtml(u.email)}">${escapeHtml(u.name)}<small>${escapeHtml(u.email)}</small></button>`).join('');
}
$('user-list').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  await api('/api/login', { method: 'POST', body: { email: b.dataset.email } });
  boot();
});
$('logout').addEventListener('click', async () => {
  await flushSave();
  await api('/api/logout', { method: 'POST' });
  state.doc = null; location.hash = ''; showLogin();
});

// ---------- document list ----------
async function refreshList() {
  const { owned, shared } = await api('/api/docs');
  const active = state.doc?.id;
  $('owned').innerHTML = owned.length ? owned.map((d) =>
    `<li><a href="#/doc/${d.id}" class="${d.id === active ? 'active' : ''}">${escapeHtml(d.title)}
      <small>Edited ${fmtDate(d.updated_at)}</small></a></li>`).join('')
    : '<li class="empty-item">No documents yet</li>';
  $('shared').innerHTML = shared.length ? shared.map((d) =>
    `<li><a href="#/doc/${d.id}" class="${d.id === active ? 'active' : ''}">${escapeHtml(d.title)}
      <span class="badge">${d.role === 'editor' ? 'can edit' : 'view only'}</span>
      <small>Owner: ${escapeHtml(d.owner_name)}</small></a></li>`).join('')
    : '<li class="empty-item">Nothing shared with you</li>';
}

$('new-doc').addEventListener('click', async () => {
  const { id } = await api('/api/docs', { method: 'POST', body: { title: 'Untitled document' } });
  location.hash = `#/doc/${id}`;
  await refreshList();
  setTimeout(() => $('title').select(), 50);
});

$('upload').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  if (!/\.(txt|md|docx)$/i.test(file.name)) return toast('Unsupported file. Use .txt, .md or .docx');
  if (file.size > 2 * 1024 * 1024) return toast('File too large (max 2 MB)');
  const form = new FormData(); form.append('file', file);
  try {
    const { id } = await api('/api/upload', { method: 'POST', form });
    toast(`Imported "${file.name}"`);
    location.hash = `#/doc/${id}`; await refreshList();
  } catch (err) { toast(err.message); }
});

// ---------- editor ----------
const editor = $('editor');
document.execCommand('defaultParagraphSeparator', false, 'p');

async function openDoc(id) {
  await flushSave();
  try {
    state.doc = await api(`/api/docs/${id}`);
  } catch (err) {
    state.doc = null; $('editor-view').hidden = true; $('empty').hidden = false;
    toast(err.message); return refreshList();
  }
  const d = state.doc, canEdit = d.role !== 'viewer';
  $('empty').hidden = true; $('editor-view').hidden = false;
  $('title').value = d.title; $('title').readOnly = !canEdit;
  editor.innerHTML = d.content || (canEdit ? '<p><br></p>' : '');
  editor.contentEditable = canEdit ? 'true' : 'false';
  $('readonly-banner').hidden = canEdit;
  $('toolbar').querySelectorAll('button, select').forEach((el) => (el.disabled = !canEdit));
  $('share-btn').hidden = d.role !== 'owner';
  $('delete-btn').hidden = d.role !== 'owner';
  $('doc-meta').textContent = d.role === 'owner'
    ? `You own this document${d.shares.length ? ` · shared with ${d.shares.length}` : ''}`
    : `Owned by ${d.owner.name} · you ${d.role === 'editor' ? 'can edit' : 'can view'}`;
  setStatus(`Saved ${fmtDate(d.updated_at)}`);
  refreshList();
}

function setStatus(text, isError = false) {
  const s = $('save-status'); s.textContent = text; s.classList.toggle('error', isError);
}

function scheduleSave() {
  state.dirty = true; setStatus('Unsaved changes…');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(save, 800);
}

async function save() {
  clearTimeout(state.saveTimer);
  if (!state.doc || !state.dirty || state.doc.role === 'viewer') return;
  const title = $('title').value.trim();
  if (!title) { setStatus('Title cannot be empty', true); return; }
  state.dirty = false; setStatus('Saving…');
  const doc = state.doc;
  state.saving = api(`/api/docs/${doc.id}`, { method: 'PUT', body: { title, content: editor.innerHTML } })
    .then((r) => { if (state.doc === doc) { doc.title = title; setStatus('All changes saved'); } doc.updated_at = r.updated_at; refreshList(); })
    .catch((err) => { state.dirty = true; setStatus(`Save failed: ${err.message}`, true); });
  await state.saving;
}
async function flushSave() { if (state.dirty) await save(); else if (state.saving) await state.saving; }

editor.addEventListener('input', scheduleSave);
$('title').addEventListener('input', scheduleSave);
$('title').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); editor.focus(); } });
window.addEventListener('beforeunload', (e) => { if (state.dirty) { save(); e.preventDefault(); } });

// Paste as plain text: keeps stored HTML clean and predictable (formatting via toolbar).
editor.addEventListener('paste', (e) => {
  e.preventDefault();
  document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
});

// Toolbar
$('toolbar').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // keep selection
$('toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cmd]'); if (!b) return;
  document.execCommand(b.dataset.cmd, false, null);
  editor.focus(); updateToolbar(); scheduleSave();
});
$('block-style').addEventListener('change', (e) => {
  editor.focus();
  document.execCommand('formatBlock', false, e.target.value);
  scheduleSave();
});
function updateToolbar() {
  if (!state.doc || !editor.contains(document.getSelection().anchorNode)) return;
  for (const b of $('toolbar').querySelectorAll('button[data-cmd]')) {
    if (['undo', 'redo'].includes(b.dataset.cmd)) continue;
    b.classList.toggle('on', document.queryCommandState(b.dataset.cmd));
  }
  const block = String(document.queryCommandValue('formatBlock') || 'p').toLowerCase();
  $('block-style').value = ['h1', 'h2', 'h3'].includes(block) ? block : 'p';
}
document.addEventListener('selectionchange', updateToolbar);

// ---------- delete / export ----------
$('delete-btn').addEventListener('click', async () => {
  if (!confirm(`Delete "${state.doc.title}"? This cannot be undone.`)) return;
  try {
    state.dirty = false; clearTimeout(state.saveTimer);
    await api(`/api/docs/${state.doc.id}`, { method: 'DELETE' });
    state.doc = null; location.hash = '';
    $('editor-view').hidden = true; $('empty').hidden = false; refreshList();
  } catch (err) { toast(err.message); }
});

function htmlToMarkdown(root) {
  const walk = (node) => [...node.childNodes].map((n) => {
    if (n.nodeType === 3) return n.textContent;
    if (n.nodeType !== 1) return '';
    const inner = walk(n), tag = n.tagName.toLowerCase();
    switch (tag) {
      case 'h1': case 'h2': case 'h3': return `${'#'.repeat(+tag[1])} ${inner.trim()}\n\n`;
      case 'strong': case 'b': return inner.trim() ? `**${inner}**` : inner;
      case 'em': case 'i': return inner.trim() ? `*${inner}*` : inner;
      case 'u': return inner;
      case 's': return inner.trim() ? `~~${inner}~~` : inner;
      case 'br': return '\n';
      case 'ul': return [...n.children].map((li) => `- ${walk(li).trim()}`).join('\n') + '\n\n';
      case 'ol': return [...n.children].map((li, i) => `${i + 1}. ${walk(li).trim()}`).join('\n') + '\n\n';
      case 'p': case 'div': case 'blockquote': return `${inner.trim()}\n\n`;
      default: return inner;
    }
  }).join('');
  return walk(root).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
$('export-btn').addEventListener('click', () => {
  const blob = new Blob([htmlToMarkdown(editor)], { type: 'text/markdown' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: `${($('title').value || 'document').replace(/[\\/:*?"<>|]/g, '_')}.md`,
  });
  a.click(); URL.revokeObjectURL(a.href);
});

// ---------- sharing ----------
async function renderShareDialog() {
  const d = await api(`/api/docs/${state.doc.id}`);
  state.doc.shares = d.shares;
  const users = await api('/api/users');
  const candidates = users.filter((u) => u.id !== state.me.id);
  $('share-email').innerHTML = candidates.map((u) =>
    `<option value="${escapeHtml(u.email)}">${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>`).join('');
  $('share-list').innerHTML = `<li><span>${escapeHtml(state.me.name)} <span class="badge">owner</span></span></li>` +
    d.shares.map((s) => `<li><span>${escapeHtml(s.name)} <span class="badge">${s.role === 'editor' ? 'can edit' : 'can view'}</span></span>
      <button type="button" class="link danger" data-remove="${s.id}">Remove</button></li>`).join('');
  $('doc-meta').textContent = `You own this document${d.shares.length ? ` · shared with ${d.shares.length}` : ''}`;
}
$('share-btn').addEventListener('click', async () => {
  $('share-error').textContent = '';
  await renderShareDialog();
  $('share-dialog').showModal();
});
$('share-add').addEventListener('click', async () => {
  $('share-error').textContent = '';
  try {
    await api(`/api/docs/${state.doc.id}/share`, { method: 'POST', body: { email: $('share-email').value, role: $('share-role').value } });
    await renderShareDialog();
  } catch (err) { $('share-error').textContent = err.message; }
});
$('share-list').addEventListener('click', async (e) => {
  const id = e.target.dataset.remove; if (!id) return;
  try { await api(`/api/docs/${state.doc.id}/share/${id}`, { method: 'DELETE' }); await renderShareDialog(); }
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
  $('login').hidden = true; $('app').hidden = false;
  $('me-name').textContent = state.me.name;
  await refreshList();
  route();
}
boot().catch((err) => toast(err.message));
