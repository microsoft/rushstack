/* tslint:disable:no-bitwise */
/* tslint:disable:no-constant-condition */

import * as ts from 'typescript';
import * as path from 'path';
import Extractor from '../Extractor';
import ApiDocumentation, { ApiTag } from './ApiDocumentation';
import TypeScriptHelpers from '../TypeScriptHelpers';
import DocElementParser from '../DocElementParser';
import PackageJsonHelpers from '../PackageJsonHelpers';
import ResolvedApiItem from '../ResolvedApiItem';
import ApiDefinitionReference,
  { IScopedPackageName, IApiDefinintionReferenceParts } from '../ApiDefinitionReference';

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
  TypeLiteral = 9,
  /**
   * A Typescript class constructor function.
   */
  Constructor = 10
}

/**
 * The state of completing the ApiItem's doc comment references inside a recursive call to ApiItem.resolveReferences().
 */
enum InitializationState {
  /**
   * The references of this ApiItem have not begun to be completed.
   */
  Incomplete = 0,
  /**
   * The refernces of this ApiItem are in the process of being completed.
   * If we encounter this state again during completing, a circular dependency
   * has occured.
   */
  Completing = 1,
  /**
   * The references of this ApiItem have all been completed and the documentation can
   * now safely be created.
   */
  Completed = 2
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
   * A superset of memberItems. Includes memberItems and also other ApiItems that 
   * comprise this ApiItem. 
   * 
   * Ex: if this ApiItem is an ApiFunction, then in it's innerItems would
   * consist of ApiParameters. 
   * Ex: if this ApiItem is an ApiMember that is a type literal, then it's 
   * innerItems would contain ApiProperties. 
   */
  public innerItems: ApiItem[] = [];

  /**
   * True if this ApiItem either itself has missing type information or one 
   * of it's innerItems is missing type information. 
   * 
   * Ex: if this ApiItem is an ApiMethod and has no type on the return value, then 
   * we consider the ApiItem as 'itself' missing type informations and this property 
   * is set to true. 
   * Ex: If this ApiItem is an ApiMethod and one of its innerItems is an ApiParameter 
   * that has no type specified, then we say an innerItem of this ApiMethod is missing
   * type information and this property is set to true.
   */
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
  private _state: InitializationState;

  constructor(options: IApiItemOptions) {
    this.reportError = this.reportError.bind(this);

    this.jsdocNode = options.jsdocNode;
    this.declaration = options.declaration;
    this._errorNode = options.declaration;
    this._state = InitializationState.Incomplete;
    this.warnings = [];

    this.extractor = options.extractor;
    this.declarationSymbol = options.declarationSymbol;
    this.exportSymbol = options.exportSymbol || this.declarationSymbol;

    this.name = this.exportSymbol.name || '???';
    this.typeChecker = this.extractor.typeChecker;

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
  }

  /**
   * Called after the constructor to finish the analysis.
   */
  public visitTypeReferencesForApiItem(): void {
    // (virtual)
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
  protected onCompleteInitialization(): void {

    this.documentation.completeInitialization();
    // TODO: this.visitTypeReferencesForNode(this);

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
  public completeInitialization(): void {
    switch (this._state) {
      case InitializationState.Completed:
        return;
      case InitializationState.Incomplete:
        this._state = InitializationState.Completing;
        this.onCompleteInitialization();
        this._state = InitializationState.Completed;

        for (const innerItem of this.innerItems) {
          innerItem.completeInitialization();
        }
        return;
      case InitializationState.Completing:
        this.reportError('circular reference');
        return;
      default:
        throw new Error('ApiItem state is invalid');
    }
  }

  /**
   * A procedure for determining if this ApiItem is missing type 
   * information. We first check if the ApiItem itself is missing 
   * any type information and if not then we check each of it's 
   * innerItems for missing types. 
   * 
   * Ex: On the ApiItem itself, there may be missing type information 
   * on the return value or missing type declaration of itself 
   * (const name;).
   * Ex: For each innerItem, there may be an ApiParameter that is missing 
   * a type. Or for an ApiMember that is a type literal, there may be an 
   * ApiProperty that is missing type information. 
   */
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

  /**
   * This is called by ApiItems to visit the types that appear in an expression.  For example,
   * if a Public API function returns a class that is defined in this package, but not exported,
   * this is a problem. visitTypeReferencesForNode() finds all TypeReference child nodes under the
   * specified node and analyzes each one.
   */
  protected visitTypeReferencesForNode(node: ts.Node): void {
    if (node.kind === ts.SyntaxKind.Block ||
      (node.kind >= ts.SyntaxKind.JSDocTypeExpression && node.kind <= ts.SyntaxKind.JSDocNeverKeyword)) {
      // Don't traverse into code blocks or JSDoc items; we only care about the function signature
      return;
    }

    if (node.kind === ts.SyntaxKind.TypeReference) {
      const typeReference: ts.TypeReferenceNode = node as ts.TypeReferenceNode;
      this._analyzeTypeReference(typeReference);
    }

    // Recurse the tree
    for (const childNode of node.getChildren()) {
      this.visitTypeReferencesForNode(childNode);
    }
  }

  /**
   * This is a helper for visitTypeReferencesForNode().  It analyzes a single TypeReferenceNode.
   */
  private _analyzeTypeReference(typeReferenceNode: ts.TypeReferenceNode): void {
    const symbol: ts.Symbol = this.extractor.typeChecker.getSymbolAtLocation(typeReferenceNode.typeName);
    if (!symbol) {
      // Is this bad?
      return;
    }

    if (symbol.flags & ts.SymbolFlags.TypeParameter) {
      // Don't analyze e.g. "T" in "Set<T>"
      return;
    }

    // Follow the aliases all the way to the ending SourceFile
    const currentSymbol: ts.Symbol = this.followAliases(symbol);

    if (!currentSymbol.declarations || !currentSymbol.declarations.length) {
      // This is a degenerate case that happens sometimes
      return;
    }
    const sourceFile: ts.SourceFile = currentSymbol.declarations[0].getSourceFile();

    // Walk upwards from that directory until you find a directory containing package.json,
    // this is where the referenced type is located.
    // Example: "c:\users\<username>\sp-client\spfx-core\sp-core-library"
    const typeReferencePackagePath: string = PackageJsonHelpers.tryFindPackagePathUpwards(sourceFile.path);
    // Example: "@microsoft/sp-core-library"
    let typeReferencePackageName: string = '';

    // If we can not find a package path, we consider the type to be part of the current project's package. 
    // One case where this happens is when looking for a type that is a symlink
    if (!typeReferencePackagePath) {
      typeReferencePackageName = this.extractor.package.name;
    } else {
      typeReferencePackageName = PackageJsonHelpers.readPackageName(typeReferencePackagePath);
    }

    // Read the name/version from package.json -- that tells you what package the symbol
    // belongs to. If it is your own ApiPackage.name/version, then you know it's a local symbol.
    const currentPackageName: string = this.extractor.package.name;

    const typeName: string = typeReferenceNode.typeName.getText();
    if (!typeReferencePackagePath || typeReferencePackageName === currentPackageName) {
      // The type is defined in this project.  Did the person remember to export it?
      const exportedLocalName: string = this.extractor.package.tryGetExportedSymbolName(currentSymbol);
      if (exportedLocalName) {
        // [CASE 1] Local/Exported
        // Yes; the type is properly exported.
        // TODO: In the future, here we can check for issues such as a @public type
        // referencing an @internal type.
        return;
      } else {
        // [CASE 2] Local/Unexported
        // No; issue a warning
        this.reportWarning(`The type "${typeName}" needs to be exported by the package`
          + ` (e.g. added to index.ts)`);
          return;
      }
    }

    // External 
    // Attempt to load from docItemLoader
    const scopedPackageName: IScopedPackageName = ApiDefinitionReference.parseScopedPackageName(
      typeReferencePackageName
    );
    const apiDefinitionRefParts: IApiDefinintionReferenceParts = {
      scopeName: scopedPackageName.scope,
      packageName: scopedPackageName.package,
      exportName: '',
      memberName: ''
    };

    // the currentSymbol.name is the name of an export, if it contains a '.' then the substring 
    // after the period is the member name
    if (currentSymbol.name.indexOf('.') > -1) {
      const exportMemberName: string[] = currentSymbol.name.split('.');
      apiDefinitionRefParts.exportName = exportMemberName.pop();
      apiDefinitionRefParts.memberName = exportMemberName.pop();
    } else {
      apiDefinitionRefParts.exportName = currentSymbol.name;
    }

    const apiDefinitionRef: ApiDefinitionReference = ApiDefinitionReference.createFromParts(
      apiDefinitionRefParts
    );

    // Attempt to resolve the type by checking the node modules
    const resolvedApiItem: ResolvedApiItem = this.extractor.docItemLoader.resolveJsonReferences(
      apiDefinitionRef,
      this.reportError
    );

    if (resolvedApiItem) {
      // [CASE 3] External/Resolved
      // This is a reference to a type from an external package, and it was resolved.
      return;
    } else {
      // [CASE 4] External/Unresolved
      // The type is apparently from an external package, however our heuristic above
      // wasn't able to resolve the API item. This happens due to limitations of
      // the typeChecker.getAliasedSymbol() API; we should try to improve it.
      this.reportWarning(`Unable to resolve external type reference for "${typeName}"`);
    }
  }
}

export default ApiItem;
