import * as ts from 'typescript';
import ApiItem, { IApiItemOptions } from './ApiItem';
import ApiStructuredType from './ApiStructuredType';
import PrettyPrinter from '../PrettyPrinter';
import TypeScriptHelpers from '../TypeScriptHelpers';

export enum AccessModifier {
  Private,
  Protected,
  Public
}

/**
 * This class is part of the ApiItem abstract syntax tree.  It represents syntax following
 * these types of patterns:
 *
 * - "someName: SomeTypeName;"
 * - "someName?: SomeTypeName;"
 * - "someName: { someOtherName: SomeOtherTypeName }", i.e. involving a type literal expression
 * - "someFunction(): void;"
 *
 * ApiMember is used to represent members of classes, interfaces, and nested type literal expressions.
 */
export default class ApiMember extends ApiItem {
  /**
   * True if the member is an optional field value, indicated by a question mark ("?") after the name
   */
  public accessModifier: AccessModifier;
  public isOptional: boolean;
  public isStatic: boolean;

  /**
   * The type of the member item, if specified as a type literal expression.  Otherwise,
   * this field is undefined.
   */
  public typeLiteral: ApiStructuredType;

  constructor(options: IApiItemOptions) {
    super(options);

    this.typeLiteral = undefined;

    const memberSignature: ts.PropertySignature = this.declaration as ts.PropertySignature;

    this.isOptional = !!memberSignature.questionToken;

    // Modifiers
    if (memberSignature.modifiers) {
      for (const modifier of memberSignature.modifiers) {
        if (modifier.kind === ts.SyntaxKind.PublicKeyword) {
          this.accessModifier = AccessModifier.Public;
        } else if (modifier.kind === ts.SyntaxKind.ProtectedKeyword) {
          this.accessModifier = AccessModifier.Protected;
        } else if (modifier.kind === ts.SyntaxKind.PrivateKeyword) {
          this.accessModifier = AccessModifier.Private;
        } else if (modifier.kind === ts.SyntaxKind.StaticKeyword) {
          this.isStatic = true;
        }
      }
    }

    if (memberSignature.type && memberSignature.type.kind === ts.SyntaxKind.TypeLiteral) {
      const propertyTypeDeclaration: ts.Declaration = memberSignature.type as ts.Node as ts.Declaration;
      const propertyTypeSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(propertyTypeDeclaration);

      const typeLiteralOptions: IApiItemOptions = {
        extractor: this.extractor,
        declaration: propertyTypeDeclaration,
        declarationSymbol: propertyTypeSymbol,
        jsdocNode: propertyTypeDeclaration
      };

      this.typeLiteral = new ApiStructuredType(typeLiteralOptions);
      this.innerItems.push(this.typeLiteral);
    }
  }

  /**
   * Returns a text string such as "someName?: SomeTypeName;", or in the case of a type
   * literal expression, returns a text string such as "someName?:".
   */
  public getDeclarationLine(property?: {type: string; readonly: boolean}): string {
    if (this.typeLiteral || !!property) {
      const accessModifier: string =
        this.accessModifier ? AccessModifier[this.accessModifier].toLowerCase() : undefined;

      let result: string = accessModifier ? `${accessModifier} ` : '';
      result += this.isStatic ? 'static ' : '';
      result += property && property.readonly ? 'readonly ' : '';
      result += `${this.name}`;
      result += this.isOptional ? '?' : '';
      result += ':';
      result += !this.typeLiteral && property && property.type ? ` ${property.type};` : '';
      return result;
    } else {
      return PrettyPrinter.getDeclarationSummary(this.declaration);
    }
  }

}
