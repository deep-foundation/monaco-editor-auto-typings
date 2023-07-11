import { AutoTypingsCore } from './AutoTypingsCore';
import { Options } from './Options';
import type * as monaco from 'monaco-editor';
import getDebugger from 'debug';
import { PACKAGE_NAME } from './packageName';

type Editor = monaco.editor.ICodeEditor | monaco.editor.IStandaloneCodeEditor;

export class AutoTypings extends AutoTypingsCore {
  private constructor(param: {editor: Editor, options: Options}) {
    super(param);
  }

  public static async create(param: {editor: Editor, options?: Partial<Options>}): Promise<AutoTypingsCore> {
    const debug = getDebugger(`${PACKAGE_NAME}:AutoTypings:create`)
    const { editor, options } = param;
    return await AutoTypingsCore.create({
      editor,
      options: {
        monaco: options?.monaco ?? (await import('monaco-editor'))
      }
    });
  }
}
