import { expect, test } from '@playwright/test';

test.skip(process.env.RAID_E2E !== '1', 'Needs the Firebase emulators: run `npm run e2e:raid`');

test('a phone player joins, taps and archives the host’s mail', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const playerContext = await browser.newContext();
  const host = await hostContext.newPage();
  const player = await playerContext.newPage();

  await host.goto('/');
  await host.getByRole('button', { name: 'Host a demo raid' }).click();
  await host.getByRole('button', { name: 'Raid lobby' }).click();
  const code = (await host.getByTestId('room-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z]{4}$/);

  await player.goto(`/?room=${code}`);
  await player.getByRole('textbox', { name: 'Ghost-hunter nickname' }).fill('Asha');
  await player.getByRole('button', { name: 'Join raid' }).click();
  await expect(player.getByText(/Waiting for the host/)).toBeVisible();

  await expect(host.getByTestId('player-list')).toContainText('Asha');
  await host.getByRole('button', { name: 'Start the raid' }).click();

  const tap = player.getByRole('button', { name: 'Tap to attack the boss' });
  await expect(tap).toBeVisible();
  const hp = host.getByTestId('boss-hp');
  const before = await hp.textContent();
  for (let i = 0; i < 120; i += 1) await tap.click();
  await expect(hp).not.toHaveText(before ?? '');

  await host.getByRole('button', { name: 'End raid' }).click();
  await expect(host.getByText('1. Asha')).toBeVisible();
  await expect(player.getByText('The raid is over!')).toBeVisible();

  await hostContext.close();
  await playerContext.close();
});
