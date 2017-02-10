/* tslint:disable:no-bitwise */
/* tslint:disable:no-constant-condition */

import * as ts from 'typescript';
import Extractor from '../Extractor';
import ApiDocumentation, { ApiTag } from './ApiDocumentation';
import TypeScriptHelpers from '../TypeScriptHelpers';
import DocElementParser from '../DocElementParser';

/**
 * Indicates the type of definition represented by a ApiItem object.
 */
export enum ApiItemKind {
  /**
    * A TypeScript class.
    */
  Class = 0,
  /**
    * A TypeScript enum.
    */
  Enum = 1,
  /**
    * A TypeScript value on an enum.
    */
  EnumValue = 2,
  /**
    * A TypeScript function.
    */
  Function = 3,
  /**
    * A TypeScript interface.
    */
  Interface = 4,
  /**
    * A TypeScript method.
    */
  Method = 5,
  /**
    * A TypeScript package.
    */
  Package = 6,
  /**
    * A TypeScript parameter.
    */
  Parameter = 7,
  /**
    * A TypeScript property.
    */
  Property = 8,
  /**
    * A TypeScript type literal expression, i.e. which defines an anonymous interface.
    */
  TypeLiteral = 9
}

/**
 * The state of resolving the ApiItem's doc comment references inside a recursive call to ApiItem.resolveReferences().
 */
enum ResolveState {
  /**
   * The references of this ApiItem have not begun to be resolved.
   */
  Unresolved = 0,
  /**
   * The refernces of this ApiItem are in the process of being resolved.
   * If we encounter this state again during resolution, a circular dependency is
   * has occured.
   */
  Resolving = 1,
  /**
   * The references of this ApiItem have all been resolved and the documentation can
   * now safely be created.
   */
  Resolved = 2
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

  public innerItems: ApiItem[] = [];

  // True if this ApiItem is missing something
  public hasIncompleteTypes: boolean = false;

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
   * Indicates that this ApiItem does not have adequate JSDoc comments. If shouldHaveDocumentation()=true,
   * and there is less than 10 characters of summary text in the JSDoc, then this will be set to true and 
   * noted in the API file produced by ApiFileGenerator.  
   * (The JSDoc text itself is not included in that report, because documentation
   * changes do not require an API review, and thus should not cause a diff for that report.)
   */
  public needsDocumentation: boolean;

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

  /**
   * The state of this ApiItems references. These references could include \@inheritdoc references
   * or type references.
   */
  private _state: ResolveState;

  constructor(options: IApiItemOptions) {
    this.reportError = this.reportError.bind(this);

    this.jsdocNode = options.jsdocNode;
    this.declaration = options.declaration;
    this._errorNode = options.declaration;
    this._state = ResolveState.Unresolved;
    this.warnings = [];

    this.extractor = options.extractor;
    this.declarationSymbol = options.declarationSymbol;
    this.exportSymbol = options.exportSymbol || this.declarationSymbol;

    this.name = this.exportSymbol.name || '???';
    this.typeChecker = this.extractor.typeChecker;
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

  /**
   * This function assumes all references from this ApiItem have been resolved and we can now safely create
   * the documentation.
   */
  protected onResolveReferences(): void {
    let originalJsDoc: string = '';
    if (this.jsdocNode) {
      originalJsDoc = TypeScriptHelpers.getJsDocComments(this.jsdocNode, this.reportError);
    }

    this.documentation = new ApiDocumentation(
      originalJsDoc,
      this.extractor.docItemLoader,
      this.extractor,
      this.reportError
    );
    // TODO: this.collectTypeReferences(this);

    const summaryTextCondensed: string = DocElementParser.getAsText(
      this.documentation.summary,
      this.reportError).replace(/\s\s/g, ' ');
    this.needsDocumentation = this.shouldHaveDocumentation() && summaryTextCondensed.length <= 10;

    if (this.kind === ApiItemKind.Package) {
      if (this.documentation.apiTag !== ApiTag.None) {
        const tag: string = '@' + ApiTag[this.documentation.apiTag].toLowerCase();
        this.reportError(`The ${tag} tag is not allowed on the package, which is always public`);
      }
      this.documentation.apiTag = ApiTag.Public;
    }

    if (this.documentation.preapproved) {
      if (!(this.getDeclaration().kind & (ts.SyntaxKind.InterfaceDeclaration | ts.SyntaxKind.ClassDeclaration))) {
        this.reportError('The @preapproved tag may only be applied to classes and interfaces');
        this.documentation.preapproved = false;
      }
    }
  }

  /**
   * This function is a second stage that happens after Extractor.analyze() calls ApiItem constructor to build up
   * the abstract syntax tree. In this second stage, we are creating the documentation for each ApiItem.
   *
   * This function makes sure we create the documentation for each ApiItem in the correct order.
   * In the event that a circular dependency occurs, an error is reported. For example, if ApiItemOne has
   * an \@inheritdoc referencing ApiItemTwo, and ApiItemTwo has an \@inheritdoc refercing ApiItemOne then
   * we have a circular dependency and an error will be reported.
   */
  public resolveReferences(): void {
    switch (this._state) {
      case ResolveState.Resolved:
        return;
      case ResolveState.Unresolved:
        this._state = ResolveState.Resolving;

        for (const innerItem of this.innerItems) {
          innerItem.resolveReferences();
        }
        this.onResolveReferences();

        this._state = ResolveState.Resolved;
        return;
      case ResolveState.Resolving:
        this.reportError('circular reference');
        return;
      default:
        throw new Error('ApiItem state is invalid');
    }
  }

  public hasAnyIncompleteTypes(): boolean {
    if (this.hasIncompleteTypes) {
      return true;
    }
    for (const innerItem of this.innerItems) {
      if (innerItem.hasIncompleteTypes) {
        return true;
      }
    }
    return false;
  }
}

export default ApiItem;
