import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

fs.mkdirSync('qa', { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-qa-onboarding-'));

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  cwd: process.cwd(),
  env: { ...process.env, AURALIS_FORCE_PROD: '1' },
  timeout: 60000,
});
const page = await app.firstWindow({ timeout: 60000 });

const issues = [];
page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') issues.push(`[console] ${message.text()}`);
});

const checks = [];
function check(name, value, detail = '') {
  checks.push({ name, ok: Boolean(value), detail });
  console.log(`[${value ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function resize(width, height) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) return;
      window.unmaximize();
      window.setMinimumSize(320, 320);
      window.setBounds({ width: size[0], height: size[1] });
    },
    [width, height],
  );
  await page.waitForTimeout(650);
  await page
    .waitForFunction((size) => Math.abs(window.innerWidth - size[0]) < 8, [width, height], { timeout: 5000 })
    .catch(() => {});
}

try {
  await page.waitForSelector('.login-page', { timeout: 20000 });
  await page.locator('.login-guest-btn').click();
  await page.waitForSelector('.onboarding-page', { timeout: 20000 });
  await page.waitForTimeout(500);

  check('onboarding opens right after guest sign-in', await page.locator('.onboarding-page').isVisible());
  check(
    'step one asks which languages the listener uses',
    (await page.locator('.onboarding-copy h1').innerText()).includes('Which languages do you listen in'),
  );
  check('progress marks step one of two', (await page.locator('.onboarding-progress').innerText()).includes('Step 1 of 2'));

  const languageCount = await page.locator('.onboarding-language').count();
  check('curated language list is rendered', languageCount >= 12, `${languageCount} languages`);
  check(
    'Indian and global languages are both offered',
    (await page.locator('.onboarding-language', { hasText: 'हिन्दी' }).count()) === 1 &&
      (await page.locator('.onboarding-language', { hasText: '한국어' }).count()) === 1,
  );
  check('continue starts disabled until a language is picked', await page.locator('.onboarding-actions .btn-primary').isDisabled());

  await page.locator('.onboarding-language', { hasText: 'हिन्दी' }).click();
  await page.locator('.onboarding-language', { hasText: 'ਪੰਜਾਬੀ' }).click();
  check(
    'language cards toggle on with aria-pressed',
    (await page.locator('.onboarding-language[aria-pressed="true"]').count()) === 2,
  );
  check(
    'footer counts the selected languages',
    (await page.locator('.onboarding-selection').innerText()).includes('2 languages selected'),
  );
  check('continue enables after a language is picked', await page.locator('.onboarding-actions .btn-primary').isEnabled());

  await resize(1024, 680);
  check(
    'language step has no horizontal overflow at 1024x680',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  );
  check(
    'language footer stays visible at the minimum window',
    await page.locator('.onboarding-footer').isVisible(),
  );
  await page.screenshot({ path: 'qa/onboarding-languages.png' });

  await page.locator('.onboarding-actions .btn-primary').click();
  await page.waitForFunction(
    () => document.querySelector('.onboarding-copy h1')?.textContent?.includes('Who do you want on repeat'),
    undefined,
    { timeout: 10000 },
  );
  check('step two asks for artists', (await page.locator('.onboarding-copy h1').innerText()).includes('Who do you want on repeat'));
  check('progress marks step two of two', (await page.locator('.onboarding-progress').innerText()).includes('Step 2 of 2'));

  await page.waitForSelector('.onboarding-artist', { timeout: 60000 });
  await page.waitForTimeout(600);
  const artistCount = await page.locator('.onboarding-artist').count();
  check('real artists load for the selected languages', artistCount >= 8, `${artistCount} artists`);
  const firstArtistName = (await page.locator('.onboarding-artist-name').first().innerText()).trim();
  check('artist cards carry a real name', firstArtistName.length > 1, firstArtistName);
  check(
    'artist cards show artwork or a graceful fallback',
    (await page.locator('.onboarding-artist-art .artwork').count()) === artistCount,
  );

  for (let index = 0; index < 3; index += 1) {
    await page.locator('.onboarding-artist').nth(index).click();
  }
  check(
    'artists stay multi-selected',
    (await page.locator('.onboarding-artist[aria-pressed="true"]').count()) === 3,
  );
  check(
    'footer counts the artist picks',
    (await page.locator('.onboarding-selection').innerText()).includes('3 of 8 artists selected'),
  );

  await page.locator('.onboarding-search input').fill(firstArtistName);
  await page.waitForTimeout(300);
  const filtered = await page.locator('.onboarding-artist').count();
  check('artist search filters the loaded pool', filtered >= 1 && filtered < artistCount, `${filtered}/${artistCount}`);
  await page.locator('.onboarding-search input').fill('');
  await page.waitForTimeout(250);

  await resize(1024, 680);
  check(
    'artist step has no horizontal overflow at 1024x680',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  );
  await page.screenshot({ path: 'qa/onboarding-artists.png' });

  await page.locator('.onboarding-actions .btn-primary').click();
  await page.waitForSelector('.onboarding-page', { state: 'detached', timeout: 15000 });
  check('finishing onboarding returns to the app', await page.locator('.app-body').isVisible());

  const saved = await page.evaluate(() => window.auralis.settings.get());
  check(
    'language picks persist in settings',
    Array.isArray(saved.tasteLanguages) &&
      saved.tasteLanguages.includes('hindi') &&
      saved.tasteLanguages.includes('punjabi'),
    JSON.stringify(saved.tasteLanguages),
  );
  check('artist picks persist in settings', saved.tasteArtists?.length === 3, `${saved.tasteArtists?.length ?? 0} artists`);
  check('onboarding completion persists', saved.onboardingComplete === true);

  await page.waitForSelector('.home-hero', { timeout: 30000 });
  await page.waitForTimeout(700);
  const yourArtists = page.locator('.shelf', { hasText: 'Your artists' }).first();
  check('Home shows a Your artists shelf', await yourArtists.isVisible());
  check(
    'Home shelf explains the chosen languages',
    (await yourArtists.innerText()).includes('Hindi') && (await yourArtists.innerText()).includes('Punjabi'),
  );
  check('Home shelf contains the saved artist cards', (await yourArtists.locator('.media-card').count()) === 3);
  await page.screenshot({ path: 'qa/onboarding-home-artists.png' });

  await page.locator('.sidebar-item', { hasText: 'Settings' }).first().click();
  await page.waitForSelector('.settings-page', { timeout: 15000 });
  const preferencesCard = page.locator('.settings-card', { hasText: 'Music preferences' }).first();
  check('Settings exposes Music preferences', await preferencesCard.isVisible());
  check(
    'Settings summarizes the saved taste',
    (await preferencesCard.innerText()).includes('Hindi') &&
      (await preferencesCard.innerText()).includes('3 artists'),
  );
  await preferencesCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(4300);
  await page.screenshot({ path: 'qa/onboarding-settings.png' });
  await preferencesCard.getByRole('button', { name: 'Edit preferences' }).click();
  await page.waitForSelector('.onboarding-page', { timeout: 10000 });
  check('Edit preferences reopens onboarding', await page.locator('.onboarding-page').isVisible());
  check(
    'saved languages are preselected when editing',
    (await page.locator('.onboarding-language[aria-pressed="true"]').count()) === 2,
  );
  check('edit mode offers Close instead of Skip', (await page.locator('.onboarding-skip').innerText()).includes('Close'));

  await page.locator('.onboarding-actions .btn-primary').click();
  await page.waitForSelector('.onboarding-artist', { timeout: 60000 });
  await page.waitForTimeout(500);
  check(
    'saved artists are preselected when editing',
    (await page.locator('.onboarding-artist[aria-pressed="true"]').count()) === 3,
  );
  await page.locator('.onboarding-skip').click();
  await page.waitForSelector('.onboarding-page', { state: 'detached', timeout: 10000 });
  check('closing edit mode keeps the saved settings', (await page.locator('.app-body').isVisible()) === true);

  await page.evaluate(() => window.auralis.settings.get()).then((after) => {
    check(
      'closing edit mode did not erase picks',
      after.tasteLanguages.length === 2 && after.tasteArtists.length === 3,
    );
  });

  check('no renderer errors during onboarding', issues.length === 0, issues.join(' | '));
} catch (error) {
  issues.push(`[fatal] ${error?.message || error}`);
  console.error(error);
} finally {
  await app.close().catch(() => {});
}

fs.writeFileSync(
  'qa/onboarding-results.json',
  JSON.stringify({ checks, issues, passed: checks.filter((item) => item.ok).length, total: checks.length }, null, 2),
);
const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length || issues.length) process.exitCode = 1;
