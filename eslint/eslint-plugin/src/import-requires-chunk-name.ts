// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESTree, TSESLint } from '@typescript-eslint/utils';

export const MESSAGE_ID_CHUNK_NAME: 'error-import-requires-chunk-name' = 'error-import-requires-chunk-name';
export const MESSAGE_ID_SINGLE_CHUNK_NAME: 'error-import-requires-single-chunk-name' =
  'error-import-requires-single-chunk-name';
type RuleModule = TSESLint.RuleModule<typeof MESSAGE_ID_CHUNK_NAME | typeof MESSAGE_ID_SINGLE_CHUNK_NAME, []>;
type RuleContext = TSESLint.RuleContext<
  typeof MESSAGE_ID_CHUNK_NAME | typeof MESSAGE_ID_SINGLE_CHUNK_NAME,
  []
>;

const importRequiresChunkNameRule: RuleModule = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    messages: {
      [MESSAGE_ID_CHUNK_NAME]:
        'Usage of "import(...)" for code splitting requires a /* webpackChunkName: \'...\' */ comment',
      [MESSAGE_ID_SINGLE_CHUNK_NAME]:
        'Usage of "import(...)" for code splitting cannot specify multiple /* webpackChunkName: \'...\' */ comments'
    },
    schema: [],
    docs: {
      description: 'Requires that calls to "import(...)" for code splitting include a Webpack chunk name',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    }
  },
  create: (context: RuleContext) => {
    const sourceCode: Readonly<TSESLint.SourceCode> = context.sourceCode;
    const webpackChunkNameRegex: RegExp = /^webpackChunkName\s*:\s*('[^']+'|"[^"]+")$/;

    return {
      ImportExpression: (node: TSESTree.ImportExpression) => {
        const nodeComments: TSESTree.Comment[] = sourceCode.getCommentsInside(node);
        const webpackChunkNameEntries: string[] = [];
        for (const comment of nodeComments) {
          const webpackChunkNameMatches: string[] = comment.value
            .split(',')
            .map((c) => c.trim())
            .filter((c) => !!c.match(webpackChunkNameRegex));
          webpackChunkNameEntries.push(...webpackChunkNameMatches);
        }

        if (webpackChunkNameEntries.length === 0) {
          context.report({ node, messageId: MESSAGE_ID_CHUNK_NAME });
        } else if (webpackChunkNameEntries.length !== 1) {
          context.report({ node, messageId: MESSAGE_ID_SINGLE_CHUNK_NAME });
        }
      }
    };
  }
};

export { importRequiresChunkNameRule };
