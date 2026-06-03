import { test, expect } from '@playwright/test';

test('App loads successfully in demo mode', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Beacon/);
  
  // Verify that there are no unhandled server error templates loading
  const bodyText = await page.innerText('body');
  expect(bodyText).not.toContain('Unhandled Runtime Error');
  expect(bodyText).not.toContain('Internal Server Error');
});
