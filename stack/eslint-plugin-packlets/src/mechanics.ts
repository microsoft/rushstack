// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import type { TSESLint, TSESTree } from '@typescript-eslint/experimental-utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/experimental-utils';
import { Path } from './Path';

import { analyze, IResult, MyMessageIds } from './PackletImportAnalyzer';

export type MessageIds =
  | MyMessageIds
  | 'bypassed-entry-point'
  | 'circular-entry-point'
  | 'packlet-importing-project-file';
type Options = [];

const mechanics: TSESLint.RuleModule<MessageIds, Options> = {
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
        " A packlet's dependencies must be NPM packages and/or other packlets."
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false
      }
    ],
    docs: {
      description: '',
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

    const result: IResult = analyze(inputFilePath, tsconfigFilePath);
    if (result.skip) {
      return {};
    }

    return {
      // Match the first node in the source file.  Ideally we should be matching "Program > :first-child"
      // so a warning doesn't highlight the whole file.  But that's blocked behind a bug in the query selector:
      // https://github.com/estools/esquery/issues/114
      Program: (node: TSESTree.Node): void => {
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

export { mechanics };
