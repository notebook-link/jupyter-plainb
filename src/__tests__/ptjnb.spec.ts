import { parsePy } from 'plainb';
import { PARSERS } from '../parsers';
import { convertIfMissing, extractKernelspecFromText, kernelspecFromLanguage } from '../convert';

describe('PARSERS registry', () => {
  it('contains all 4 parsers and each is a function', () => {
    expect(typeof PARSERS.parsePy).toBe('function');
    expect(typeof PARSERS.parseSphinxGallery).toBe('function');
    expect(typeof PARSERS.parseClassicMd).toBe('function');
    expect(typeof PARSERS.parseMystMd).toBe('function');
  });
});

describe('parsePy smoke test', () => {
  it('produces a valid nbformat 4.5 notebook with cell ids', () => {
    const nb = parsePy('# %%\nx = 1') as any;
    expect(nb.nbformat).toBe(4);
    expect(nb.nbformat_minor).toBe(5);
    expect(Array.isArray(nb.cells)).toBe(true);
    expect(nb.cells.length).toBeGreaterThan(0);
    for (const cell of nb.cells) {
      expect(typeof cell.id).toBe('string');
      expect(cell.id.length).toBeGreaterThan(0);
    }
  });
});

describe('convertIfMissing', () => {
  it('skips conversion when .ipynb already exists', async () => {
    const get = jest.fn().mockResolvedValue({});
    const save = jest.fn();
    const contents = { get, save } as any;
    const parser = jest.fn();

    await convertIfMissing(contents, 'notebooks/foo.py', parser);

    expect(get).toHaveBeenCalledWith('notebooks/foo.ipynb', { content: false });
    expect(parser).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('converts when .ipynb is missing', async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({ content: '# %%\nx = 1' });
    const save = jest.fn().mockResolvedValue({});
    const contents = { get, save } as any;
    const fakeNotebook = { nbformat: 4, cells: [] };
    const parser = jest.fn().mockReturnValue(fakeNotebook);

    await convertIfMissing(contents, 'notebooks/foo.py', parser);

    expect(parser).toHaveBeenCalledWith('# %%\nx = 1');
    expect(save).toHaveBeenCalledWith('notebooks/foo.ipynb', {
      type: 'notebook',
      format: 'json',
      content: fakeNotebook
    });
  });
});

// ---------------------------------------------------------------------------
// extractKernelspecFromText
// ---------------------------------------------------------------------------

describe('extractKernelspecFromText', () => {
  it('returns null when there is no header', () => {
    expect(extractKernelspecFromText('# %%\nx = 1\n')).toBeNull();
  });

  it('returns null when header is unclosed', () => {
    const text = '---\nkernelspec:\n  name: python3';
    expect(extractKernelspecFromText(text)).toBeNull();
  });

  it('parses YAML front matter with nested kernelspec block', () => {
    const text = [
      '---',
      'kernelspec:',
      '  name: python3',
      '  display_name: Python 3',
      '  language: python',
      '---',
      '# %% ',
      'x = 1'
    ].join('\n');
    const ks = extractKernelspecFromText(text);
    expect(ks).not.toBeNull();
    expect(ks!.name).toBe('python3');
    expect(ks!.display_name).toBe('Python 3');
    expect(ks!.language).toBe('python');
  });

  it('parses commented # --- front matter with nested kernelspec block', () => {
    const text = [
      '# ---',
      '# kernelspec:',
      '#   name: ir',
      '#   display_name: R',
      '#   language: r',
      '# ---',
      '# %%',
      'x <- 1'
    ].join('\n');
    const ks = extractKernelspecFromText(text);
    expect(ks).not.toBeNull();
    expect(ks!.name).toBe('ir');
    expect(ks!.language).toBe('r');
  });

  it('returns null when kernelspec block is missing name', () => {
    const text = [
      '---',
      'kernelspec:',
      '  display_name: Python 3',
      '  language: python',
      '---'
    ].join('\n');
    expect(extractKernelspecFromText(text)).toBeNull();
  });

  it('returns null when there is no kernelspec key at all', () => {
    const text = '---\ntitle: My Notebook\n---\n# %%\nx = 1';
    expect(extractKernelspecFromText(text)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// kernelspecFromLanguage
// ---------------------------------------------------------------------------

describe('kernelspecFromLanguage', () => {
  it('returns null when specs is null', () => {
    expect(kernelspecFromLanguage(null, 'python')).toBeNull();
  });

  it('returns null when no kernel matches the language', () => {
    const specs = {
      default: 'python3',
      kernelspecs: {
        python3: { name: 'python3', display_name: 'Python 3', language: 'python', argv: [], resources: {} }
      }
    } as any;
    expect(kernelspecFromLanguage(specs, 'r')).toBeNull();
  });

  it('prefers the default kernel when it matches the language', () => {
    const specs = {
      default: 'python3',
      kernelspecs: {
        python3: { name: 'python3', display_name: 'Python 3', language: 'python', argv: [], resources: {} },
        xpython: { name: 'xpython', display_name: 'XPython', language: 'python', argv: [], resources: {} }
      }
    } as any;
    const ks = kernelspecFromLanguage(specs, 'python');
    expect(ks).not.toBeNull();
    expect(ks!.name).toBe('python3');
  });

  it('falls back to a non-default kernel when default does not match', () => {
    const specs = {
      default: 'python3',
      kernelspecs: {
        python3: { name: 'python3', display_name: 'Python 3', language: 'python', argv: [], resources: {} },
        ir: { name: 'ir', display_name: 'R', language: 'r', argv: [], resources: {} }
      }
    } as any;
    const ks = kernelspecFromLanguage(specs, 'r');
    expect(ks).not.toBeNull();
    expect(ks!.name).toBe('ir');
    expect(ks!.language).toBe('r');
  });

  it('is case-insensitive for the language string', () => {
    const specs = {
      default: 'ir',
      kernelspecs: {
        ir: { name: 'ir', display_name: 'R', language: 'R', argv: [], resources: {} }
      }
    } as any;
    const ks = kernelspecFromLanguage(specs, 'r');
    expect(ks).not.toBeNull();
    expect(ks!.name).toBe('ir');
  });

  it('returns null for empty kernelspecs object', () => {
    const specs = { default: '', kernelspecs: {} } as any;
    expect(kernelspecFromLanguage(specs, 'python')).toBeNull();
  });
});
