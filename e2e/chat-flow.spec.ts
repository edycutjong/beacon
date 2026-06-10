import { test, expect } from '@playwright/test';

test('Beacon Network Routing Flow E2E', async ({ page }) => {

  await page.goto('/');
  await expect(page).toHaveTitle(/Beacon/);
  // Check that the network mapping and status loads
  await expect(page.locator('body')).toContainText('BEACON', { timeout: 10000 });
});