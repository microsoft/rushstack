// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as ts from 'typescript';
import * as path from 'path';

import type { TSESLint, TSESTree } from '@typescript-eslint/experimental-utils';
import { ESLintUtils } from '@typescript-eslint/experimental-utils';

import { analyze, IResult } from './PackletAnalyzer';
import { ILink, loopp } from './DependencyAnalyzer';

export type MessageIds = 'circular-import';
type Options = [];

const circularDeps: TSESLint.RuleModule<MessageIds, Options> = {
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
        if (result.isEntryPoint && !result.globalError) {
          const program: ts.Program | undefined = context.parserServices?.program;
          if (program) {
            const resultLink: ILink | undefined = loopp(result, program);

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
                context.report({
                  node: node,
                  messageId: 'circular-import',
                  data: { report: report }
                });
              }
            }
          }
        }
      }
    };
  }
};

export { circularDeps };
