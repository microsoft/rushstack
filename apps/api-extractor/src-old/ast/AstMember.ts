// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { Text } from '@microsoft/node-core-library';
import { AstItem, IAstItemOptions } from './AstItem';
import { AstStructuredType } from './AstStructuredType';
import { PrettyPrinter } from '../utils/PrettyPrinter';
import { TypeScriptHelpers } from '../utils/TypeScriptHelpers';

export enum ApiAccessModifier {
  Private,
  Protected,
  Public
}

/**
 * This class is part of the AstItem abstract syntax tree.  It represents syntax following
 * these types of patterns:
 *
 * - "someName: SomeTypeName;"
 * - "someName?: SomeTypeName;"
 * - "someName: { someOtherName: SomeOtherTypeName }", i.e. involving a type literal expression
 * - "someFunction(): void;"
 *
 * AstMember is used to represent members of classes, interfaces, and nested type literal expressions.
 */
export class AstMember extends AstItem {
  public accessModifier: ApiAccessModifier;
  /**
   * True if the member is an optional field value, indicated by a question mark ("?") after the name
   */
  public isOptional: boolean;
  public isStatic: boolean;

  /**
   * The type of the member item, if specified as a type literal expression.  Otherwise,
   * this field is undefined.
   */
  public typeLiteral: AstStructuredType | undefined;

  constructor(options: IAstItemOptions) {
    super(options);

    this.typeLiteral = undefined;

    const memberSignature: ts.PropertySignature = this.declaration as ts.PropertySignature;

    this.isOptional = !!memberSignature.questionToken;

    // Modifiers
    if (memberSignature.modifiers) {
      for (const modifier of memberSignature.modifiers) {
        if (modifier.kind === ts.SyntaxKind.PublicKeyword) {
          this.accessModifier = ApiAccessModifier.Public;
        } else if (modifier.kind === ts.SyntaxKind.ProtectedKeyword) {
          this.accessModifier = ApiAccessModifier.Protected;
        } else if (modifier.kind === ts.SyntaxKind.PrivateKeyword) {
          this.accessModifier = ApiAccessModifier.Private;
        } else if (modifier.kind === ts.SyntaxKind.StaticKeyword) {
          this.isStatic = true;
        }
      }
    }

    if (memberSignature.type && memberSignature.type.kind === ts.SyntaxKind.TypeLiteral) {
      const propertyTypeDeclaration: ts.Declaration = memberSignature.type as ts.Node as ts.Declaration;
      const propertyTypeSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(propertyTypeDeclaration);

      const typeLiteralOptions: IAstItemOptions = {
        context: this.context,
        declaration: propertyTypeDeclaration,
        declarationSymbol: propertyTypeSymbol
      };

      this.typeLiteral = new AstStructuredType(typeLiteralOptions);
      this.innerItems.push(this.typeLiteral);
    }
  }

  /**
   * @virtual
   */
  public visitTypeReferencesForAstItem(): void {
    super.visitTypeReferencesForAstItem();

    if (this.declaration.kind !== ts.SyntaxKind.PropertySignature) {
      this.visitTypeReferencesForNode(this.declaration);
    }
  }

  /**
   * Returns a text string such as "someName?: SomeTypeName;", or in the case of a type
   * literal expression, returns a text string such as "someName?:".
   */
  public getDeclarationLine(property?: {type: string; readonly: boolean}): string {
    if (this.typeLiteral || !!property) {
      const accessModifier: string | undefined =
        this.accessModifier ? ApiAccessModifier[this.accessModifier].toLowerCase() : undefined;

      let result: string = accessModifier ? `${accessModifier} ` : '';
      result += this.isStatic ? 'static ' : '';
      result += property && property.readonly ? 'readonly ' : '';
      result += `${this.name}`;
      result += this.isOptional ? '?' : '';
      result += ':';
      result += !this.typeLiteral && property && property.type ? ` ${property.type};` : '';
      return Text.convertToLf(result);
    } else {
      return PrettyPrinter.getDeclarationSummary(this.declaration);
    }
  }

}
