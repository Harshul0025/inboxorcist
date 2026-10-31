import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { defeatBoss, startDemo } from './helpers';

async function expectNoViolations(page: Page, screen: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${screen}: ${v.id} (${v.nodes.length})`)).toEqual([]);
}

test('every screen passes axe WCAG 2.2 AA checks', async ({ page }) => {
  await page.goto('/');
  await expectNoViolations(page, 'home');

  await page.getByRole('button', { name: 'Play demo' }).click();
  await expect(page.getByRole('heading', { name: 'The haunting' })).toBeVisible();
  await expectNoViolations(page, 'briefing');

  await page.getByRole('button', { name: 'Start exorcism' }).click();
  await expect(page.getByTestId('weak-spot')).toBeVisible();
  await expectNoViolations(page, 'boss');

  await defeatBoss(page);
  await expectNoViolations(page, 'seal');
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('heading', { name: 'Ghost wave' })).toBeVisible();
  await expectNoViolations(page, 'ghosts');

  await page.getByRole('button', { name: 'End run' }).click();
  await expect(page.getByTestId('roast')).toBeVisible();
  await expectNoViolations(page, 'end');
});

test('reduced motion keeps the weak spot still', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await startDemo(page);
  const spot = page.getByTestId('weak-spot');
  const before = await spot.getAttribute('style');
  await page.keyboard.press((await spot.getAttribute('aria-keyshortcuts')) ?? 'ArrowUp');
  await expect(spot).toHaveAttribute('style', before ?? '');
  await context.close();
});
