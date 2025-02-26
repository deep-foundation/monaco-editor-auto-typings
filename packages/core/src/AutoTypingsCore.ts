import { SourceCache } from './SourceCache';
import { Options } from './Options';
import { DummySourceCache } from './DummySourceCache';
import { UnpkgSourceResolver } from './UnpkgSourceResolver';
import { ImportResolver } from './ImportResolver';
import * as path from 'path';
import type * as monaco from 'monaco-editor';
import { invokeUpdate } from './invokeUpdate';
import { RecursionDepth } from './RecursionDepth';
import createDebugMessages from 'debug'
import { PACKAGE_NAME } from './packageName';

type Editor = monaco.editor.ICodeEditor | monaco.editor.IStandaloneCodeEditor;

export class AutoTypingsCore implements monaco.IDisposable {
  private static sharedCache?: SourceCache;
  private importResolver: ImportResolver;
  private debounceTimer?: number;
  private isResolving?: boolean;
  private disposables: monaco.IDisposable[];
  private options: Options;
  private editor: Editor;

  public constructor(param: {editor: Editor, options: Options}) {
    const debug = createDebugMessages(`${PACKAGE_NAME}:AutoTypingsCore:constructor`)
    debug({param})
    const { editor, options } = param;
    this.options = options;
    this.editor = editor;
    this.disposables = [];
    this.importResolver = new ImportResolver({options});
    const changeModelDisposable = editor.onDidChangeModelContent(e => {
      this.debouncedResolveContents();
    });
    this.disposables.push(changeModelDisposable);
    this.resolveContents();
    if (!options.dontAdaptEditorOptions) {
      options.monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        ...options.monaco.languages.typescript.typescriptDefaults.getCompilerOptions(),
        moduleResolution: options.monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        allowSyntheticDefaultImports: true,
        rootDir: options.fileRootPath,
      });
    }
  }

  public static async create(param: {editor: Editor, options?: Partial<Options>}): Promise<AutoTypingsCore> {
    const debug = createDebugMessages(`${PACKAGE_NAME}:AutoTypingsCore:create`)
    debug({param})
    const { editor, options } = param;

    if (options?.shareCache && options.sourceCache && !AutoTypingsCore.sharedCache) {
      AutoTypingsCore.sharedCache = options.sourceCache;
    }

    const monacoInstance = options?.monaco;
    debug({monacoInstance})

    if (!monacoInstance) {
      throw new Error('monacoInstance not found, you can specify the monaco instance via options.monaco');
    }

    return new AutoTypingsCore({
      editor,
      options: {
        fileRootPath: 'inmemory://model/',
        onlySpecifiedPackages: false,
        preloadPackages: false,
        shareCache: false,
        dontAdaptEditorOptions: false,
        dontRefreshModelValueAfterResolvement: false,
        sourceCache: AutoTypingsCore.sharedCache ?? new DummySourceCache(),
        sourceResolver: new UnpkgSourceResolver(),
        debounceDuration: 4000,
        fileRecursionDepth: 10,
        packageRecursionDepth: 3,
        monaco: monacoInstance
      } 
    });
  }

  public dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  public setVersions(versions: { [packageName: string]: string }) {
    this.importResolver.setVersions(versions);
    this.options.versions = versions;
  }

  public async clearCache() {
    await this.options.sourceCache.clear();
  }

  private debouncedResolveContents() {
    if (this.isResolving) {
      return;
    }

    invokeUpdate(
      {
        type: 'CodeChanged',
      },
      this.options
    );

    if (this.options.debounceDuration <= 0) {
      this.resolveContents();
    } else {
      if (this.debounceTimer !== undefined) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(async () => {
        await this.resolveContents();
        this.debounceTimer = undefined;
      }, this.options.debounceDuration) as any;
    }
  }

  private async resolveContents() {
    this.isResolving = true;
    invokeUpdate(
      {
        type: 'ResolveNewImports',
      },
      this.options
    );

    const model = this.editor.getModel();
    if (!model) {
      throw Error('No model');
    }

    const content = model.getLinesContent();

    try {
      await this.importResolver.resolveImportsInFile(
        content.join('\n'),
        path.dirname(model.uri.toString()),
        new RecursionDepth(this.options)
      );
    } catch (e) {
      if (this.options.onError) {
        this.options.onError((e as Error).message ?? e);
      } else {
        throw e;
      }
    }

    if (this.importResolver.wereNewImportsResolved()) {
      if (!this.options.dontRefreshModelValueAfterResolvement) {
        const currentPosition = this.editor.getPosition();
        model.setValue(model.getValue());
        if (currentPosition) {
          this.editor.setPosition(currentPosition);
        }
      }
      this.importResolver.resetNewImportsResolved();
    }

    this.isResolving = false;
  }
}
