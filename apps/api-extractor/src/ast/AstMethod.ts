// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { Text } from '@microsoft/node-core-library';

import { IParsedPackageName } from '@microsoft/node-core-library';
import { AstItem, AstItemKind, IAstItemOptions } from './AstItem';
import { AstMember } from './AstMember';
import { AstParameter } from './AstParameter';
import { TypeScriptHelpers } from '../utils/TypeScriptHelpers';
import { Markup } from '../markup/Markup';

/**
 * This class is part of the AstItem abstract syntax tree. It represents functions that are members of
 * classes, interfaces, or nested type literal expressions. Unlike AstFunctions, AstMethods can have
 * access modifiers (public, private, etc.) or be optional, because they are members of a structured type
 *
 * @see AstFunction for functions that are defined inside of a package
 */
export class AstMethod extends AstMember {
  public readonly returnType: string;
  public readonly params: AstParameter[];

  constructor(options: IAstItemOptions) {
    super(options);

    // tslint:disable-next-line:no-bitwise
    if ((options.declarationSymbol.flags & ts.SymbolFlags.Constructor) !== 0) {
      this.kind = AstItemKind.Constructor;
    } else {
      this.kind = AstItemKind.Method;
    }

    const methodDeclaration: ts.MethodDeclaration = options.declaration as ts.MethodDeclaration;

    // Parameters
    if (methodDeclaration.parameters) {
      this.params = [];
      for (const param of methodDeclaration.parameters) {
        const declarationSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(param);
        const astParameter: AstParameter = new AstParameter({
          context: this.context,
          declaration: param,
          declarationSymbol: declarationSymbol
        });

        this.innerItems.push(astParameter);
        this.params.push(astParameter);
      }
    }

    // Return type
    if (this.kind !== AstItemKind.Constructor) {
      if (methodDeclaration.type) {
        this.returnType = Text.convertToLf(methodDeclaration.type.getText());
      } else {
        this.returnType = 'any';
        this.hasIncompleteTypes = true;
      }
    }
  }

  protected onCompleteInitialization(): void {
    super.onCompleteInitialization();

    // If this is a class constructor, and if the documentation summary was omitted, then
    // we fill in a default summary versus flagging it as "undocumented".
    // Generally class constructors have uninteresting documentation.
    if (this.kind === AstItemKind.Constructor && this.parentContainer) {
      if (this.documentation.summary.length === 0) {
        this.documentation.summary.push(
          ...Markup.createTextElements('Constructs a new instance of the '));

        const parsedPackageName: IParsedPackageName = this.context.parsedPackageName;

        const parentParentContainer: AstItem | undefined = this.parentContainer.parentContainer;
        if (parentParentContainer && parentParentContainer.kind === AstItemKind.Namespace) {
          // This is a temporary workaround to support policies.namespaceSupport === permissive
          // until the new AstSymbolTable engine is wired up
          this.documentation.summary.push(
            Markup.createApiLinkFromText(this.parentContainer.name, {
                scopeName: parsedPackageName.scope,
                packageName: parsedPackageName.unscopedName,
                exportName: parentParentContainer.name,
                memberName: this.parentContainer.name
              }
            )
          );
        } else {
          this.documentation.summary.push(
            Markup.createApiLinkFromText(this.parentContainer.name, {
                scopeName: parsedPackageName.scope,
                packageName: parsedPackageName.unscopedName,
                exportName: this.parentContainer.name,
                memberName: ''
              }
            )
          );
        }

        this.documentation.summary.push(...Markup.createTextElements(' class'));
      }
      this.needsDocumentation = false;
    }
  }
}
