import * as ts from 'typescript';
import { ApiItemKind, IApiItemOptions } from './ApiItem';
import ApiMember from './ApiMember';
import ApiParameter from './ApiParameter';
import TypeScriptHelpers from '../TypeScriptHelpers';
import { ITextElement } from '../IDocElement';

/**
 * This class is part of the ApiItem abstract syntax tree. It represents functions that are members of
 * classes, interfaces, or nested type literal expressions. Unlike ApiFunctions, ApiMethods can have
 * access modifiers (public, private, etc.) or be optional, because they are members of a structured type
 *
 * @see ApiFunction for functions that are defined inside of a package
 */
export default class ApiMethod extends ApiMember {
  public readonly returnType: string;
  public readonly params: ApiParameter[];
  private readonly _isConstructor: boolean;

  constructor(options: IApiItemOptions) {
    super(options);
    this.kind = ApiItemKind.Method;

    const methodDeclaration: ts.MethodDeclaration = options.declaration as ts.MethodDeclaration;

    // Parameters
    if (methodDeclaration.parameters) {
      this.params = [];
      for (const param of methodDeclaration.parameters) {
        const declarationSymbol: ts.Symbol = TypeScriptHelpers.tryGetSymbolForDeclaration(param);
        const apiParameter: ApiParameter = new ApiParameter({
          extractor: this.extractor,
          declaration: param,
          declarationSymbol: declarationSymbol,
          jsdocNode: param
        });

        this.innerItems.push(apiParameter);
        this.params.push(apiParameter);
      }
    }

    // tslint:disable-next-line:no-bitwise
    this._isConstructor = (options.declarationSymbol.flags & ts.SymbolFlags.Constructor) !== 0;

    // Return type
    if (!this.isConstructor) {
      if (methodDeclaration.type) {
        this.returnType = methodDeclaration.type.getText();
      } else {
        this.returnType = 'any';
        this.hasIncompleteTypes = true;
      }
    }
  }

  /**
   * Returns true if this member represents a class constructor.
   */
  public get isConstructor(): boolean {
    return this._isConstructor;
  }

  protected onCompleteInitialization(): void {
    super.onCompleteInitialization();

    // If this is a class constructor, and if the documentation summary was omitted, then
    // we fill in a default summary versus flagging it as "undocumented".
    // Generally class constructors have uninteresting documentation.
    if (this.isConstructor) {
      if (this.documentation.summary.length === 0) {
        this.documentation.summary.push({
          kind: 'textDocElement',
          value: 'Constructs a new instance of the class'
        } as ITextElement);
      }
      this.needsDocumentation = false;
    }
  }
}
