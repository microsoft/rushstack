// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as ts from 'typescript';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ESLintUtils } from '@typescript-eslint/utils';

import { PackletAnalyzer } from './PackletAnalyzer';
import { DependencyAnalyzer, type IPackletImport } from './DependencyAnalyzer';
import { Path } from './Path';

export type MessageIds = 'circular-import';
type Options = [];

const circularDeps: TSESLint.RuleModule<MessageIds, Options> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    messages: { 'circular-import': 'Packlet imports create a circular reference:\n{{report}}' },
    schema: [
      {
        type: 'object',
        additionalProperties: false
      }
    ],
    docs: {
      description: 'Check for circular dependencies between packlets',
      recommended: 'recommended',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin-packlets'
    } as TSESLint.RuleMetaDataDocs
  },

  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    // Example: /path/to/my-project/src/packlets/my-packlet/index.ts
    const inputFilePath: string = context.getFilename();

    // Example: /path/to/my-project/tsconfig.json
    const program: ts.Program = ESLintUtils.getParserServices(context).program;
    const tsconfigFilePath: string | undefined = program.getCompilerOptions().configFilePath as string;

    const packletAnalyzer: PackletAnalyzer = PackletAnalyzer.analyzeInputFile(
      inputFilePath,
      tsconfigFilePath
    );
    if (packletAnalyzer.nothingToDo) {
      return {};
    }

    return {
      // Match the first node in the source file.  Ideally we should be matching "Program > :first-child"
      // so a warning doesn't highlight the whole file.  But that's blocked behind a bug in the query selector:
      // https://github.com/estools/esquery/issues/114
      Program: (node: TSESTree.Node): void => {
        if (packletAnalyzer.isEntryPoint && !packletAnalyzer.error) {
          const packletImports: IPackletImport[] | undefined =
            DependencyAnalyzer.checkEntryPointForCircularImport(
              packletAnalyzer.inputFilePackletName!,
              packletAnalyzer,
              program
            );

          if (packletImports) {
            const tsconfigFileFolder: string = Path.dirname(tsconfigFilePath);

            const affectedPackletNames: string[] = packletImports.map((x) => x.packletName);

            // If 3 different packlets form a circular dependency, we don't need to report the same warning 3 times.
            // Instead, only report the warning for the alphabetically smallest packlet.
            affectedPackletNames.sort();
            if (affectedPackletNames[0] === packletAnalyzer.inputFilePackletName) {
              let report: string = '';
              for (const packletImport of packletImports) {
                const filePath: string = Path.relative(tsconfigFileFolder, packletImport.fromFilePath);
                report += `"${packletImport.packletName}" is referenced by ${filePath}\n`;
              }

              context.report({
                node: node,
                messageId: 'circular-import',
                data: { report: report }
              });
            }
          }
        }
      }
    };
  }
};

export { circularDeps };
