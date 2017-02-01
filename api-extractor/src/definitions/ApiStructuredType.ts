/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import ApiMethod from './ApiMethod';
import ApiProperty from './ApiProperty';
import ApiItem, { ApiItemKind, IApiItemOptions } from './ApiItem';
import ApiItemContainer from './ApiItemContainer';
import TypeScriptHelpers from '../TypeScriptHelpers';
import PrettyPrinter from '../PrettyPrinter';

/**
  * This class is part of the ApiItem abstract syntax tree.  It represents a class,
  * interface, or type literal expression.
  */
export default class ApiStructuredType extends ApiItemContainer {
  public implements?: string;
  public extends?: string;

  /**
   * An array of type parameters for generic classes
   * Example: Foo<T, S> => ['T', 'S']
   */
  public typeParameters: string[];

  /**
   * The data type of the ApiItem.declarationSymbol.  This is not the exported alias,
   * but rather the original that has complete member and inheritance information.
   */
  protected type: ts.Type;

  private _classLikeDeclaration: ts.ClassLikeDeclaration;
  private _processedMemberNames: Set<string> = new Set<string>();
  private _setterNames: Set<string> = new Set<string>();

  constructor(options: IApiItemOptions) {
    super(options);

    this._classLikeDeclaration = options.declaration as ts.ClassLikeDeclaration;
    this.type = this.typeChecker.getDeclaredTypeOfSymbol(this.declarationSymbol);

    if (this.declarationSymbol.flags & ts.SymbolFlags.Interface) {
      this.kind = ApiItemKind.interface;
    } else if (this.declarationSymbol.flags & ts.SymbolFlags.TypeLiteral) {
      this.kind = ApiItemKind.typeLiteral;
    } else {
      this.kind = ApiItemKind.class;
    }

    for (const memberDeclaration of this._classLikeDeclaration.members) {
      const memberSymbol: ts.Symbol = TypeScriptHelpers.tryGetSymbolForDeclaration(memberDeclaration);
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
      const memberSymbol: ts.Symbol = TypeScriptHelpers.tryGetSymbolForDeclaration(member.getDeclaration());
      if (memberSymbol && (memberSymbol.flags === ts.SymbolFlags.GetAccessor)) {
        if (!this._setterNames.has(member.name)) {
          (member as ApiProperty).isReadOnly = true;
        }
      }
    }

    // Check for heritage clauses (implements and extends)
    if (this._classLikeDeclaration.heritageClauses) {
      for (const heritage of this._classLikeDeclaration.heritageClauses) {
        const typeText: string = heritage.types && heritage.types.length && heritage.types[0].expression ?
          heritage.types[0].expression.getText() : undefined;
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
    const memberNames: string[] = this.memberItems.map((apiItem: ApiItem) => { return apiItem.name; });
    this._setterNames.forEach((setterName: string) => {
      if (memberNames.indexOf(setterName) < 0) {
        this.reportError(`Found setter named ${setterName} with no corresponding getter. \
          WriteOnly properties are prohibited.`);
      }
    });
  }

  /**
    * Returns a line of text such as "class MyClass extends MyBaseClass", excluding the
    * curly braces and body.  The name "MyClass" will be the public name seend by external
    * callers, not the declared name of the class; @see ApiItem.name documentation for details.
    */
  public getDeclarationLine(): string {
    let result: string = '';

    if (this.kind !== ApiItemKind.typeLiteral) {
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
    return result;
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
      // @todo #261549 Define a JsDoc tag to allow defining an identifier for overloaded methods eg. @overload method2
      return;
    }

    // Proceed to add the member
    this._processedMemberNames.add(memberSymbol.name);

    const memberOptions: IApiItemOptions = {
      extractor: this.extractor,
      declaration: memberDeclaration,
      declarationSymbol: memberSymbol,
      jsdocNode: memberDeclaration
    };

    if (memberSymbol.flags & (
        ts.SymbolFlags.Method |
        ts.SymbolFlags.Constructor |
        ts.SymbolFlags.Signature |
        ts.SymbolFlags.Function
    )) {
      this.addMemberItem(new ApiMethod(memberOptions));
    } else if (memberSymbol.flags & (
      ts.SymbolFlags.Property |
      ts.SymbolFlags.GetAccessor
    )) {
      this.addMemberItem(new ApiProperty(memberOptions));
    } else {
      this.reportWarning(`Unsupported member: ${memberSymbol.name}`);
    }
  }
}
