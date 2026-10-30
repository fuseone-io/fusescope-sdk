import { expect, test } from '@playwright/test';
import { logRecords, received, spans } from '../../browser/e2e/otlp';

test.beforeEach(async ({ request }) => {
  await request.get('/__reset');
});

test('named routes, navigation and a render error reach the RUM gateway', async ({ page, request }) => {
  await page.goto('/products/red-shoe?token=private');
  await page.getByRole('link', { name: 'Blue boot' }).click();
  await expect(page.getByRole('heading')).toHaveText('Product: blue-boot');
  await page.goBack();
  await expect(page.getByRole('heading')).toHaveText('Product: red-shoe');
  await page.getByRole('link', { name: 'Throw render error' }).click();
  await expect(page.getByRole('alert')).toHaveText('The example failed to render.');
  await page.getByRole('button', { name: 'Flush and stop RUM' }).click();
  await expect.poll(async () => spans(await received(request)).filter((s) => s.name === 'view').length).toBe(4);
  const data = await received(request);
  const views = spans(data).filter((s) => s.name === 'view');
  expect(views.map((s) => s.attributes['fusescope.rum.view.route'])).toEqual([
    '/products/:productId',
    '/products/:productId',
    '/products/:productId',
    '/broken',
  ]);
  expect(views.map((s) => s.attributes['fusescope.rum.view.loading_type'])).toEqual([
    'initial_load',
    'route_change',
    'route_change',
    'route_change',
  ]);
  const errors = logRecords(data).filter(
    (l) => l.eventName === 'exception' && l.attributes['fusescope.rum.error.source'] === 'manual',
  );
  expect(errors).toHaveLength(1);
  expect(errors[0]?.attributes).toMatchObject({
    'exception.type': 'Error',
    'exception.message': 'FuseScope React sample render error',
    'fusescope.rum.view.route': '/broken',
    'session.id': expect.stringMatching(/^[0-9a-f]{32}$/),
    'fusescope.rum.react.component_stack': expect.any(String),
  });
  expect(errors[0]?.resource).toMatchObject({ 'fusescope.rum.application.id': 'e2e-react' });
  expect(JSON.stringify(data.exports)).not.toContain('token=private');
});

test('consent gates both route views and render errors', async ({ page, request }) => {
  await page.goto('/products/red-shoe?consent=required');
  await page.getByRole('link', { name: 'Throw render error' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await received(request)).exports).toHaveLength(0);
  await page.getByRole('button', { name: 'Grant consent' }).click();
  await page.getByRole('link', { name: 'Blue boot' }).click();
  await page.getByRole('link', { name: 'Throw render error' }).click();
  await page.getByRole('button', { name: 'Flush and stop RUM' }).click();
  await expect
    .poll(
      async () =>
        logRecords(await received(request)).filter((l) => l.attributes['fusescope.rum.error.source'] === 'manual')
          .length,
    )
    .toBe(1);
});
