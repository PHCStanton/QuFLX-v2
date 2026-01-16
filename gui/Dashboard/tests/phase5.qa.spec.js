import { test, expect } from '@playwright/test';

test.describe('Phase 5 QA smoke', () => {
  test('Backend down message', async ({ page }) => {
    await page.route('http://localhost:8000/**', (route) => route.abort());
    await page.route('http://127.0.0.1:8000/**', (route) => route.abort());
    await page.goto('/');

    await page.getByRole('button', { name: '1 Minute' }).click();
    await page.locator('div.absolute.z-50').getByText('5 Minutes', { exact: true }).click();

    const errorBar = page.locator('div').filter({ hasText: 'Network error' }).first();
    await expect(errorBar).toBeVisible({ timeout: 20_000 });
  });

  test('Empty market data stability (no crash banner)', async ({ page }) => {
    await page.goto('/');

    const errorBoundary = page.getByText('Something went wrong.');
    await expect(errorBoundary).toHaveCount(0);
    await expect(page.locator('#quflx-chart-screenshot-root')).toBeVisible();
  });

  test('Oscillator sync edge cases (no disposed errors on resize/unmount)', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');

    await page.getByRole('button', { name: '+ Indicator' }).click();
    await page.locator('div.absolute.z-50').getByText('RSI', { exact: true }).click();

    const badgeLabel = page.locator('span.text-accent-green.font-bold', { hasText: 'RSI' });
    await expect(badgeLabel).toBeVisible();
    const rsiBadge = badgeLabel.locator('..');

    const toggle = page.getByRole('button', { name: 'Toggle sidebar' });
    await toggle.click();
    await toggle.click();
    await toggle.click();

    await rsiBadge.locator('svg').last().click();

    await expect(page.locator('span.text-accent-green.font-bold', { hasText: 'RSI' })).toHaveCount(0);

    const banned = consoleErrors.filter((t) =>
      t.toLowerCase().includes('disposed') || t.toLowerCase().includes('value is null')
    );
    expect(banned, `Unexpected console errors: ${banned.join('\n')}`).toEqual([]);
  });

  test('Add/remove indicators (badge appears and removes)', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: '+ Indicator' }).click();
    await page.locator('div.absolute.z-50').getByText('RSI', { exact: true }).click();

    const badge = page.getByText('RSI', { exact: true }).first();
    await expect(badge).toBeVisible();

    const badgeContainer = badge.locator('..');
    await badgeContainer.locator('svg').last().click();
    await expect(page.getByText('RSI', { exact: true })).toHaveCount(0);
  });

  test('Screenshot capture (modal opens)', async ({ page }) => {
    await page.goto('/');

    await page.getByTitle('Capture chart screenshot').click();
    await expect(page.getByText('Chart Screenshot')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('Chart Screenshot')).toHaveCount(0);
  });

  test('Timeframe switching (1m → 5m)', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: '1 Minute' }).click();
    await page.locator('div.absolute.z-50').getByText('5 Minutes', { exact: true }).click();
    await expect(page.getByRole('button', { name: '5 Minutes' })).toBeVisible();
  });
});
