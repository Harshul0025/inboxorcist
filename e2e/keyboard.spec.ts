import { expect, test } from '@playwright/test';
import { defeatBoss, trackErrors } from './helpers';

test('the whole game is playable with the keyboard alone', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  // The app renders after its config loads; wait for it before tabbing.
  await expect(page.getByRole('button', { name: 'Play demo' })).toBeVisible();

  // Skip link is the first tab stop.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();

  const play = page.getByRole('button', { name: 'Play demo' });
  for (let i = 0; i < 10 && !(await play.evaluate((el) => el === document.activeElement)); i += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(play).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'The haunting' })).toBeFocused();
  const start = page.getByRole('button', { name: 'Start exorcism' });
  for (let i = 0; i < 10 && !(await start.evaluate((el) => el === document.activeElement)); i += 1) {
    await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Enter');

  await defeatBoss(page);
  await expect(page.getByRole('button', { name: 'Seal forever' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Ghost wave' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText(/Ghost 2 of/)).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText(/Ghost 3 of/)).toBeVisible();

  expect(errors).toEqual([]);
});
