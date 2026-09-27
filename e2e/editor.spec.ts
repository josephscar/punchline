import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Element kinds and text, ignoring the editor's decorations (labels, page numbers, CONT'D). */
async function elements(page: Page) {
  return page.$$eval('.pl-editor > p', (ps) =>
    ps.map((p) => {
      const clone = p.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[contenteditable="false"]').forEach((w) => w.remove());
      return `${p.dataset.kind}: ${clone.textContent}`;
    }),
  );
}

async function suggestions(page: Page) {
  return page.$$eval('.ac-popup:not([hidden]) .ac-label', (els) => els.map((e) => e.textContent));
}

async function newBlankScript(page: Page) {
  await page.getByRole('button', { name: 'Library' }).click();
  await page.getByRole('button', { name: /Blank page/ }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('.pl-editor').click();
}

/** Click a suggestion in the autocomplete list. */
async function pick(page: Page, label: string) {
  await page.locator('.ac-popup:not([hidden]) .ac-item', { hasText: label }).first().click();
}

const status = (page: Page) => page.locator('.status-element b');

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.pl-editor')).toBeVisible();
  // Courier Prime swaps in after first paint; wait so clicks land where expected.
  await page.evaluate(() => document.fonts.ready);
  expect(errors).toEqual([]);
});

test('opens with the sample pilot and its structure in the navigator', async ({ page }) => {
  await expect(page.locator('.doc-title')).toHaveText('PAPER TRAIL — "Pilot"');
  await expect(page.locator('.nav-act-title')).toHaveText([/COLD OPEN/, /ACT ONE/]);
  await expect(page.locator('.nav-scene-heading').first()).toHaveText('INT. HOLLOWAY PAPER CO. - BULLPEN - DAY');
  // Acts start on new pages, so there is a page-2 marker before ACT ONE.
  await expect(page.locator('.pl-page-number')).toHaveText(['2.']);
  await expect(page.locator('.pl-contd').first()).toHaveText(" (CONT'D)");
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
});

test('Enter moves through single-cam elements and Tab cycles the element type', async ({ page }) => {
  await newBlankScript(page);
  const k = page.keyboard;
  await k.type('int. kitchen - night');
  await k.press('Enter'); // → Action (nothing is picked from the suggestions)
  await k.type('Dana stirs a pot.');
  await k.press('Enter'); // → another Action
  await k.press('Tab'); // Action → Character
  await expect(status(page)).toHaveText('Character');
  await k.type('DANA');
  await k.press('Enter'); // → Dialogue
  await k.type('Soup is ready!');
  await k.press('Enter'); // → Character
  await k.press('Alt+4'); // → Parenthetical (not in the Tab cycle)
  await k.type('beat');
  await k.press('Enter'); // → Dialogue
  await k.type('Anyone?');
  await k.press('Enter'); // → Character
  await k.press('Enter'); // empty Character → Action
  await k.type('Silence.');
  await k.press('Enter');
  await k.type('smash cut to:');
  await k.press('Enter'); // detected as a Transition → Scene Heading
  await k.type('ext.');
  expect(await elements(page)).toEqual([
    'scene_heading: int. kitchen - night',
    'action: Dana stirs a pot.',
    'character: DANA',
    'dialogue: Soup is ready!',
    'parenthetical: beat',
    'dialogue: Anyone?',
    'action: Silence.',
    'transition: smash cut to:',
    'scene_heading: ext.',
  ]);
  // Display is capitalised by the format.
  await expect(page.locator('.pl-el[data-kind="scene_heading"]').first()).toHaveCSS('text-transform', 'uppercase');
});

test('Tab cycles Scene Heading, Action, Character and Transition; Shift+Tab goes back', async ({ page }) => {
  await newBlankScript(page);
  const k = page.keyboard;
  await expect(status(page)).toHaveText('Scene Heading');
  await k.press('Tab');
  await expect(status(page)).toHaveText('Action');
  await k.type('Hello there');
  for (const expected of ['Character', 'Transition', 'Scene Heading', 'Action']) {
    await k.press('Tab');
    await expect(status(page)).toHaveText(expected);
  }
  await k.press('Shift+Tab');
  await expect(status(page)).toHaveText('Scene Heading');
  // Other elements come from the menu or Alt+number; Tab from them goes to Action.
  await k.press('Alt+5');
  await expect(status(page)).toHaveText('Dialogue');
  await k.press('Tab');
  await expect(status(page)).toHaveText('Action');
  expect(await elements(page)).toEqual(['action: Hello there']);
});

test('suggestions are never picked for you: click one, or use the arrows and Enter', async ({ page }) => {
  await newBlankScript(page);
  const k = page.keyboard;
  await k.type('INT. OFFICE - DAY');
  await k.press('Enter');
  await k.type('They argue.');
  await k.press('Enter');
  await k.press('Tab'); // → Character
  await k.type('PAM');
  await k.press('Enter');
  await k.type('No.');
  await k.press('Enter');
  await k.type('JIM');
  await k.press('Enter');
  await k.type('Yes.');
  await k.press('Enter');
  // Empty character line: PAM is predicted first (conversations alternate)…
  await expect.poll(() => suggestions(page)).toEqual(expect.arrayContaining(['PAM', 'JIM']));
  expect((await suggestions(page))[0]).toBe('PAM');
  await expect(page.locator('.ac-item.is-active')).toHaveCount(0);
  // …but Tab still just changes the element type.
  await k.press('Tab');
  await expect(status(page)).toHaveText('Transition');
  await k.press('Shift+Tab');
  await expect(status(page)).toHaveText('Character');
  expect((await elements(page)).at(-1)).toBe('character: ');
  // Click to choose.
  await pick(page, 'PAM');
  await k.press('Enter');
  await k.type('Fine.');
  await k.press('Enter');
  // Typing a prefix and pressing Enter keeps exactly what was typed.
  await k.type('JI');
  await expect.poll(() => suggestions(page)).toEqual(['JIM']);
  await k.press('Enter');
  expect((await elements(page)).slice(-2)).toEqual(['character: JI', 'dialogue: ']);
  await k.press('Backspace'); // back to the character line
  await k.press('ArrowDown'); // highlight JIM
  await expect(page.locator('.ac-item.is-active')).toHaveText(/JIM/);
  await k.press('Enter'); // use it and move on to dialogue
  await k.type('Great.');
  expect((await elements(page)).slice(-4)).toEqual(['character: PAM', 'dialogue: Fine.', 'character: JIM', 'dialogue: Great.']);
  // Names from the sample script are remembered across scripts.
  await k.press('Enter');
  await k.type('mar');
  await expect.poll(() => suggestions(page)).toEqual(['MARCUS']);
});

test('scene headings complete intro, location and time of day', async ({ page }) => {
  const k = page.keyboard;
  await page.locator('.pl-el[data-kind="action"]').first().click();
  await k.press('Control+End'); // end of the script: after END OF ACT ONE
  // The editor learns about caret moves asynchronously; wait until it has.
  await expect(status(page)).toHaveText('End of Act');
  await k.press('Enter'); // End of Act → New Act
  await k.type('act two');
  await k.press('Enter'); // New Act → Scene Heading
  await expect.poll(() => suggestions(page)).toEqual(['INT.', 'EXT.', 'INT./EXT.', 'EXT./INT.', 'I/E.']);
  await pick(page, 'INT.');
  await k.type('holl');
  await expect
    .poll(() => suggestions(page))
    .toEqual(['HOLLOWAY PAPER CO. - BREAK ROOM', 'HOLLOWAY PAPER CO. - BULLPEN', 'HOLLOWAY PAPER CO. - PARKING LOT']);
  await k.press('ArrowDown');
  await k.press('ArrowDown');
  await k.press('Enter'); // BULLPEN, chains on to the time of day
  await expect.poll(async () => (await suggestions(page)).slice(0, 2)).toEqual(['DAY', 'NIGHT']);
  await k.type('lat');
  await pick(page, 'LATER');
  await k.press('Enter');
  await k.type('The burrito is gone.');
  const els = await elements(page);
  expect(els.slice(-3)).toEqual(['act_start: act two', 'scene_heading: INT. HOLLOWAY PAPER CO. - BULLPEN - LATER', 'action: The burrito is gone.']);
  await expect(page.locator('.nav-act-title')).toHaveText([/COLD OPEN/, /ACT ONE/, /ACT TWO/]);
});

test('notes are created with [[ and listed, but never exported', async ({ page }) => {
  await newBlankScript(page);
  const k = page.keyboard;
  await k.type('INT. LAB - DAY');
  await k.press('Escape');
  await k.press('Enter');
  await k.type('[[Punch this up');
  await expect.poll(async () => (await elements(page)).slice(-1)).toEqual(['note: Punch this up']);
  await page.getByRole('tab', { name: /Notes/ }).click();
  await expect(page.locator('.nav-note-text')).toHaveText('Punch this up');

  await page.getByRole('button', { name: 'Export' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Fountain/ }).click();
  const file = await (await download).path();
  const text = readFileSync(file, 'utf8');
  expect(text).toContain('INT. LAB - DAY');
  expect(text).toContain('[[Punch this up]]');
});

test('exports a PDF and keeps work after a reload', async ({ page }) => {
  await page.locator('.pl-el[data-kind="action"]').first().click();
  await page.keyboard.press('Control+End');
  await expect(status(page)).toHaveText('End of Act');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Persistence works.');
  await page.waitForTimeout(1200); // autosave debounce
  await page.getByRole('button', { name: 'Export' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /PDF/ }).click();
  const pdf = readFileSync(await (await download).path());
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(20_000); // embeds Courier Prime

  await page.reload();
  await expect(page.locator('.pl-editor')).toContainText('Persistence works.');
});

test('title page, renaming a character and the cheat sheet', async ({ page }) => {
  await page.locator('.doc-title').click();
  await page.getByLabel('Episode title').fill('The Banner');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.doc-title')).toHaveText('PAPER TRAIL — "The Banner"');

  await page.getByRole('tab', { name: /Characters/ }).click();
  await page.getByRole('button', { name: 'Rename GARY' }).click();
  await page.getByLabel('New name').fill('Gus');
  await page.getByRole('button', { name: 'Rename everywhere' }).click();
  await expect(page.locator('.cast-name', { hasText: 'GUS' })).toBeVisible();
  const cues = (await elements(page)).filter((e) => e.startsWith('character:'));
  expect(cues).not.toContain('character: GARY');
  expect(cues).toContain('character: GUS');

  await page.locator('.pl-editor').click();
  await page.keyboard.press('Control+/');
  await expect(page.getByRole('heading', { name: 'Cheat sheet' })).toBeVisible();
});

test('pasting a script from another app keeps its elements', async ({ page }) => {
  await newBlankScript(page);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'EXT. ROOFTOP - NIGHT\n\nThey look at the stars.\n\nDANA\n(quietly)\nWe should go inside.\n\nCUT TO:');
    document.querySelector('.pl-editor')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  expect(await elements(page)).toEqual([
    'scene_heading: EXT. ROOFTOP - NIGHT',
    'action: They look at the stars.',
    'character: DANA',
    'parenthetical: quietly',
    'dialogue: We should go inside.',
    'transition: CUT TO:',
  ]);
});

test('scenes can be reordered by dragging them in the navigator', async ({ page }) => {
  const rows = page.locator('.nav-list li');
  await expect(rows).toHaveCount(3);
  // Drag the ACT ONE parking-lot scene to the top of the cold open.
  await rows.nth(2).dragTo(rows.nth(0));
  await expect(page.locator('.nav-scene-heading')).toHaveText([
    'EXT. HOLLOWAY PAPER CO. - PARKING LOT - MORNING',
    'INT. HOLLOWAY PAPER CO. - BULLPEN - DAY',
    'INT. HOLLOWAY PAPER CO. - BREAK ROOM - CONTINUOUS',
  ]);
  // Its action and dialogue travelled with it.
  const els = await elements(page);
  const at = els.indexOf('scene_heading: EXT. HOLLOWAY PAPER CO. - PARKING LOT - MORNING');
  expect(els[at + 1]).toMatch(/^action: Dana sprints across the lot/);
  expect(els[at - 1]).toBe('act_start: COLD OPEN');
});

test('arrow keys move through character names without getting caught by suggestions', async ({ page }) => {
  const cue = page.locator('.pl-el[data-kind="character"]').first();
  await cue.click();
  await page.keyboard.press('End');
  await expect(page.locator('.status-element b')).toHaveText('Character');
  await expect(page.locator('.ac-popup')).toBeHidden();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.status-element b')).toHaveText('Dialogue');
});

test('Alt + number switches the element type', async ({ page }) => {
  await newBlankScript(page);
  await expect(page.locator('.status-element b')).toHaveText('Scene Heading');
  await page.keyboard.press('Alt+3');
  await expect(page.locator('.status-element b')).toHaveText('Character');
  await page.keyboard.press('Alt+0');
  await expect(page.locator('.status-element b')).toHaveText('Note');
  await page.getByLabel('Element type').selectOption('transition');
  await expect(page.locator('.status-element b')).toHaveText('Transition');
});
