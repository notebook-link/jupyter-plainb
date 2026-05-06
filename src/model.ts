import { NotebookModel, NotebookModelFactory } from '@jupyterlab/notebook';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { Contents } from '@jupyterlab/services';
import type { ISharedNotebook } from '@jupyter/ydoc';
import type { Notebook } from 'plainb';
import { DEFAULT_KERNELSPEC, extractKernelspecFromText } from './convert';

/**
 * A custom NotebookModel that parses and serializes from/to plain text.
 */
export class PlainTextNotebookModel extends NotebookModel {
  constructor(
    options: NotebookModel.IOptions & {
      parser: (text: string) => object;
      serializer: (notebook: Notebook) => string;
    }
  ) {
    super(options);
    this._parser = options.parser;
    this._serializer = options.serializer;
  }

  toString(): string {
    const json = super.toJSON() as any;

    // Normalize cell sources to string[] as expected by plainb serializers.
    // NotebookModel.toJSON() returns source as a single string, but plainb's
    // joinSource() calls source.join("") which requires an array.
    if (json.cells) {
      for (const cell of json.cells) {
        if (typeof cell.source === 'string') {
          // Split into lines preserving trailing \n on each line
          // (the nbformat convention for multiline string arrays).
          // e.g. "a\nb\nc" → ["a\n", "b\n", "c"]
          const lines = cell.source.split('\n');
          cell.source = lines.map((line: string, i: number) =>
            i < lines.length - 1 ? line + '\n' : line
          );
          // Remove a trailing empty string produced if source ends with \n
          if (cell.source.length > 1 && cell.source[cell.source.length - 1] === '') {
            cell.source.pop();
          }
        }
      }
    }

    return this._serializer(json as unknown as Notebook);
  }

  fromString(value: string): void {
    const notebook = this._parser(value) as any;
    
    // Ensure kernelspec is set, otherwise default JupyterLab notebook widget might fail to start
    if (!notebook.metadata?.kernelspec) {
      notebook.metadata = notebook.metadata ?? {};
      const kernelspec =
        extractKernelspecFromText(value) ?? DEFAULT_KERNELSPEC;
      notebook.metadata.kernelspec = kernelspec;
      if (!notebook.metadata.language_info) {
        notebook.metadata.language_info = { name: kernelspec.language };
      }
    }

    super.fromJSON(notebook);
  }

  private _parser: (text: string) => object;
  private _serializer: (notebook: Notebook) => string;
}

/**
 * A custom NotebookModelFactory that tells the DocumentRegistry to load the file as plain text.
 */
export class PlainTextNotebookModelFactory extends NotebookModelFactory {
  constructor(
    options: NotebookModelFactory.IOptions & {
      name: string;
      parser: (text: string) => object;
      serializer: (notebook: Notebook) => string;
    }
  ) {
    super(options);
    this._name = options.name;
    this._parser = options.parser;
    this._serializer = options.serializer;
  }

  get name(): string {
    return this._name;
  }

  get contentType(): Contents.ContentType {
    return 'file'; // Crucial: load as plain text, not JSON
  }

  get fileFormat(): Contents.FileFormat {
    return 'text'; // Crucial: load as plain text, not JSON
  }

  createNew(
    options?: DocumentRegistry.IModelOptions<ISharedNotebook>
  ): PlainTextNotebookModel {
    return new PlainTextNotebookModel({
      ...options,
      parser: this._parser,
      serializer: this._serializer
    });
  }

  private _name: string;
  private _parser: (text: string) => object;
  private _serializer: (notebook: Notebook) => string;
}
