// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

type MessageIds = 'use-ecmascript-private-field';
type Options = [];

const preferEcmascriptPrivateFieldsRule: TSESLint.RuleModule<MessageIds, Options> = {
  defaultOptions: [],
  meta: {
    type: 'suggestion',
    messages: {
      'use-ecmascript-private-field':
        'Use an ECMAScript private field ("#field") instead of the TypeScript "private" modifier.'
    },
    schema: [],
    docs: {
      description: 'Require ECMAScript private fields instead of TypeScript private class fields',
      recommended: 'recommended',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    } as TSESLint.RuleMetaDataDocs
  },
  create: (context: TSESLint.RuleContext<MessageIds, Options>) => ({
    PropertyDefinition(node: TSESTree.PropertyDefinition): void {
      if (node.accessibility === 'private') {
        context.report({
          node,
          messageId: 'use-ecmascript-private-field'
        });
      }
    }
  })
};

export { preferEcmascriptPrivateFieldsRule };
