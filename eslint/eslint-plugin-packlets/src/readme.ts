// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as fs from 'node:fs';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ESLintUtils } from '@typescript-eslint/utils';

import { PackletAnalyzer } from './PackletAnalyzer';

export type MessageIds = 'missing-readme' | 'error-reading-file' | 'readme-too-short';
type Options = [
  {
    minimumReadmeWords?: number;
  }
];

const readme: TSESLint.RuleModule<MessageIds, Options> = {
  defaultOptions: [{}],
  meta: {
    type: 'problem',
    messages: {
      'missing-readme':
        'The ESLint configuration requires each packlet to provide a README.md file summarizing' +
        ' its purpose and usage: {{readmePath}}',
      'readme-too-short':
        'The ESLint configuration requires at least {{minimumReadmeWords}} words of documentation in the' +
        ' README.md file: {{readmePath}}',
      'error-reading-file': 'Error reading input file {{readmePath}}:\n{{errorMessage}}'
    },
    schema: [
      {
        type: 'object',
        properties: {
          minimumReadmeWords: {
            type: 'number'
          }
        },
        additionalProperties: false
      }
    ],

    docs: {
      description: 'Require each packlet folder to have a README.md file summarizing its purpose and usage',
      // Too strict to be recommended in the default configuration
      recommended: 'strict',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin-packlets'
    } as TSESLint.RuleMetaDataDocs
  },

  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {
    const minimumReadmeWords: number = context.options[0]?.minimumReadmeWords || 10;

    // Example: /path/to/my-project/src/packlets/my-packlet/index.ts
    const inputFilePath: string = context.getFilename();

    // Example: /path/to/my-project/tsconfig.json
    const tsconfigFilePath: string | undefined = ESLintUtils.getParserServices(
      context
    ).program.getCompilerOptions().configFilePath as string;

    const packletAnalyzer: PackletAnalyzer = PackletAnalyzer.analyzeInputFile(
      inputFilePath,
      tsconfigFilePath
    );

    if (!packletAnalyzer.nothingToDo && !packletAnalyzer.error) {
      if (packletAnalyzer.isEntryPoint) {
        return {
          Program: (node: TSESTree.Node): void => {
            const readmePath: string = path.join(
              packletAnalyzer.packletsFolderPath!,
              packletAnalyzer.inputFilePackletName!,
              'README.md'
            );
            try {
              if (!fs.existsSync(readmePath)) {
                context.report({
                  node: node,
                  messageId: 'missing-readme',
                  data: { readmePath }
                });
              } else {
                if (minimumReadmeWords > 0) {
                  const readmeContent: string = fs.readFileSync(readmePath).toString();
                  const words: string[] = readmeContent.split(/[^a-z'"]+/i).filter((x) => x.length > 0);
                  if (words.length < minimumReadmeWords) {
                    context.report({
                      node: node,
                      messageId: 'readme-too-short',
                      data: { readmePath, minimumReadmeWords }
                    });
                  }
                }
              }
            } catch (error) {
              context.report({
                node: node,
                messageId: 'error-reading-file',
                data: { readmePath, errorMessage: (error as Error).toString() }
              });
            }
          }
        };
      }
    }

    return {};
  }
};

export { readme };
