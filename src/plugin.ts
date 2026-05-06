import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import {
  showDialog,
  Dialog,
  createToolbarFactory,
  IToolbarWidgetRegistry
} from '@jupyterlab/apputils';
import { IFileBrowserFactory } from '@jupyterlab/filebrowser';
import { PageConfig } from '@jupyterlab/coreutils';
import { MenuSvg } from '@jupyterlab/ui-components';
import {
  PARSERS,
  PARSER_LABELS,
  PARSER_EXTENSIONS,
  SERIALIZERS,
  CONTEXT_MENU_LABELS
} from './parsers';
import type {
  ParserName,
  IPlainTextNotebookConfig,
  IKernelspec
} from './parsers';
import {
  convertFile,
  convertNotebookToPlainText,
  autoConvert
} from './convert';
import {
  INotebookTracker,
  NotebookPanel,
  NotebookTracker,
  NotebookWidgetFactory
} from '@jupyterlab/notebook';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { IEditorServices } from '@jupyterlab/codeeditor';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { PlainTextNotebookModelFactory } from './model';

/**
 * Setting ID for the notebook panel toolbar configuration.
 * We reuse the standard notebook toolbar settings so our panels
 * get the exact same toolbar items.
 */
const PANEL_SETTINGS = '@jupyterlab/notebook-extension:panel';

export const plugin: JupyterFrontEndPlugin<void> = {
  id: 'ptjnb:plugin',
  autoStart: true,
  requires: [
    IFileBrowserFactory,
    IRenderMimeRegistry,
    NotebookPanel.IContentFactory,
    IEditorServices,
    IToolbarWidgetRegistry
  ],
  optional: [INotebookTracker, ISettingRegistry, ITranslator],
  activate: async (
    app: JupyterFrontEnd,
    browserFactory: IFileBrowserFactory,
    rendermime: IRenderMimeRegistry,
    contentFactory: NotebookPanel.IContentFactory,
    editorServices: IEditorServices,
    toolbarRegistry: IToolbarWidgetRegistry,
    notebookTracker: INotebookTracker | null,
    settingRegistry: ISettingRegistry | null,
    translator: ITranslator | null
  ) => {
    const { commands, contextMenu } = app;

    const cfgStr = PageConfig.getOption('plainTextNotebookConfig');
    let cfg: IPlainTextNotebookConfig = {};
    try {
      cfg = cfgStr ? JSON.parse(cfgStr) : {};
    } catch {
      console.error('ptjnb: invalid plainTextNotebookConfig JSON');
    }
    const defaultKernelspec: IKernelspec | undefined = cfg.defaultKernelspec;

    const getCurrentBrowser = () => browserFactory.tracker.currentWidget;

    // Create the toolbar factory using the standard notebook toolbar
    // configuration. This reuses toolbar items registered under the
    // 'Notebook' factory name (save, cell type, kernel name, etc.).
    const toolbarFactory = settingRegistry
      ? createToolbarFactory(
          toolbarRegistry,
          settingRegistry,
          'Notebook',
          PANEL_SETTINGS,
          translator ?? nullTranslator
        )
      : undefined;

    let ptjnbId = 0;

    (Object.keys(PARSERS) as ParserName[]).forEach(parserName => {
      const convertCommandId = `ptjnb:convert-${parserName}`;
      const parser = PARSERS[parserName];
      const exts = PARSER_EXTENSIONS[parserName];
      const serializer = SERIALIZERS[parserName];

      // Names must be lowercase because preferredWidgetFactories is case sensitive
      const fileTypeName = `ptjnb-${parserName}`.toLowerCase();
      const modelName = `ptjnb-model-${parserName}`.toLowerCase();
      const widgetFactoryName = CONTEXT_MENU_LABELS[parserName];

      // Register file type so our widget factory appears in the "open with" menu
      app.docRegistry.addFileType({
        name: fileTypeName,
        extensions: exts,
        contentType: 'file',
        fileFormat: 'text'
      });

      app.docRegistry.addModelFactory(
        new PlainTextNotebookModelFactory({
          name: modelName,
          parser,
          serializer
        })
      );

      const widgetFactory = new NotebookWidgetFactory({
        name: widgetFactoryName,
        modelName,
        fileTypes: [fileTypeName],
        defaultFor: [],
        preferKernel: true,
        canStartKernel: true,
        rendermime,
        contentFactory,
        mimeTypeService: editorServices.mimeTypeService,
        toolbarFactory,
        translator: translator ?? nullTranslator
      });

      // Register each created panel with the notebook tracker.
      // Call inject() for the pool, then register with _focusTracker.
      widgetFactory.widgetCreated.connect((_sender, widget) => {
        widget.id = widget.id || `ptjnb-${++ptjnbId}`;
        widget.title.icon = undefined;

        if (notebookTracker) {
          const tracker = notebookTracker as NotebookTracker;
          tracker.inject(widget);
          (tracker as any)._focusTracker.add(widget);
        }
      });

      app.docRegistry.addWidgetFactory(
        widgetFactory as unknown as DocumentRegistry.WidgetFactory
      );

      // Copy any other widget extensions (e.g. TOC, search provider) from
      // the standard Notebook factory. Deferred until after app.restored.
      void app.restored.then(() => {
        for (const ext of app.docRegistry.widgetExtensions('Notebook')) {
          app.docRegistry.addWidgetExtension(widgetFactoryName, ext);
        }
      });

      commands.addCommand(convertCommandId, {
        label: PARSER_LABELS[parserName],
        isVisible: () => {
          const browser = getCurrentBrowser();
          if (!browser) {
            return false;
          }
          const selection = browser.selectedItems();
          const first = selection.next();
          if (first.done || !first.value) {
            return false;
          }
          return exts.some(ext => first.value.path.endsWith(ext));
        },
        execute: async () => {
          const browser = getCurrentBrowser();
          if (!browser) {
            return;
          }
          const selection = browser.selectedItems();
          const first = selection.next();
          if (first.done || !first.value) {
            return;
          }
          const filePath = first.value.path;
          const notebookPath = filePath.replace(/\.(py|md)$/, '.ipynb');
          const contents = app.serviceManager.contents;
          try {
            let fileExists = false;
            try {
              await contents.get(notebookPath, { content: false });
              fileExists = true;
            } catch {
              /* empty */
            }
            if (fileExists) {
              const result = await showDialog({
                title: 'Overwrite notebook?',
                body: `"${notebookPath}" already exists. Overwrite it?`,
                buttons: [
                  Dialog.cancelButton(),
                  Dialog.warnButton({ label: 'Overwrite' })
                ]
              });
              if (!result.button.accept) {
                return;
              }
            }
            await convertFile(contents, filePath, parser, defaultKernelspec);
          } catch (e) {
            console.error('ptjnb: conversion failed', e);
          }
        }
      });
    });

    const convertSubmenu = new MenuSvg({ commands });
    convertSubmenu.title.label = 'Convert to Notebook';
    convertSubmenu.addItem({ command: 'ptjnb:convert-parsePy' });
    convertSubmenu.addItem({ command: 'ptjnb:convert-parseSphinxGallery' });
    convertSubmenu.addItem({ command: 'ptjnb:convert-parseClassicMd' });
    convertSubmenu.addItem({ command: 'ptjnb:convert-parseMystMd' });

    contextMenu.addItem({
      type: 'submenu',
      submenu: convertSubmenu,
      selector: '.jp-DirListing-item[data-isdir="false"]',
      rank: 10
    });

    // Reverse conversion: .ipynb to plain text
    (Object.keys(SERIALIZERS) as ParserName[]).forEach(parserName => {
      const exportCommandId = `ptjnb:export-${parserName}`;
      const serializer = SERIALIZERS[parserName];
      const targetExt = PARSER_EXTENSIONS[parserName][0];

      commands.addCommand(exportCommandId, {
        label: PARSER_LABELS[parserName],
        isVisible: () => {
          const browser = getCurrentBrowser();
          if (!browser) {
            return false;
          }
          const selection = browser.selectedItems();
          const first = selection.next();
          if (first.done || !first.value) {
            return false;
          }
          return first.value.path.endsWith('.ipynb');
        },
        execute: async () => {
          const browser = getCurrentBrowser();
          if (!browser) {
            return;
          }
          const selection = browser.selectedItems();
          const first = selection.next();
          if (first.done || !first.value) {
            return;
          }
          const notebookPath = first.value.path;
          const plainPath = notebookPath.replace(/\.ipynb$/, targetExt);
          const contents = app.serviceManager.contents;
          try {
            let fileExists = false;
            try {
              await contents.get(plainPath, { content: false });
              fileExists = true;
            } catch {}
            if (fileExists) {
              const result = await showDialog({
                title: 'Overwrite file?',
                body: `"${plainPath}" already exists. Overwrite it?`,
                buttons: [
                  Dialog.cancelButton(),
                  Dialog.warnButton({ label: 'Overwrite' })
                ]
              });
              if (!result.button.accept) {
                return;
              }
            }
            await convertNotebookToPlainText(
              contents,
              notebookPath,
              serializer,
              targetExt
            );
          } catch (e) {
            console.error('ptjnb: export failed', e);
          }
        }
      });
    });

    const exportSubmenu = new MenuSvg({ commands });
    exportSubmenu.title.label = 'Convert to Plain Text';
    exportSubmenu.addItem({ command: 'ptjnb:export-parsePy' });
    exportSubmenu.addItem({ command: 'ptjnb:export-parseSphinxGallery' });
    exportSubmenu.addItem({ command: 'ptjnb:export-parseClassicMd' });
    exportSubmenu.addItem({ command: 'ptjnb:export-parseMystMd' });

    contextMenu.addItem({
      type: 'submenu',
      submenu: exportSubmenu,
      selector: '.jp-DirListing-item[data-isdir="false"]',
      rank: 11
    });

    if (cfg.rules?.length) {
      await autoConvert(
        app.serviceManager.contents,
        cfg.rules,
        defaultKernelspec
      );
    }
  }
};
