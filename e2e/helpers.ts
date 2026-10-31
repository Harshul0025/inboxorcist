import { expect, type Page } from '@playwright/test';

/** Fails the test on any console error or uncaught exception, which also catches CSP violations. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

export async function startDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play demo' }).click();
  await page.getByRole('button', { name: 'Start exorcism' }).click();
  await expect(page.getByTestId('weak-spot')).toBeVisible();
}

/** Presses whatever arrow the weak spot asks for until the boss is defeated. */
export async function defeatBoss(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  for (let i = 0; i < 150 && !(await dialog.isVisible()); i += 1) {
    const spot = page.getByTestId('weak-spot');
    const key = await spot.getAttribute('aria-keyshortcuts', { timeout: 2000 }).catch(() => null);
    if (key) await page.keyboard.press(key);
    await page.waitForTimeout(40);
  }
  await expect(dialog).toBeVisible();
}
