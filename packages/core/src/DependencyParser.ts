import { ImportResourcePath } from './ImportResourcePath';
import * as path from 'path';
import getDebugger from 'debug';
import { PACKAGE_NAME } from './packageName';

export class DependencyParser {
  private REGEX_NODE_MODULE = /^node:([\w\W\/]+)$/;

  public parseDependencies(param: {source: string, parent: ImportResourcePath | string}): ImportResourcePath[] {
    const { source, parent } = param;
    const debug = getDebugger(`${PACKAGE_NAME}:DependencyParser:parseDependencies`);
    const importRegex = /(import .+ from ?['"](?<importPath>.+?)['"])/g;
    debug({importRegex})
    const dynamicImportRegex = /(await import ?\(['"](?<importPath>.+?)['"]\))/g
    debug({dynamicImportRegex})
    const cjsRequireRegex = /(require ?\(['"](?<importPath>.+?)['"]\))/g
    debug({cjsRequireRegex})

    const matches = [
      ...source.matchAll(importRegex),
      ...source.matchAll(dynamicImportRegex),
      ...source.matchAll(cjsRequireRegex)
    ]
    debug({matches})
    const importPaths = matches.map(match => match.groups!.importPath)
    debug({importPaths})
    const result = importPaths.map(imp => this.resolvePath(imp, parent));
    debug({result})

    return result
  }

  private resolvePath(importPath: string, parent: ImportResourcePath | string): ImportResourcePath {
    const nodeImport = importPath.match(this.REGEX_NODE_MODULE);
    if (nodeImport) {
      return {
        kind: 'relative-in-package',
        packageName: '@types/node',
        importPath: `${nodeImport[1]}.d.ts`,
        sourcePath: '',
      };
    }

    if (typeof parent === 'string') {
      if (importPath.startsWith('.')) {
        return {
          kind: 'relative',
          importPath,
          sourcePath: parent,
        };
      } else if (importPath.startsWith('@')) {
        const segments = importPath.split('/');
        return {
          kind: 'package',
          packageName: `${segments[0]}/${segments[1]}`,
          importPath: segments.slice(2).join('/'),
        };
      } else {
        const segments = importPath.split('/');
        return {
          kind: 'package',
          packageName: segments[0],
          importPath: segments.slice(1).join('/'),
        };
      }
    } else {
      switch (parent.kind) {
        case 'package':
          throw Error('TODO?');
        case 'relative':
          throw Error('TODO2?');
        case 'relative-in-package':
          if (importPath.startsWith('.')) {
            return {
              kind: 'relative-in-package',
              packageName: parent.packageName,
              sourcePath: path.join(parent.sourcePath, parent.importPath),
              importPath: importPath,
            };
          } else if (importPath.startsWith('@')) {
            const segments = importPath.split('/');
            return {
              kind: 'package',
              packageName: `${segments[0]}/${segments[1]}`,
              importPath: segments.slice(2).join('/'),
            };
          } else {
            const segments = importPath.split('/');
            return {
              kind: 'package',
              packageName: segments[0],
              importPath: segments.slice(1).join('/'),
            };
          }
      }
    }
  }
}
