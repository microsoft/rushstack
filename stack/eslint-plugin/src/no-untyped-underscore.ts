// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  TSESTree,
  TSESLint,
  ParserServices
} from '@typescript-eslint/experimental-utils';
import * as ts from 'typescript';

type MessageIds = 'error-untyped-underscore';
type Options = [ ];

const noUntypedUnderscoreRule: TSESLint.RuleModule<MessageIds,Options> = {
  meta: {
    type: 'problem',
    messages: {
      'error-untyped-underscore':
        'This expression appears to access a private member "{{memberName}}"; '
        + 'either remove the underscore prefix or else declare a type for the containing object'
    },
    schema: [ ],
    docs: {
      description: 'Prevent TypeScript code from accessing legacy JavaScript members'
        + ' whose names have an underscore prefix',
      category: 'Stylistic Issues',
      recommended: false,
      url: 'https://www.npmjs.com/package/@rushstack/eslint-plugin'
    }
  },
  create: (context: TSESLint.RuleContext<MessageIds, Options>) => {

    const parserServices: ParserServices | undefined = context.parserServices;
    if (!parserServices ||
      !parserServices.program ||
      !parserServices.esTreeNodeToTSNodeMap) {
        throw new Error('This rule requires your ESLint configuration to define the "parserOptions.project"'
          + ' property for "@typescript-eslint/parser".',);
    }

    const typeChecker: ts.TypeChecker = parserServices.program.getTypeChecker();

    return {
      MemberExpression: function(node: TSESTree.MemberExpression) {
        // Is it an expression like "x.y"?

        // Ignore expressions such as "super.y", "this.y", and "that.y"
        const memberObject: TSESTree.LeftHandSideExpression = node.object;
        if (memberObject) {
          if (memberObject.type === 'Super' || memberObject.type === 'ThisExpression') {
            return; // no match
          }
          if (memberObject.type === 'Identifier') {
            if (memberObject.name === 'this' || memberObject.name == 'that') {
              return; // no match
            }
          }
        }

        // Does the member name start with an underscore?  (e.g. "x._y")
        if (node.property && node.property.type === 'Identifier') {
          const memberName: string = node.property.name;
          if (memberName && memberName[0] === '_') {

            // Do we have type information for the property (e.g. "_y")?
            //
            // Examples where propertyType is defined:
            //
            //    let x: { _y: any };
            //    let x: {
            //      _y: boolean;
            //      [key: string]: number;
            //    };
            //
            // Examples with propertyType=undefined:
            //    let x: any;
            //    let x: { [key: string]: number };
            //
            let propertyType: ts.Symbol | undefined = undefined;

            const memberObjectNode: ts.Node | undefined = parserServices.esTreeNodeToTSNodeMap!.get(node.object);
            if (memberObjectNode) {
              const memberObjectType: ts.Type | undefined = typeChecker.getTypeAtLocation(memberObjectNode);
              if (memberObjectType) {
                propertyType = memberObjectType.getProperty(memberName);
              }
            }

            // TypeScript's type system already sufficiently restricts access to private members.
            // Thus, this ESLint rule only considers untyped code such as a legacy JavaScript API.
            if (!propertyType) {
              context.report({
                node,
                messageId: 'error-untyped-underscore',
                data: { memberName: memberName }
              });
            }

          }
        }
      }
    };
  }
};

export { noUntypedUnderscoreRule };
