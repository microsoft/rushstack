// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import { Text } from '@microsoft/node-core-library';

import { ReleaseTag } from '../aedoc/ReleaseTag';
import { Markup } from '../markup/Markup';
import { AstMethod } from './AstMethod';
import { AstProperty } from './AstProperty';
import { AstItemKind, IAstItemOptions } from './AstItem';
import { AstItemContainer } from './AstItemContainer';
import { TypeScriptHelpers } from '../utils/TypeScriptHelpers';
import { PrettyPrinter } from '../utils/PrettyPrinter';

/**
  * This class is part of the AstItem abstract syntax tree.  It represents a class,
  * interface, or type literal expression.
  */
export class AstStructuredType extends AstItemContainer {
  public implements?: string;
  public extends?: string;

  /**
   * An array of type parameters for generic classes
   * Example: Foo<T, S> => ['T', 'S']
   */
  public typeParameters: string[];

  /**
   * The data type of the AstItem.declarationSymbol.  This is not the exported alias,
   * but rather the original that has complete member and inheritance information.
   */
  protected type: ts.Type;

  private _classLikeDeclaration: ts.ClassLikeDeclaration;
  private _processedMemberNames: Set<string> = new Set<string>();
  private _setterNames: Set<string> = new Set<string>();

  constructor(options: IAstItemOptions) {
    super(options);

    this._classLikeDeclaration = options.declaration as ts.ClassLikeDeclaration;
    this.type = this.typeChecker.getDeclaredTypeOfSymbol(this.declarationSymbol);

    if (this.declarationSymbol.flags & ts.SymbolFlags.Interface) {
      this.kind = AstItemKind.Interface;
    } else if (this.declarationSymbol.flags & ts.SymbolFlags.TypeLiteral) {
      this.kind = AstItemKind.TypeLiteral;
    } else {
      this.kind = AstItemKind.Class;
    }

    for (const memberDeclaration of this._classLikeDeclaration.members || []) {
      const memberSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(memberDeclaration);
      if (memberSymbol) {
        this._processMember(memberSymbol, memberDeclaration);
      } else {
        // If someone put an extra semicolon after their function, we don't care about that
        if (memberDeclaration.kind !== ts.SyntaxKind.SemicolonClassElement) {
          // If there is some other non-semantic junk, add a warning so we can investigate it
          this.reportWarning(PrettyPrinter.formatFileAndLineNumber(memberDeclaration)
            + `: No semantic information for "${memberDeclaration.getText()}"`);
        }
      }
    }

    // If there is a getter and no setter, mark it as readonly.
    for (const member of this.getSortedMemberItems()) {
      const memberSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(member.getDeclaration());
      if (memberSymbol && (memberSymbol.flags === ts.SymbolFlags.GetAccessor)) {
        if (!this._setterNames.has(member.name)) {
          (member as AstProperty).isReadOnly = true;
        }
      }
    }

    // Check for heritage clauses (implements and extends)
    if (this._classLikeDeclaration.heritageClauses) {
      for (const heritage of this._classLikeDeclaration.heritageClauses) {

        const typeText: string | undefined = heritage.types && heritage.types.length
          && heritage.types[0].expression
          ? heritage.types[0].expression.getText() : undefined;

        if (heritage.token === ts.SyntaxKind.ExtendsKeyword) {
          this.extends = typeText;
        } else if (heritage.token === ts.SyntaxKind.ImplementsKeyword) {
          this.implements = typeText;
        }
      }
    }

    // Check for type parameters
    if (this._classLikeDeclaration.typeParameters && this._classLikeDeclaration.typeParameters.length) {
      if (!this.typeParameters) {
        this.typeParameters = [];
      }
      for (const param of this._classLikeDeclaration.typeParameters) {
        this.typeParameters.push(param.getText());
      }
    }

    // Throw errors for setters that don't have a corresponding getter
    this._setterNames.forEach((setterName: string) => {
      if (!this.getMemberItem(setterName)) {
        // Normally we treat API design changes as warnings rather than errors.  However,
        // a missing getter is bizarre enough that it's reasonable to assume it's a mistake,
        // not a conscious design choice.
        this.reportError(`The "${setterName}" property has a setter, but no a getter`);
      }
    });
  }

  /**
   * @virtual
   */
  public visitTypeReferencesForAstItem(): void {
    super.visitTypeReferencesForAstItem();

    // Collect type references from the base classes
    if (this._classLikeDeclaration && this._classLikeDeclaration.heritageClauses) {
      for (const clause of this._classLikeDeclaration.heritageClauses) {
        this.visitTypeReferencesForNode(clause);
      }
    }
  }

  /**
    * Returns a line of text such as "class MyClass extends MyBaseClass", excluding the
    * curly braces and body.  The name "MyClass" will be the public name seen by external
    * callers, not the declared name of the class; @see AstItem.name documentation for details.
    */
  public getDeclarationLine(): string {
    let result: string = '';

    if (this.kind !== AstItemKind.TypeLiteral) {
      result += (this.declarationSymbol.flags & ts.SymbolFlags.Interface)
        ? 'interface ' : 'class ';

      result += this.name;

      if (this._classLikeDeclaration.typeParameters) {
        result += '<';

        result += this._classLikeDeclaration.typeParameters
          .map((param: ts.TypeParameterDeclaration) => param.getText())
          .join(', ');

        result += '>';
      }

      if (this._classLikeDeclaration.heritageClauses) {
        result += ' ';
        result += this._classLikeDeclaration.heritageClauses
          .map((clause: ts.HeritageClause) => clause.getText())
          .join(', ');
      }
    }
    return Text.convertToLf(result);
  }

  protected onCompleteInitialization(): void {
    super.onCompleteInitialization();

    // Is the constructor internal?
    for (const member of this.getSortedMemberItems()) {
      if (member.kind === AstItemKind.Constructor) {
        if (member.documentation.releaseTag === ReleaseTag.Internal) {
          // Add a boilerplate notice for classes with internal constructors
          this.documentation.remarks.unshift(
            ...Markup.createTextElements(`The constructor for this class is marked as internal. Third-party code`
              + ` should not call the constructor directly or create subclasses that extend the ${this.name} class.`),
            Markup.PARAGRAPH
          );
        }
      }
    }
  }

  private _processMember(memberSymbol: ts.Symbol, memberDeclaration: ts.Declaration): void {
    if (memberDeclaration.modifiers) {
      for (let i: number = 0; i < memberDeclaration.modifiers.length; i++ ) {
        const modifier: ts.Modifier = memberDeclaration.modifiers[i];
        if (modifier.kind === ts.SyntaxKind.PrivateKeyword) {
          return;
        }
      }
    }

    if (this._processedMemberNames.has(memberSymbol.name)) {
      if (memberSymbol.flags === ts.SymbolFlags.SetAccessor) {
        // In case of setters, just add them to a list to check later if they have a getter
        this._setterNames.add(memberSymbol.name);
      }
      // Throw an error for duplicate names, because we use names as identifiers
      // @todo #261549 Define an AEDoc tag to allow defining an identifier for overloaded methods eg. @overload method2
      return;
    }

    // Proceed to add the member
    this._processedMemberNames.add(memberSymbol.name);

    const memberOptions: IAstItemOptions = {
      context: this.context,
      declaration: memberDeclaration,
      declarationSymbol: memberSymbol
    };

    if (memberSymbol.flags & (
        ts.SymbolFlags.Method |
        ts.SymbolFlags.Constructor |
        ts.SymbolFlags.Signature |
        ts.SymbolFlags.Function
    )) {
      this.addMemberItem(new AstMethod(memberOptions));
    } else if (memberSymbol.flags & (
      ts.SymbolFlags.Property |
      ts.SymbolFlags.GetAccessor
    )) {
      this.addMemberItem(new AstProperty(memberOptions));
    } else {
      this.reportWarning(`Unsupported member: ${memberSymbol.name}`);
    }
  }
}
