import { test, expect } from '@playwright/test';

test('Beacon Network Routing Flow E2E', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Beacon/);
  
  // Check that the network mapping and status loads
  await expect(page.getByText('100% Offline Edge Intelligence Sentinel')).toBeVisible();
  
  // Interact with routing or node selection
  const routeButton = page.locator('button:has-text("Route"), button:has-text("Scan"), button:has-text("Peer")').first();
  if (await routeButton.count() > 0) {
    await routeButton.click();
  }
});