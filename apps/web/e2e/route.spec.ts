import { expect, test } from '@playwright/test';

// Runs on the browser demo: signing a plan must turn it into a route with readiness on every stage.
test('подписанный план превращается в маршрут', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /^Врач/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));

  await page.goto('/patients/seed-patient-anna');
  await expect(page.getByRole('heading', { name: 'Маршрута пока нет' })).toBeVisible();

  await page.getByRole('button', { name: 'Открыть план' }).click();
  await page.getByRole('button', { name: 'Показать' }).click();
  await page.waitForURL(/\/present\//);
  await page.getByRole('button', { name: 'Подпись' }).click();

  const pad = page.locator('canvas').first();
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 20, { steps: 8 });
  await page.mouse.move(box.x + box.width - 20, box.y + 20, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Согласен' }).click();
  await expect(page.getByText('План принят')).toBeVisible();

  await page.goto('/patients/seed-patient-anna');
  await page.getByRole('button', { name: 'Маршрут' }).click();
  const route = page.getByRole('region', { name: 'Маршрут лечения' });
  await expect(route.getByRole('heading', { name: 'Санация' })).toBeVisible();
  await expect(route.getByRole('heading', { name: 'Ортопедия' })).toBeVisible();
  await expect(route.getByText('Материалы · В резерве')).toBeVisible();
  await expect(route.getByText('Лаборатория: Коронка керамическая')).toBeVisible();
  await expect(route.getByText(/Оплата · .* к визиту/).first()).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Сводка маршрута' }).getByText('Следующий шаг')).toBeVisible();
});
