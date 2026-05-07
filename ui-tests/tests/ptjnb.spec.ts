import { expect, test, type Page } from '@playwright/test';

const FILE_BROWSER_TIMEOUT = 30000;
const CONVERT_TIMEOUT = 15000;

async function waitForFileBrowser(page: Page): Promise<void> {
  await page.waitForSelector('.jp-DirListing', {
    timeout: FILE_BROWSER_TIMEOUT
  });
}

function fileItem(page: Page, name: string) {
  return page.locator('.jp-DirListing-item').filter({ hasText: name }).first();
}

async function openNotebookSubmenu(page: Page, fileName: string): Promise<void> {
  await fileItem(page, fileName).click({ button: 'right' });
  await page
    .locator('.lm-Menu-itemLabel')
    .filter({ hasText: 'Convert to Notebook' })
    .hover();
}

async function openPlainTextSubmenu(page: Page, fileName: string): Promise<void> {
  await fileItem(page, fileName).click({ button: 'right' });
  await page
    .locator('.lm-Menu-itemLabel')
    .filter({ hasText: 'Convert to Plain Text' })
    .hover();
}

async function openWithNotebook(
  page: Page,
  fileName: string,
  factoryLabel: string
): Promise<void> {
  await fileItem(page, fileName).click({ button: 'right' });
  await page
    .locator('.lm-Menu-itemLabel')
    .filter({ hasText: 'Open With' })
    .hover();
  await page
    .locator('.lm-Menu-itemLabel')
    .filter({ hasText: factoryLabel })
    .click();
}

test.describe('ptjnb', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForFileBrowser(page);
  });

  test('auto-convert creates .ipynb files on startup', async ({ page }) => {
    await fileItem(page, 'percent').dblclick();
    await expect(fileItem(page, 'numpy_demo.ipynb')).toBeVisible({
      timeout: CONVERT_TIMEOUT
    });
    await expect(page).toHaveScreenshot('auto-convert-result.png');
  });

  test('right-click shows Convert to Notebook submenu for .py file', async ({
    page
  }) => {
    await fileItem(page, 'complicated.py').click({ button: 'right' });
    await expect(
      page
        .locator('.lm-Menu-itemLabel')
        .filter({ hasText: 'Convert to Notebook' })
    ).toBeVisible();
    await expect(page).toHaveScreenshot('context-menu.png');
  });

  test('converts .py to .ipynb when no sibling exists', async ({ page }) => {
    await openNotebookSubmenu(page, 'complicated.py');
    await page
      .locator('.lm-Menu-itemLabel')
      .filter({ hasText: 'Percent format (.py)' })
      .click();
    await expect(fileItem(page, 'complicated.ipynb')).toBeVisible({
      timeout: CONVERT_TIMEOUT
    });
    await expect(page).toHaveScreenshot('after-convert.png');
  });

  test('overwrite dialog appears when .ipynb already exists', async ({
    page
  }) => {
    await fileItem(page, 'percent').dblclick();
    await expect(fileItem(page, 'numpy_demo.ipynb')).toBeVisible({
      timeout: CONVERT_TIMEOUT
    });
    await openNotebookSubmenu(page, 'numpy_demo.py');
    await page
      .locator('.lm-Menu-itemLabel')
      .filter({ hasText: 'Percent format (.py)' })
      .click();
    await expect(page.locator('.jp-Dialog-header')).toContainText(
      'Overwrite notebook?'
    );
    await expect(page).toHaveScreenshot('overwrite-dialog.png');
  });

  test('cancel on overwrite dialog leaves notebook unchanged', async ({
    page
  }) => {
    await fileItem(page, 'percent').dblclick();
    await expect(fileItem(page, 'numpy_demo.ipynb')).toBeVisible({
      timeout: CONVERT_TIMEOUT
    });
    await openNotebookSubmenu(page, 'numpy_demo.py');
    await page
      .locator('.lm-Menu-itemLabel')
      .filter({ hasText: 'Percent format (.py)' })
      .click();
    await expect(page.locator('.jp-Dialog')).toBeVisible();
    await page.locator('.jp-Dialog-footer .jp-mod-reject').click();
    await expect(page.locator('.jp-Dialog')).toBeHidden();
    await expect(fileItem(page, 'numpy_demo.ipynb')).toBeVisible();
    await expect(page).toHaveScreenshot('after-cancel.png');
  });
});

test.describe('ptjnb open-with', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForFileBrowser(page);
  });

  test('Open With shows notebook factory for .py file', async ({ page }) => {
    const item = fileItem(page, 'complicated.py');
    await expect(item).toBeVisible({ timeout: FILE_BROWSER_TIMEOUT });
    await item.click({ button: 'right' });
    await page
      .locator('.lm-Menu-itemLabel')
      .filter({ hasText: 'Open With' })
      .hover();
    await expect(
      page
        .locator('.lm-Menu-itemLabel')
        .filter({ hasText: 'Notebook (Percent .py)' })
    ).toBeVisible();
  });

  test('opening percent .py as notebook shows notebook panel', async ({
    page
  }) => {
    await fileItem(page, 'percent').dblclick();
    await expect(fileItem(page, 'numpy_demo.py')).toBeVisible({
      timeout: FILE_BROWSER_TIMEOUT
    });
    await openWithNotebook(page, 'numpy_demo.py', 'Notebook (Percent .py)');

    await expect(page.locator('.jp-NotebookPanel-toolbar')).toBeVisible({
      timeout: CONVERT_TIMEOUT
    });
    await expect(page.locator('.jp-Cell').first()).toBeVisible({
      timeout: CONVERT_TIMEOUT
    });
  });

  test('opening sphinx gallery .py as notebook shows notebook panel', async ({
    page
  }) => {
    await fileItem(page, 'sphinx_gallery').dblclick();
    await expect(fileItem(page, 'image_processing.py')).toBeVisible({
      timeout: FILE_BROWSER_TIMEOUT
    });
    await openWithNotebook(
      page,
      'image_processing.py',
      'Notebook (Sphinx Gallery .py)'
    );

    await expect(page.locator('.jp-NotebookPanel-toolbar')).toBeVisible({
      timeout: CONVERT_TIMEOUT
    });
    await expect(page.locator('.jp-Cell').first()).toBeVisible({
      timeout: CONVERT_TIMEOUT
    });
  });

  test('opening classic markdown as notebook shows notebook panel', async ({
    page
  }) => {
    await fileItem(page, 'markdown').dblclick();
    await expect(fileItem(page, 'classic_demo.md')).toBeVisible({
      timeout: FILE_BROWSER_TIMEOUT
    });
    await openWithNotebook(
      page,
      'classic_demo.md',
      'Notebook (Classic Markdown .md)'
    );

    await expect(page.locator('.jp-NotebookPanel-toolbar')).toBeVisible({
      timeout: CONVERT_TIMEOUT
    });
    await expect(page.locator('.jp-Cell').first()).toBeVisible({
      timeout: CONVERT_TIMEOUT
    });
  });

  test('opening myst markdown as notebook shows notebook panel', async ({
    page
  }) => {
    await fileItem(page, 'myst').dblclick();
    await expect(fileItem(page, 'myst_demo.md')).toBeVisible({
      timeout: FILE_BROWSER_TIMEOUT
    });
    await openWithNotebook(page, 'myst_demo.md', 'Notebook (MyST .md)');

    await expect(page.locator('.jp-NotebookPanel-toolbar')).toBeVisible({
      timeout: CONVERT_TIMEOUT
    });
    await expect(page.locator('.jp-Cell').first()).toBeVisible({
      timeout: CONVERT_TIMEOUT
    });
  });
});

test.describe('ptjnb export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForFileBrowser(page);
  });

  test('right-click shows Convert to Plain Text submenu for .ipynb file', async ({
    page
  }) => {
    await fileItem(page, 'percent').dblclick();
    const ipynb = fileItem(page, 'numpy_demo.ipynb');
    await expect(ipynb).toBeVisible({ timeout: CONVERT_TIMEOUT });

    await ipynb.click({ button: 'right' });
    await expect(
      page
        .locator('.lm-Menu-itemLabel')
        .filter({ hasText: 'Convert to Plain Text' })
    ).toBeVisible();
  });

  test('converts .ipynb to .py via reverse conversion', async ({ page }) => {
    const pyFile = fileItem(page, 'complicated.py');
    await expect(pyFile).toBeVisible({ timeout: FILE_BROWSER_TIMEOUT });

    await openNotebookSubmenu(page, 'complicated.py');
    await page
      .locator('.lm-Menu-itemLabel')
      .filter({ hasText: 'Percent format (.py)' })
      .click();
    const ipynb = fileItem(page, 'complicated.ipynb');
    await expect(ipynb).toBeVisible({ timeout: CONVERT_TIMEOUT });

    await openPlainTextSubmenu(page, 'complicated.ipynb');
    await page
      .locator('.lm-Menu-itemLabel')
      .filter({ hasText: 'Percent format (.py)' })
      .click();

    await expect(page.locator('.jp-Dialog-header')).toContainText(
      'Overwrite file?'
    );
    await page.locator('.jp-Dialog-footer .jp-mod-accept').click();

    await expect(fileItem(page, 'complicated.py')).toBeVisible({
      timeout: CONVERT_TIMEOUT
    });
  });
});
