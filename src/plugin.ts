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
import { convertFile, autoConvert } from './convert';
import {
  INotebookTracker,
  NotebookPanel,
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
        new PlainTextNotebookModelFactory({ name: modelName, parser, serializer })
      );

      const widgetFactory = new NotebookWidgetFactory({
        name: widgetFactoryName,
        modelName,
        fileTypes: [fileTypeName],
        defaultFor: [],
        rendermime,
        contentFactory,
        mimeTypeService: editorServices.mimeTypeService,
        toolbarFactory
      });

      // Inject each created panel into the notebook tracker so that
      // all standard notebook commands (run cell, insert cell, cut/paste,
      // keyboard shortcuts, etc.) recognise it as the active notebook.
      // inject() is used instead of add() to avoid interfering with the
      // standard notebook's save/restore logic.
      widgetFactory.widgetCreated.connect((_sender, widget) => {
        widget.id = widget.id || `ptjnb-${++ptjnbId}`;
        widget.title.icon = undefined;

        if (notebookTracker) {
          notebookTracker.inject(widget);
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

    if (cfg.rules?.length) {
      await autoConvert(
        app.serviceManager.contents,
        cfg.rules,
        defaultKernelspec
      );
    }
  }
};
