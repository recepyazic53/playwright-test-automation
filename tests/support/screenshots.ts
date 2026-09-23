import type { Page, TestInfo } from '@playwright/test';

export async function attachStepScreenshot(
  page: Page,
  testInfo: TestInfo,
  stepName: string
): Promise<void> {
  const screenshot = await page.screenshot({ fullPage: true });

  await testInfo.attach(stepName, {
    body: screenshot,
    contentType: 'image/png'
  });
}
