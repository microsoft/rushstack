import { test } from './testFixture';
import { expect } from '@playwright/test';

test('woohoo!', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  const getStartedButton = page.getByRole('link', { name: 'Get started' });
  await expect(getStartedButton).toBeVisible();
  await expect(getStartedButton).toHaveAttribute('href', '/docs/intro');
  await getStartedButton.click();
});
