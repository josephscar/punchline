// Two "devices" (browser contexts, each with its own local library) signed in
// to the same account on the Firebase emulators. Run with `npm run test:cloud`.
import { expect, test, type Browser, type Page } from '@playwright/test';

const PROJECT = 'demo-punchline';

test.beforeEach(async () => {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
});

const dialog = (page: Page) => page.locator('dialog[open]');

async function device(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.pl-editor')).toBeVisible();
  return { page, errors, close: () => context.close() };
}

async function signIn(page: Page, email = 'writer@example.com') {
  await page.getByRole('button', { name: 'Cloud sync: Sign in' }).click({ timeout: 20_000 });
  await dialog(page).getByLabel('Emulator account').fill(email);
  await dialog(page).getByRole('button', { name: 'Sign in to emulator' }).click();
  await expect(dialog(page).getByText('Everything’s up to date.')).toBeVisible({ timeout: 20_000 });
  await dialog(page).getByRole('button', { name: 'Close' }).click();
}

/** Put the open sample pilot into a new project, which makes it sync. */
async function fileInNewProject(page: Page, title: string) {
  await page.getByRole('button', { name: 'Library' }).click();
  const lib = dialog(page);
  await lib.getByRole('button', { name: /New project/ }).click();
  await lib.getByLabel('Project name').fill(title);
  await lib.getByRole('button', { name: 'Create' }).click();
  await lib.getByRole('button', { name: /All scripts/ }).click();
  await lib.getByLabel(/Project for PAPER TRAIL/).selectOption({ label: title });
  await lib.getByRole('button', { name: 'Close' }).click();
}

async function openFromProject(page: Page, project: string) {
  await page.getByRole('button', { name: 'Library' }).click();
  const lib = dialog(page);
  await lib.getByRole('button', { name: new RegExp(project) }).first().click();
  await lib.locator('.script-open').first().click();
}

async function typeAtEnd(page: Page, text: string) {
  await page.locator('.pl-editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(text);
}

const synced = (page: Page) => expect(page.getByRole('button', { name: 'Cloud sync: Synced' })).toBeVisible({ timeout: 20_000 });

test('projects and edits sync between two devices signed in to the same account', async ({ browser }) => {
  const a = await device(browser);
  await signIn(a.page);
  await fileInNewProject(a.page, 'Paper Trail');
  await typeAtEnd(a.page, 'Dana tapes a second banner.');
  await synced(a.page);

  const b = await device(browser);
  await signIn(b.page);
  await openFromProject(b.page, 'Paper Trail');
  await expect(b.page.locator('.crumb')).toContainText('Paper Trail');
  await expect(b.page.locator('.pl-editor')).toContainText('Dana tapes a second banner.');

  // B writes; A has the script open, so its page updates once A isn't typing.
  await typeAtEnd(b.page, 'Gary finally notices.');
  await expect(a.page.locator('.pl-editor')).toContainText('Gary finally notices.', { timeout: 20_000 });
  await expect(a.page.locator('.pl-editor')).toContainText('Dana tapes a second banner.');

  // And back the other way.
  await typeAtEnd(a.page, 'Marcus eats the cake.');
  await expect(b.page.locator('.pl-editor')).toContainText('Marcus eats the cake.', { timeout: 20_000 });

  // Deleting on one device deletes on the other.
  await b.page.getByRole('button', { name: 'Library' }).click();
  await dialog(b.page).getByRole('button', { name: /Paper Trail/ }).first().click();
  await dialog(b.page).getByRole('button', { name: /^Delete PAPER TRAIL/ }).click();
  await dialog(b.page).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(a.page.getByRole('status').filter({ hasText: 'was deleted on another device' })).toBeVisible({ timeout: 20_000 });
  await expect(a.page.locator('.pl-editor')).not.toContainText('Marcus eats the cake.');

  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.close();
  await b.close();
});

test('another account can’t see your projects', async ({ browser }) => {
  const a = await device(browser);
  await signIn(a.page, 'writer@example.com');
  await fileInNewProject(a.page, 'Paper Trail');
  await synced(a.page);

  const other = await device(browser);
  await signIn(other.page, 'someone.else@example.com');
  await other.page.getByRole('button', { name: 'Library' }).click();
  await expect(dialog(other.page).getByRole('button', { name: /Paper Trail/ })).toHaveCount(0);
  await a.close();
  await other.close();
});
