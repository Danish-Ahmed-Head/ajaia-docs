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
  await page.getByRole('button', { name: '+ New document' }).click();
  await page.locator('#title').fill('Launch plan');
  await page.locator('#title').press('Enter');

  await page.keyboard.type('Goals');
  await page.getByLabel('Text style').selectOption('h1');
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
  await expect(page.locator('#share-list')).toContainText('Bob Editor can edit');
  await dialog.getByLabel('User').selectOption('carol@example.com');
  await dialog.getByLabel('Role').selectOption('viewer');
  await dialog.getByRole('button', { name: 'Share' }).click();
  await expect(page.locator('#share-list')).toContainText('Carol Reviewer can view');
  await expect(page.locator('#share-list')).toContainText('Bob Editor can edit');
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

test('keyboard-only: sign in, create a doc and type without the mouse', async ({ page }) => {
  await page.goto('/'); // each Playwright test starts with fresh cookies, so this is the sign-in screen
  await expect(page.getByRole('button', { name: /Alice Owner/ })).toBeVisible(); // user list loads async
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /Alice Owner/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#me-name')).toHaveText('Alice Owner');
  await page.getByRole('button', { name: '+ New document' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('Keyboard doc');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Typed without a mouse');
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
});

test('expired session sends the user back to sign-in', async ({ page, context }) => {
  await signIn(page, 'Alice Owner');
  await context.clearCookies();
  await page.getByRole('button', { name: '+ New document' }).click();
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('session ended');
});
