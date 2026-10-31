import { expect, test } from '@playwright/test';
import { defeatBoss, startDemo, trackErrors } from './helpers';

test('a demo run really clears mail, seals a sender and can be fully undone', async ({ page }) => {
  const errors = trackErrors(page);
  await startDemo(page);

  const counter = page.getByTestId('unread-counter');
  await expect(counter).toHaveText('2,000');

  await defeatBoss(page);
  await page.getByRole('button', { name: 'Seal forever' }).click();
  await expect(counter).not.toHaveText('2,000');

  await page.getByRole('button', { name: 'End run' }).click();
  await expect(page.getByRole('heading', { name: 'Exorcism complete' })).toBeVisible();
  await expect(page.getByTestId('roast')).toBeVisible();

  await page.getByRole('button', { name: /Resurrect/ }).click();
  await page.getByRole('button', { name: 'Yes, resurrect' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'restored to your inbox' })).toBeVisible();

  expect(errors).toEqual([]);
});

test('streamer mode blurs senders and subjects', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('checkbox', { name: 'Streamer mode' }).check();
  await page.getByRole('button', { name: 'Play demo' }).click();
  const bossName = page.locator('.sensitive').first();
  await expect(bossName).toBeVisible();
  await expect(bossName).toHaveCSS('filter', /blur/);
});
