/* tslint:disable:no-bitwise */
/* tslint:disable:no-constant-condition */

import * as ts from 'typescript';
import Extractor from '../Extractor';
import ApiDocumentation from './ApiDocumentation';

/**
 * Indicates the type of definition represented by a ApiItem object.
 */
export enum ApiItemKind {
  /**
    * A TypeScript class.
    */
  class = 0,
  /**
    * A TypeScript enum.
    */
  enum = 1,
  /**
    * A TypeScript value on an enum.
    */
  enumValue = 2,
  /**
    * A TypeScript function.
    */
  function = 3,
  /**
    * A TypeScript interface.
    */
  interface = 4,
  /**
    * A TypeScript method.
    */
  method = 5,
  /**
    * A TypeScript package.
    */
  package = 6,
  /**
    * A TypeScript parameter.
    */
  parameter = 7,
  /**
    * A TypeScript property.
    */
  property = 8,
  /**
    * A TypeScript type literal expression, i.e. which defines an anonymous interface.
    */
  typeLiteral = 9
}

/**
  * This interface is used to pass options between constructors for ApiItem child classes.
  */
export interface IApiItemOptions {
  /**
   * The associated Extractor object for this ApiItem
   */
  extractor: Extractor;
  /**
   * The declaration node for the main syntax item that this ApiItem is associated with. 
   */
  declaration: ts.Declaration;
  /**
   * The semantic information for the declaration.
   */
  declarationSymbol: ts.Symbol;
  /**
   * The declaration node that contains the JSDoc comments for this ApiItem.
   * In most cases this is the same as `declaration`, but for ApiPackage it will be
   * a separate node under the root.
   */
  jsdocNode: ts.Node;
  /**
   * The symbol used to export this ApiItem from the ApiPackage.
   */
  exportSymbol?: ts.Symbol;
}

/**
 * ApiItem is an abstract base that represents TypeScript API definitions such as classes,
 * interfaces, enums, properties, functions, and variables.  Rather than directly using the
 * abstract syntax tree from the TypeScript Compiler API, we use ApiItem to extract a
 * simplified tree which correponds to the major topics for our API documentation.
 */
abstract class ApiItem {
  /**
   * The name of the definition, as seen by external consumers of the Public API.
   * For example, suppose a class is defined as "export default class MyClass { }"
   * but exported from the package's index.ts like this:
   *
   *    export { default as _MyClass } from './MyClass';
   *
   * In this example, the ApiItem.name would be "_MyClass", i.e. the alias as exported
   * from the top-level ApiPackage, not "MyClass" from the original definition.
   */
  public name: string;

  /**
   * Indicates the type of definition represented by this ApiItem instance.
   */
  public kind: ApiItemKind;

  /**
   * A list of extractor warnings that were reported using ApiItem.reportWarning().
   * Whereas an "error" will break the build, a "warning" will merely be tracked in
   * the API file produced by ApiFileGenerator.
   */
  public warnings: string[];

  /**
   * The declaration node that contains the JSDoc comments for this ApiItem.
   * In most cases this is the same as `declaration`, but for ApiPackage it will be
   * a separate node under the root.
   */
  public jsdocNode: ts.Node;

  public documentation: ApiDocumentation;

  /**
   * The Extractor object that acts as the root of the abstract syntax tree that this item belongs to.
   */
  protected extractor: Extractor;

  /**
   * Syntax information from the TypeScript Compiler API, corresponding to the place
   * where this object is originally defined.
   */
  protected declaration: ts.Declaration;

  /**
   * Semantic information from the TypeScript Compiler API, corresponding to the place
   * where this object is originally defined.
   */
  protected declarationSymbol: ts.Symbol;

  /**
   * Semantic information from the TypeScript Compiler API, corresponding to the symbol
   * that is seen by external consumers of the Public API.  For an aliased symbol, this
   * would be the alias that is exported from the top-level package (i.e. ApiPackage).
   */
  protected exportSymbol: ts.Symbol;

  protected typeChecker: ts.TypeChecker;

  /**
   * Syntax information from the TypeScript Compiler API, used to locate the file name
   * and line number when reporting an error for this ApiItem.
   */
  private _errorNode: ts.Node;

  constructor(options: IApiItemOptions) {
    this.reportError = this.reportError.bind(this);

    this.declaration = options.declaration;
    this.jsdocNode = options.jsdocNode;
    this._errorNode = options.declaration;
    this.warnings = [];

    this.extractor = options.extractor;
    this.declarationSymbol = options.declarationSymbol;
    this.exportSymbol = options.exportSymbol || this.declarationSymbol;

    this.name = this.exportSymbol.name || '???';
    this.typeChecker = this.extractor.typeChecker;

    this.documentation = new ApiDocumentation(this, options.extractor.docItemLoader, this.reportError);
  }

  /**
   * Return the compiler's underlying Declaration object
   * @todo Generally ApiItem classes don't expose ts API objects; we should add
   *       an appropriate member to avoid the need for this.
   */
  public getDeclaration(): ts.Declaration {
    return this.declaration;
  }

  /**
   * Return the compiler's underlying Symbol object that contains semantic information about the item
   * @todo Generally ApiItem classes don't expose ts API objects; we should add
   *       an appropriate member to avoid the need for this.
   */
  public getDeclarationSymbol(): ts.Symbol {
    return this.declarationSymbol;
  }

  /**
   * Whether this APiItem should have documentation or not.  If false, then
   * ApiItem.missingDocumentation will never be set.
   */
  public shouldHaveDocumentation(): boolean {
    return true;
  }

  /**
   * This traverses any type aliases to find the original place where an item was defined.
   * For example, suppose a class is defined as "export default class MyClass { }"
   * but exported from the package's index.ts like this:
   *
   *    export { default as _MyClass } from './MyClass';
   *
   * In this example, calling followAliases() on the _MyClass symbol will return the
   * original definition of MyClass, traversing any intermediary places where the
   * symbol was imported and re-exported.
   */
  protected followAliases(symbol: ts.Symbol): ts.Symbol {
    let current: ts.Symbol = symbol;
    while (true) {
      if (!(current.flags & ts.SymbolFlags.Alias)) {
        break;
      }
      const currentAlias: ts.Symbol = this.typeChecker.getAliasedSymbol(current);
      if (!currentAlias || currentAlias === current) {
        break;
      }
      current = currentAlias;
    }

    return current;
  }

  /**
   * Reports an error through the ApiErrorHandler interface that was registered with the Extractor,
   * adding the filename and line number information for the declaration of this ApiItem.
   */
  protected reportError(message: string): void {
    this.extractor.reportError(message, this._errorNode.getSourceFile(), this._errorNode.getStart());
  }

 /**
   * Adds a warning to the ApiItem.warnings list.  These warnings will be emtted in the API file
   * produced by ApiFileGenerator.
   */
  protected reportWarning(message: string): void {
    this.warnings.push(message);
  }
}

export default ApiItem;
