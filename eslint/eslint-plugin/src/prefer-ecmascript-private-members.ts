// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

type MessageIds = 'use-ecmascript-private-member';
type Options = [];

const preferEcmascriptPrivateMembersRule: TSESLint.RuleModule<MessageIds, Options> = {
  defaultOptions: [],
  meta: {
    type: 'suggestion',
    messages: {
      'use-ecmascript-private-member':
        'Use ECMAScript private syntax ("#member") instead of the TypeScript "private" modifier.'
    },
    schema: [],
    docs: {
      description: 'Require ECMAScript private syntax for private class fields, methods, and accessors',
      recommended: 'recommended',
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    } as TSESLint.RuleMetaDataDocs
  },
  create: (context: TSESLint.RuleContext<MessageIds, Options>) => ({
    PropertyDefinition(node: TSESTree.PropertyDefinition): void {
      if (node.accessibility === 'private') {
        context.report({
          node,
          messageId: 'use-ecmascript-private-member'
        });
      }
    },
    MethodDefinition(node: TSESTree.MethodDefinition): void {
      if (node.accessibility === 'private' && node.kind !== 'constructor') {
        context.report({
          node,
          messageId: 'use-ecmascript-private-member'
        });
      }
    }
  })
};

export { preferEcmascriptPrivateMembersRule };
