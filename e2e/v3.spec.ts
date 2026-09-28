import { expect, test, type Page } from '@playwright/test';

const dialog = (page: Page) => page.locator('dialog[open]');

const CONSOLE_SNIPPET = `// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
const firebaseConfig = {
  apiKey: "AIzaSyFakeKeyForTests0000000000000000",
  authDomain: "my-show-12345.firebaseapp.com",
  projectId: "my-show-12345",
  storageBucket: "my-show-12345.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef0123456789"
};
const app = initializeApp(firebaseConfig);`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pl-editor')).toBeVisible();
});

test('cloud sync is set up by pasting a Firebase config, and remembered', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: 'Cloud sync: Sync' }).click();
  const cloud = dialog(page);
  await expect(cloud.getByRole('heading', { name: 'Cloud sync' })).toBeVisible();

  // The security rules to publish are one click away.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await cloud.getByRole('button', { name: 'Copy security rules' }).click();
  await expect(cloud.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('allow read: if signedIn()');

  await cloud.getByLabel('Firebase config').fill('not a config');
  await cloud.getByRole('button', { name: 'Connect' }).click();
  await expect(cloud.locator('.cloud-error')).toContainText('doesn’t look like a Firebase web config');

  await cloud.getByLabel('Firebase config').fill(CONSOLE_SNIPPET);
  await cloud.getByRole('button', { name: 'Connect' }).click();
  await expect(cloud.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect(cloud).toContainText('my-show-12345');

  // Still set up after a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Cloud sync: Sign in' }).click();
  await expect(dialog(page)).toContainText('my-show-12345');

  // …until you disconnect it.
  await dialog(page).getByRole('button', { name: 'Use a different Firebase project' }).click();
  await dialog(page).getByRole('button', { name: 'Disconnect' }).click();
  await expect(dialog(page).getByLabel('Firebase config')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cloud sync: Sync' })).toBeVisible();
  expect(errors).toEqual([]);
});
