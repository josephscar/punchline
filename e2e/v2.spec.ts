import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function elements(page: Page) {
  return page.$$eval('.pl-editor > p', (ps) =>
    ps.map((p) => {
      const clone = p.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[contenteditable="false"]').forEach((w) => w.remove());
      return `${p.dataset.kind}: ${clone.textContent}`;
    }),
  );
}

const library = (page: Page) => page.getByRole('button', { name: 'Library' });
const dialog = (page: Page) => page.locator('dialog[open]');

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.pl-editor')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(errors).toEqual([]);
});

test('new scripts can be one-hour dramas or feature screenplays', async ({ page }) => {
  await library(page).click();
  await dialog(page).getByRole('button', { name: /New One-Hour Drama/ }).click();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.nav-act-title')).toHaveText([/TEASER/, /ACT ONE/, /ACT TWO/, /ACT THREE/, /ACT FOUR/, /ACT FIVE/]);
  expect((await elements(page)).at(-1)).toBe('act_end: END OF EPISODE');

  await library(page).click();
  await dialog(page).getByRole('button', { name: /New Feature Screenplay/ }).click();
  // Films have one title, no episode title.
  await expect(dialog(page).getByLabel('Episode title')).toHaveCount(0);
  await dialog(page).getByRole('textbox', { name: /^Title\b/ }).fill('The Long Lunch');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.doc-title')).toHaveText('The Long Lunch');
  expect(await elements(page)).toEqual(['action: FADE IN:', 'scene_heading: ', 'action: ', 'transition: FADE OUT.']);
  // Features have no act elements in the menu or the Tab cycle.
  await expect(page.getByLabel('Element type').locator('option')).toHaveCount(8);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(dialog(page).getByLabel('Format')).toHaveValue('feature-screenplay');
});

test('projects group scripts and share their cast', async ({ page }) => {
  await library(page).click();
  const lib = dialog(page);
  await lib.getByRole('button', { name: /New project/ }).click();
  await lib.getByLabel('Project name').fill('Paper Trail');
  await lib.getByRole('button', { name: 'Create' }).click();
  await expect(lib.locator('.lib-title')).toHaveText('Paper Trail');
  await expect(lib.locator('.script-list')).toHaveCount(0);

  // Move the sample pilot into the project.
  await lib.getByRole('button', { name: /All scripts/ }).click();
  await lib.getByLabel(/Project for PAPER TRAIL/).selectOption({ label: 'Paper Trail' });
  await lib.getByRole('button', { name: /Paper Trail/ }).first().click();
  await expect(lib.locator('.script-title')).toHaveText(['PAPER TRAIL — "Pilot"']);

  // A new episode in the project starts with the series title…
  await lib.getByRole('button', { name: /New Single-Cam Sitcom/ }).click();
  await expect(dialog(page).getByLabel('Series title')).toHaveValue('PAPER TRAIL');
  await dialog(page).getByLabel('Episode title').fill('The Banner');
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.crumb')).toContainText('Paper Trail');
  await expect(page.locator('.doc-title')).toHaveText('PAPER TRAIL — "The Banner"');

  // …and the series cast is suggested in it.
  await page.getByRole('tab', { name: /Characters/ }).click();
  await expect(page.locator('.remembered h3')).toHaveText('From other scripts in Paper Trail');
  await expect(page.locator('.chip')).toContainText(['DANA', 'GARY', 'MARCUS']);
});

test('drafts can be saved, compared, marked, restored and branched', async ({ page }) => {
  await page.getByRole('tab', { name: /Drafts/ }).click();
  await expect(page.getByLabel('Draft name')).toHaveValue('First Draft');
  await page.getByLabel('Revision colour').selectOption('White');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.locator('.draft-name')).toHaveText(['First Draft']);
  await expect(page.getByLabel('Draft name')).toHaveValue('Draft 2');

  // Rewrite a line and add one.
  const line = page.locator('.pl-el[data-kind="dialogue"]', { hasText: 'I went to lunch.' });
  await line.click();
  await page.keyboard.press('End');
  await expect(page.locator('.status-element b')).toHaveText('Dialogue');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(' for three hours!');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Dana stares.');

  // Compare with the draft.
  await page.getByRole('button', { name: 'Compare with now' }).click();
  const cmp = dialog(page);
  await expect(cmp.locator('.cmp-count.added')).toHaveText('+1 added');
  await expect(cmp.locator('.cmp-count.changed')).toHaveText('1 changed');
  await expect(cmp.locator('.cmp-changed ins')).toHaveText(' for three hours!');
  await expect(cmp.locator('.cmp-added')).toContainText('Dana stares.');
  await cmp.getByRole('button', { name: 'Close' }).click();

  // Revision marks: * beside the two changed lines, in the editor.
  await page.getByLabel('Revision marks').selectOption({ label: 'Changes since First Draft' });
  await expect(page.locator('.pl-rev-mark')).toHaveCount(2);
  await expect(page.locator('.rev-indicator')).toHaveText('* since First Draft');

  // Restore the draft; the rewrite is kept as an automatic draft.
  await page.locator('.draft', { hasText: 'First Draft' }).getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('button', { name: 'Restore', exact: true }).last().click();
  await expect(page.locator('.pl-editor')).not.toContainText('Dana stares.');
  await expect(page.locator('.pl-rev-mark')).toHaveCount(0);
  await expect(page.locator('.draft-name')).toHaveText(['Before restoring First Draft', 'First Draft']);

  // Branch the automatic draft into its own script.
  await page.locator('.draft', { hasText: 'Before restoring' }).getByRole('button', { name: 'New script from this' }).click();
  await expect(page.locator('.pl-editor')).toContainText('Dana stares.');
  await expect(page.locator('.draft')).toHaveCount(0);
  await library(page).click();
  await expect(dialog(page).locator('.script-list li')).toHaveCount(2);
});

test('a project backs up with its scripts and drafts, and imports as a copy', async ({ page }) => {
  // Put the pilot in a project and give it a draft.
  await library(page).click();
  await dialog(page).getByRole('button', { name: /New project/ }).click();
  await dialog(page).getByLabel('Project name').fill('Paper Trail');
  await dialog(page).getByRole('button', { name: 'Create' }).click();
  await dialog(page).getByRole('button', { name: /All scripts/ }).click();
  await dialog(page).getByLabel(/Project for PAPER TRAIL/).selectOption({ label: 'Paper Trail' });
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await page.getByRole('tab', { name: /Drafts/ }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();

  await library(page).click();
  await dialog(page).locator('.lib-folder', { hasText: 'Paper Trail' }).click();
  const download = page.waitForEvent('download');
  await dialog(page).getByRole('button', { name: /Back up project/ }).click();
  const file = await (await download).path();
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  expect(backup).toMatchObject({ app: 'punchline', kind: 'project', version: 2, project: { title: 'Paper Trail' } });
  expect(backup.scripts).toHaveLength(1);
  expect(backup.drafts).toHaveLength(1);

  // Importing it makes a second, independent project.
  const chooser = page.waitForEvent('filechooser');
  await dialog(page).getByRole('button', { name: /Import a file/ }).click();
  await (await chooser).setFiles({ name: 'Paper Trail.punchline', mimeType: 'application/json', buffer: readFileSync(file) });
  await expect(page.locator('.toast')).toHaveText('Imported the project “Paper Trail”');
  await page.getByRole('tab', { name: /Drafts/ }).click();
  await expect(page.locator('.draft-name')).toHaveText(['First Draft']);
  await library(page).click();
  await expect(dialog(page).locator('.lib-folder', { hasText: 'Paper Trail' })).toHaveCount(2);
  await expect(dialog(page).locator('.lib-folder', { hasText: 'All scripts' })).toContainText('2');
});
