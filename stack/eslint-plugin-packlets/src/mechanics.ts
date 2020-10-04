// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

import type { TSESLint, TSESTree } from '@typescript-eslint/experimental-utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/experimental-utils';
import { Path } from './Path';

import { ILintError } from './PackletImportAnalyzer';

export type MessageIds =
  | 'missing-tsconfig'
  | 'missing-src-folder'
  | 'packlet-folder-case'
  | 'invalid-packlet-name'
  | 'misplaced-packlets-folder'
  | 'bypassed-entry-point'
  | 'circular-entry-point'
  | 'packlet-importing-project-file'
  | 'circular-import'
  | 'debug';
type Options = [];

const validPackletName: RegExp = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export enum RefFileKind {
  Import,
  ReferenceFile,
  TypeReferenceDirective
}

interface RefFile {
  referencedFileName: string;
  kind: RefFileKind;
  index: number;
  file: string;
}

interface IResult {
  globalError: ILintError | undefined;
  skip: boolean;
  packletsEnabled: boolean;
  packletsFolderPath: string | undefined;
  packletName: string | undefined;
  isEntryPoint: boolean;
}

function f(inputFilePath: string, tsconfigFilePath: string | undefined): IResult {
  const result: IResult = {
    globalError: undefined,
    skip: false,
    packletsEnabled: false,
    packletsFolderPath: undefined,
    packletName: undefined,
    isEntryPoint: false
  };

  // Example: /path/to/my-project/src
  let srcFolderPath: string | undefined;

  if (!tsconfigFilePath) {
    result.globalError = { messageId: 'missing-tsconfig' };
    return result;
  }

  srcFolderPath = path.join(path.dirname(tsconfigFilePath), 'src');

  if (!fs.existsSync(srcFolderPath)) {
    result.globalError = { messageId: 'missing-src-folder', data: { srcFolderPath } };
    return result;
  }

  if (!Path.isUnder(inputFilePath, srcFolderPath)) {
    // Ignore files outside the "src" folder
    result.skip = true;
    return result;
  }

  // Example: packlets/my-packlet/index.ts
  const inputFilePathRelativeToSrc: string = path.relative(srcFolderPath, inputFilePath);

  // Example: [ 'packlets', 'my-packlet', 'index.ts' ]
  const pathParts: string[] = inputFilePathRelativeToSrc.split(/[\/\\]+/);

  let underPackletsFolder: boolean = false;

  const expectedPackletsFolder: string = path.join(srcFolderPath, 'packlets');

  for (let i = 0; i < pathParts.length; ++i) {
    const pathPart: string = pathParts[i];
    if (pathPart.toUpperCase() === 'PACKLETS') {
      if (pathPart !== 'packlets') {
        // Example: /path/to/my-project/src/PACKLETS
        const packletsFolderPath: string = path.join(srcFolderPath, ...pathParts.slice(0, i + 1));
        result.globalError = { messageId: 'packlet-folder-case', data: { packletsFolderPath } };
        return result;
      }

      if (i !== 0) {
        result.globalError = { messageId: 'misplaced-packlets-folder', data: { expectedPackletsFolder } };
        return result;
      }

      underPackletsFolder = true;
    }
  }

  if (underPackletsFolder || fs.existsSync(expectedPackletsFolder)) {
    // packletsAbsolutePath
    result.packletsEnabled = true;
    result.packletsFolderPath = expectedPackletsFolder;
  }

  if (underPackletsFolder && pathParts.length >= 2) {
    // Example: 'my-packlet'
    const packletName: string = pathParts[1];
    result.packletName = packletName;

    // Example: 'index.ts' or 'index.tsx'
    const thirdPart: string = pathParts[2];

    // Example: 'index'
    const thirdPartWithoutExtension: string = path.parse(thirdPart).name;

    if (thirdPartWithoutExtension.toUpperCase() === 'INDEX') {
      if (!validPackletName.test(packletName)) {
        result.globalError = { messageId: 'invalid-packlet-name', data: { packletName } };
        return result;
      }

      result.isEntryPoint = true;
    }
  }

  return result;
}

interface ILink {
  previous: ILink | undefined;
  packletName: string;
  fromFilePath: string;
}

function loop(
  packletName: string,
  startingPackletName: string,
  refFileMap: Map<string, RefFile[]>,
  program: ts.Program,
  packletsFolderPath: string,
  visitedPacklets: Set<string>,
  previousLink: ILink | undefined,
  context: TSESLint.RuleContext<MessageIds, Options>
): ILink | undefined {
  const packletEntryPoint: string = path.join(packletsFolderPath, packletName, 'index');

  const tsSourceFile: ts.SourceFile | undefined =
    program.getSourceFile(packletEntryPoint + '.ts') || program.getSourceFile(packletEntryPoint + '.tsx');
  if (tsSourceFile) {
    const refFiles: RefFile[] | undefined = refFileMap.get((tsSourceFile as any).path as any);
    if (refFiles) {
      for (const refFile of refFiles) {
        if (refFile.kind === RefFileKind.Import) {
          const referencingFilePath: string = refFile.file;

          if (Path.isUnder(referencingFilePath, packletsFolderPath)) {
            const referencingRelativePath: string = path.relative(packletsFolderPath, referencingFilePath);
            const referencingPathParts: string[] = referencingRelativePath.split(/[\/\\]+/);
            const referencingPackletName: string = referencingPathParts[0];

            if (!visitedPacklets.has(packletName)) {
              visitedPacklets.add(packletName);

              const link2: ILink = {
                previous: previousLink,
                fromFilePath: referencingFilePath,
                packletName: packletName
              };

              if (referencingPackletName === startingPackletName) {
                return link2;
              }

              const result: ILink | undefined = loop(
                referencingPackletName,
                startingPackletName,
                refFileMap,
                program,
                packletsFolderPath,
                visitedPacklets,
                link2,
                context
              );
              if (result) {
                return result;
              }
            }
          }
        }
      }
    }
  }
  return undefined;
}

const importPath: TSESLint.RuleModule<MessageIds, Options> = {
  meta: {
    type: 'problem',
    messages: {
      'missing-tsconfig':
        'In order to use @rushstack/eslint-plugin-packlets, your ESLint config file' +
        ' must configure the TypeScript parser',
      'missing-src-folder': 'Expecting to find a "src" folder at: {{srcFolderPath}}',
      'packlet-folder-case': 'The packlets folder must be all lower case: {{packletsFolderPath}}',
      'invalid-packlet-name':
        'Invalid packlet name "{{packletName}}".' +
        ' The name must be lowercase alphanumeric words separated by hyphens. Example: "my-packlet"',
      'misplaced-packlets-folder': 'The packlets folder must be located at "{{expectedPackletsFolder}}"',
      'bypassed-entry-point':
        'The import statement does not use the packlet\'s entry point "{{entryPointModulePath}}"',
      'circular-entry-point': 'Files under a packlet folder must not import from their own index.ts file',
      'packlet-importing-project-file':
        'A local project file cannot be imported.' +
        " A packlet's dependencies must be NPM packages and/or other packlets.",
      'circular-import': 'Packlet imports create a circular reference:\n{{report}}',
      debug: 'debug {{debug}}'
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false
      }
    ],
    docs: {
      description:
        'Requires regular expressions to be constructed from string constants rather than dynamically' +
        ' building strings at runtime.',
      category: 'Best Practices',
      recommended: 'warn',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin-packlets'
    }
  },

  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    // Example: /path/to/my-project/src/packlets/my-packlet/index.ts
    const inputFilePath: string = context.getFilename();

    // Example: /path/to/my-project/tsconfig.json
    const tsconfigFilePath: string | undefined = ESLintUtils.getParserServices(
      context
    ).program.getCompilerOptions()['configFilePath'] as string;

    const result: IResult = f(inputFilePath, tsconfigFilePath);
    if (result.skip) {
      return {};
    }
    if (result.globalError === undefined && !result.packletsEnabled) {
      return {};
    }

    return {
      // Match the first node in the source file.  Ideally we should be matching "Program > :first-child"
      // so a warning doesn't highlight the whole file.  But that's blocked behind a bug in the query selector:
      // https://github.com/estools/esquery/issues/114
      Program: (node: TSESTree.Node): void => {
        if (result.isEntryPoint && !result.globalError) {
          const visitedPacklets: Set<string> = new Set();
          const program: ts.Program | undefined = context.parserServices?.program;
          if (program) {
            const refFileMap: Map<string, RefFile[]> = (program as any).getRefFileMap();

            const resultLink: ILink | undefined = loop(
              result.packletName!,
              result.packletName!,
              refFileMap,
              program,
              result.packletsFolderPath!,
              visitedPacklets,
              undefined,
              context
            );

            if (resultLink) {
              const tsconfigFileFolder: string = path.dirname(tsconfigFilePath);

              let report: string = '';
              const affectedPackletNames: string[] = [];

              for (let current: ILink | undefined = resultLink; current; current = current.previous) {
                affectedPackletNames.push(current.packletName);
                const filePath: string = path.relative(tsconfigFileFolder, current.fromFilePath);
                report += `"${current.packletName}" is referenced by ${filePath}\n`;
              }

              // If 3 different packlets form a circular dependency, we don't need to report the same warning 3 times.
              // Instead, only report the warning for the alphabetically smallest packlet.
              affectedPackletNames.sort();
              if (affectedPackletNames[0] === result.packletName) {
                result.globalError = { messageId: 'circular-import', data: { report: report } };
              }
            }
          }
        }

        if (result.globalError) {
          context.report({
            node: node,
            messageId: result.globalError.messageId,
            data: result.globalError.data
          });
        }
      },

      // ImportDeclaration matches these forms:
      //   import { X } from '../../packlets/other-packlet';
      //   import X from '../../packlets/other-packlet';
      //   import type { X, Y } from '../../packlets/other-packlet';
      //   import * as X from '../../packlets/other-packlet';
      //
      // ExportNamedDeclaration matches these forms:
      //   export { X } from '../../packlets/other-packlet';
      //
      // ExportAllDeclaration matches these forms:
      //   export * from '../../packlets/other-packlet';
      //   export * as X from '../../packlets/other-packlet';
      'ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration': (
        node: TSESTree.ImportDeclaration | TSESTree.ExportNamedDeclaration | TSESTree.ExportAllDeclaration
      ): void => {
        if (node.source?.type === AST_NODE_TYPES.Literal) {
          if (result.packletsEnabled && result.packletsFolderPath) {
            // Extract the import/export module path
            // Example: "../../packlets/other-packlet"
            const modulePath = node.source.value;
            if (typeof modulePath !== 'string') {
              return;
            }

            if (!(modulePath.startsWith('.') || modulePath.startsWith('..'))) {
              // It's not a local import.

              // Examples:
              //   import { X } from "npm-package";
              //   import { X } from "raw-loader!./webpack-file.ts";
              return;
            }

            // Example: /path/to/my-project/src/packlets/my-packlet
            const inputFileFolder: string = path.dirname(inputFilePath);

            // Example: /path/to/my-project/src/other-packlet/index
            const importedPath: string = path.resolve(inputFileFolder, modulePath);

            // Is the imported path referring to a file under the src/packlets folder?
            if (Path.isUnder(importedPath, result.packletsFolderPath)) {
              // Example: other-packlet/index
              const importedPathRelativeToPackletsFolder: string = path.relative(
                result.packletsFolderPath,
                importedPath
              );
              // Example: [ 'other-packlet', 'index' ]
              const importedPathParts: string[] = importedPathRelativeToPackletsFolder.split(/[\/\\]+/);
              if (importedPathParts.length > 0) {
                // Example: 'other-packlet'
                const importedPackletName: string = importedPathParts[0];

                // We are importing from a packlet. Is the input file part of the same packlet?
                if (result.packletName && importedPackletName === result.packletName) {
                  // Yes.  Then our import must NOT use the packlet entry point.

                  // Example: 'index'
                  //
                  // We discard the file extension to handle a degenerate case like:
                  //   import { X } from "../index.js";
                  const lastPart: string = path.parse(importedPathParts[importedPathParts.length - 1]).name;
                  let pathToCompare: string;
                  if (lastPart.toUpperCase() === 'INDEX') {
                    // Example:
                    //   importedPath = /path/to/my-project/src/other-packlet/index
                    //   pathToCompare = /path/to/my-project/src/other-packlet
                    pathToCompare = path.dirname(importedPath);
                  } else {
                    pathToCompare = importedPath;
                  }

                  // Example: /path/to/my-project/src/other-packlet
                  const entryPointPath: string = path.join(result.packletsFolderPath, importedPackletName);

                  if (Path.isEqual(pathToCompare, entryPointPath)) {
                    context.report({
                      node: node,
                      messageId: 'circular-entry-point'
                    });
                  }
                } else {
                  // No.  If we are not part of the same packlet, then the module path must refer
                  // to the index.ts entry point.

                  // Example: /path/to/my-project/src/other-packlet
                  const entryPointPath: string = path.join(result.packletsFolderPath, importedPackletName);

                  if (!Path.isEqual(importedPath, entryPointPath)) {
                    const entryPointModulePath: string = path.posix.relative(
                      importedPackletName,
                      inputFileFolder
                    );

                    context.report({
                      node: node,
                      messageId: 'bypassed-entry-point',
                      data: { entryPointModulePath }
                    });
                  }
                }
              }
            } else {
              // The imported path does NOT refer to a file under the src/packlets folder
              if (result.packletName) {
                context.report({
                  node: node,
                  messageId: 'packlet-importing-project-file'
                });
              }
            }
          }
        }
      }
    };
  }
};

export { importPath };
