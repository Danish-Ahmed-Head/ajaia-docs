import { test, expect } from '@playwright/test';

// Every page in these tests fails on any console error or CSP violation.
test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.consoleErrors = errors;
});
test.afterEach(async ({ page }) => {
  // 401/403 responses are expected in role tests; the browser logs them as resource errors.
  const real = page.consoleErrors.filter((e) => !/status of 40[13]/.test(e));
  expect(real, 'console errors').toEqual([]);
});

const signIn = async (page, name) => {
  await page.goto('/');
  if (await page.getByRole('button', { name: 'Switch user' }).isVisible()) await page.getByRole('button', { name: 'Switch user' }).click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.locator('#me-name')).toHaveText(name);
};
const editor = (page) => page.locator('#editor .tiptap');

test('owner creates, formats, saves and reopens a document', async ({ page }) => {
  await signIn(page, 'Alice Owner');
  await page.getByRole('button', { name: 'New document' }).first().click();
  await page.locator('#title').fill('Launch plan');
  await page.locator('#title').press('Enter');

  await page.keyboard.type('Goals');
  await page.getByLabel('Text style').selectOption('h1');
  await page.getByLabel('Text style').press('Enter'); // keyboard users confirm with Enter to return to the text
  await expect(page.locator('#editor .tiptap')).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.getByLabel('Bold').click();
  await page.keyboard.type('Ship it');
  await page.getByLabel('Bold').click();
  await page.keyboard.press('Enter');
  await page.getByLabel('Bulleted list').click();
  await page.keyboard.type('Editor');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Sharing');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // leave the list
  await page.getByLabel('Underline').click();
  await page.keyboard.type('done');

  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(editor(page).locator('h1')).toHaveText('Goals');
  await expect(editor(page).locator('strong')).toHaveText('Ship it');
  await expect(editor(page).locator('ul li')).toHaveText(['Editor', 'Sharing']);
  await expect(editor(page).locator('u')).toHaveText('done');
  await expect(page.locator('#owned')).toContainText('Launch plan');
});

test('owner shares: editor can edit, viewer is read-only, stranger is denied', async ({ page }) => {
  await signIn(page, 'Alice Owner');
  await page.locator('#owned a', { hasText: 'Launch plan' }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = page.locator('#share-dialog');
  await dialog.getByLabel('User').selectOption('bob@example.com');
  await dialog.getByLabel('Role').selectOption('editor');
  await dialog.getByRole('button', { name: 'Share' }).click();
  const accessFor = (name) => page.locator('#share-list li', { hasText: name }).locator('select');
  await expect(accessFor('Bob Editor')).toHaveValue('editor');
  await dialog.getByLabel('User').selectOption('carol@example.com');
  await dialog.getByLabel('Role').selectOption('viewer');
  await dialog.getByRole('button', { name: 'Share' }).click();
  await expect(accessFor('Carol Reviewer')).toHaveValue('viewer');
  await expect(accessFor('Bob Editor')).toHaveValue('editor');

  // Changing a person's access in place works, and the change is real.
  await accessFor('Carol Reviewer').selectOption('editor');
  await expect(page.locator('#toast')).toContainText('Carol Reviewer can now edit');
  await accessFor('Carol Reviewer').selectOption('viewer');
  await expect(page.locator('#toast')).toContainText('Carol Reviewer can now view');
  await dialog.getByRole('button', { name: 'Done' }).click();
  const docUrl = page.url();

  await signIn(page, 'Bob Editor');
  await expect(page.locator('#shared')).toContainText('Launch plan');
  await expect(page.locator('#shared')).toContainText('can edit');
  await page.locator('#shared a', { hasText: 'Launch plan' }).click();
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeHidden();
  await editor(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' (edited by Bob)');
  await expect(page.locator('#save-status')).toHaveText('All changes saved');

  await signIn(page, 'Carol Reviewer');
  await page.locator('#shared a', { hasText: 'Launch plan' }).click();
  await expect(page.locator('#readonly-banner')).toBeVisible();
  await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
  await expect(editor(page)).toContainText('(edited by Bob)');
  await expect(page.getByLabel('Bold')).toBeDisabled();
  await expect(page.locator('#title')).toHaveAttribute('readonly', '');

  // Carol can't bypass the UI either.
  const status = await page.evaluate(async (u) => (await fetch(`/api/docs/${u.split('/').pop()}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'hacked' }),
  })).status, docUrl);
  expect(status).toBe(403);
});

test('import a Markdown file as a new document; unsupported files are refused', async ({ page }) => {
  await signIn(page, 'Alice Owner');
  await page.locator('#upload').setInputFiles({ name: 'meeting-notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes\n\n- **Decision**: ship\n- Owner: Bob') });
  await expect(page.locator('#title')).toHaveValue('meeting-notes');
  await expect(editor(page).locator('h1')).toHaveText('Notes');
  await expect(editor(page).locator('li strong')).toHaveText('Decision');

  await page.locator('#upload').setInputFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(page.locator('#toast')).toContainText('Unsupported file');
});

test('export downloads Markdown that matches the document', async ({ page }) => {
  await signIn(page, 'Alice Owner');
  await page.locator('#owned a', { hasText: 'Launch plan' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export .md' }).click()]);
  expect(download.suggestedFilename()).toBe('Launch plan.md');
  const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
  expect(text).toContain('# Goals');
  expect(text).toContain('**Ship it**');
  expect(text).toContain('- Editor');
});

test('typing straight after "New document" never lands in the previous document', async ({ page }) => {
  await signIn(page, 'Alice Owner');
  await page.locator('#new-doc').click();
  await page.locator('#title').fill('Race first');
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  // Real keystrokes fired the instant the button is clicked, while the new document is still loading.
  await page.locator('#new-doc').click();
  await page.keyboard.type('XYZ', { delay: 0 });
  await expect(page.locator('#title')).toBeFocused();
  await page.keyboard.type('Race second');
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  const titles = await page.locator('#owned .doc-name').allTextContents();
  expect(titles).toContain('Race first'); // the previous document was never touched
  expect(titles.some((t) => t.endsWith('Race second'))).toBe(true);
});

test('keyboard-only: sign in, create a doc and type without the mouse', async ({ page }) => {
  await page.goto('/'); // each Playwright test starts with fresh cookies, so this is the sign-in screen
  await expect(page.getByRole('button', { name: /Alice Owner/ })).toBeVisible(); // user list loads async
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /Alice Owner/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#me-name')).toHaveText('Alice Owner');
  await page.locator('#new-doc').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#title')).toBeFocused(); // the new document opens with its title selected
  await page.keyboard.type('Keyboard doc');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Typed without a mouse');
  // Markdown shortcuts, typed key by key like a person would.
  await page.keyboard.press('Enter');
  await page.keyboard.type('# Shortcut heading');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- first point');
  await expect(page.locator('#editor h1')).toHaveText('Shortcut heading');
  await expect(page.locator('#editor ul li')).toHaveText('first point');
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
});

test('version history: see who changed what and restore an older version', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  await signIn(alice, 'Alice Owner');
  await alice.locator('#new-doc').click();
  await expect(alice.locator('#title')).toBeFocused();
  await alice.keyboard.type('History demo');
  await alice.keyboard.press('Enter');
  await alice.keyboard.type('Original plan');
  await expect(alice.locator('#save-status')).toHaveText('All changes saved');
  const docPath = new URL(alice.url()).hash;
  await alice.getByRole('button', { name: 'Share', exact: true }).click();
  await alice.locator('#share-dialog').getByLabel('User').selectOption('bob@example.com');
  await alice.locator('#share-dialog').getByRole('button', { name: 'Share' }).click();
  await alice.locator('#share-dialog').getByRole('button', { name: 'Done' }).click();

  await signIn(bob, 'Bob Editor');
  await bob.goto(`/${docPath}`);
  await bob.locator('#editor .tiptap').click();
  await bob.keyboard.press('Control+A');
  await bob.keyboard.type('Bob rewrote everything');
  await expect(bob.locator('#save-status')).toHaveText('All changes saved');

  await alice.reload();
  await alice.getByRole('button', { name: 'History' }).click();
  const items = alice.locator('#history-list button');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Bob Editor');
  await expect(alice.locator('#history-restore')).toBeDisabled(); // newest = current version
  await items.nth(1).click();
  await expect(alice.locator('#history-preview')).toContainText('Original plan');
  await alice.locator('#history-restore').click();
  await expect(alice.locator('#editor .tiptap')).toContainText('Original plan');
  await expect(alice.locator('#editor .tiptap')).not.toContainText('Bob rewrote');
  await alice.context().close(); await bob.context().close();
});

test('presence: collaborators see who else is in the document and get told about their edits', async ({ browser }) => {
  test.setTimeout(60_000);
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  await signIn(alice, 'Alice Owner');
  await alice.locator('#owned a', { hasText: 'History demo' }).click();
  const docPath = new URL(alice.url()).hash;
  await signIn(bob, 'Bob Editor');
  await bob.goto(`/${docPath}`);

  await expect(bob.locator('#presence')).toContainText('Alice Owner is here');
  await expect(alice.locator('#presence')).toContainText('Bob Editor is here', { timeout: 15_000 });

  await bob.locator('#editor .tiptap').click();
  await bob.keyboard.press('Control+End');
  await bob.keyboard.type(' Bob added this line.');
  await expect(bob.locator('#save-status')).toHaveText('All changes saved');

  await expect(alice.locator('#remote-banner')).toBeVisible({ timeout: 15_000 });
  await expect(alice.locator('#remote-text')).toHaveText('Bob Editor updated this document.');
  await alice.getByRole('button', { name: 'Load latest' }).click();
  await expect(alice.locator('#editor .tiptap')).toContainText('Bob added this line.');
  await expect(alice.locator('#remote-banner')).toBeHidden();
  await alice.context().close(); await bob.context().close();
});

test('export PDF prints only the document', async ({ page }) => {
  await signIn(page, 'Alice Owner');
  await page.locator('#owned a', { hasText: 'Launch plan' }).click();
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.getByRole('button', { name: 'Export PDF' }).click();
  expect(await page.evaluate(() => window.__printed)).toBe(true);

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#toolbar')).toBeHidden();
  await expect(page.locator('#editor h1')).toHaveText('Goals');
  const printedTitle = await page.locator('.sheet-wrap').evaluate((el) => getComputedStyle(el, '::before').content);
  expect(printedTitle).toBe('"Launch plan"');
});

test('review fix: pressing Escape in the delete dialog never deletes (even after a previous delete)', async ({ page }) => {
  await signIn(page, 'Alice Owner');
  for (const title of ['Delete me', 'Keep me']) {
    await page.locator('#new-doc').click();
    await expect(page.locator('#title')).toBeFocused();
    await page.keyboard.type(title);
    await expect(page.locator('#save-status')).toHaveText('All changes saved');
  }
  await page.locator('#owned a', { hasText: 'Delete me' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete document' }).click(); // first: a real delete
  await expect(page.locator('#owned')).not.toContainText('Delete me');

  await page.locator('#owned a', { hasText: 'Keep me' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#delete-dialog')).toBeVisible();
  await page.keyboard.press('Escape'); // second: cancel
  await expect(page.locator('#delete-dialog')).toBeHidden();
  await page.reload();
  await expect(page.locator('#owned')).toContainText('Keep me');
});

test('review fix: switching user without a reload shows nothing of the previous user\'s document', async ({ page }) => {
  await signIn(page, 'Alice Owner');
  await page.locator('#new-doc').click();
  await expect(page.locator('#title')).toBeFocused();
  await page.keyboard.type('Alice private draft');
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.getByRole('button', { name: 'Switch user' }).click(); // no page.goto: same page, like a real user
  await page.getByRole('button', { name: /Carol Reviewer/ }).click();
  await expect(page.locator('#me-name')).toHaveText('Carol Reviewer');
  await expect(page.locator('#editor-view')).toBeHidden();
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Alice private draft');
});

test('review fix: an editor whose access is downgraded mid-session is switched to read-only', async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  await signIn(alice, 'Alice Owner');
  await alice.locator('#new-doc').click();
  await expect(alice.locator('#title')).toBeFocused();
  await alice.keyboard.type('Downgrade test');
  await expect(alice.locator('#save-status')).toHaveText('All changes saved');
  const docId = new URL(alice.url()).hash.split('/').pop();
  const share = (role) => alice.evaluate(async ([id, r]) => (await fetch(`/api/docs/${id}/share`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bob@example.com', role: r }),
  })).status, [docId, role]);
  expect(await share('editor')).toBe(200);

  await signIn(bob, 'Bob Editor');
  await bob.goto(`/#/doc/${docId}`);
  await expect(bob.locator('#editor .tiptap')).toHaveAttribute('contenteditable', 'true');
  expect(await share('viewer')).toBe(200); // owner downgrades Bob while he has it open
  await bob.locator('#editor .tiptap').click();
  await bob.keyboard.type(' more');
  await expect(bob.locator('#readonly-banner')).toBeVisible(); // his save got 403, so the app reloaded his role
  await expect(bob.locator('#editor .tiptap')).toHaveAttribute('contenteditable', 'false');
  await alice.context().close(); await bob.context().close();
});

test('review fix: Markdown export keeps nested lists and puts marks around the words', async ({ page }) => {
  await signIn(page, 'Alice Owner');
  await page.locator('#new-doc').click();
  await expect(page.locator('#title')).toBeFocused();
  await page.keyboard.type('Export check');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- parent');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab'); // nest
  await page.keyboard.type('child');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('Ship ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('it');
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export .md' }).click()]);
  const md = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
  expect(md).toContain('- parent\n  - child');
  expect(md).toContain('**Ship** it');
});

test('ux: dropping a file anywhere imports it; Ctrl+S saves without the browser dialog', async ({ page }) => {
  await signIn(page, 'Alice Owner');
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(['# Dropped\n\nhello'], 'dropped.md', { type: 'text/markdown' }));
    return d;
  });
  await page.dispatchEvent('main', 'dragover', { dataTransfer: dt });
  await expect(page.locator('body')).toHaveClass(/dropping/);
  await page.dispatchEvent('main', 'drop', { dataTransfer: dt });
  await expect(page.locator('body')).not.toHaveClass(/dropping/);
  await expect(page.locator('#title')).toHaveValue('dropped');
  await expect(editor(page).locator('h1')).toHaveText('Dropped');

  await editor(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' now');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#toast')).toContainText('saved automatically');
});

test('ux: on a phone the home screen has a compact top bar and opens the documents menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'Alice Owner');
  const bar = await page.locator('.topbar').boundingBox();
  expect(bar.height).toBeLessThan(70);
  await page.getByRole('button', { name: 'Your documents' }).click();
  await expect(page.locator('#sidebar')).toBeInViewport();
  await expect(page.locator('#new-doc')).toBeFocused();
});

test('ux: on touch screens every editor control is at least 44px to tap', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await signIn(page, 'Alice Owner');
  await page.locator('#menu-btn').click();
  await page.locator('#owned a').first().click();
  await expect(page.locator('#editor .tiptap')).toBeVisible();
  const small = await page.$$eval('.toolbar button, .toolbar select, .doc-actions .btn, #menu-btn', (els) =>
    els.filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect()).filter((b) => b.width < 44 || b.height < 44).length);
  expect(small).toBe(0);
  await context.close();
});

test('expired session sends the user back to sign-in', async ({ page, context }) => {
  await signIn(page, 'Alice Owner');
  await context.clearCookies();
  await page.locator('#new-doc').click();
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('session ended');
});
