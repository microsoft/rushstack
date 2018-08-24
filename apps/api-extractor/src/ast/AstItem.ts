// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */
/* tslint:disable:no-constant-condition */

import * as ts from 'typescript';
import * as tsdoc from '@microsoft/tsdoc';
import { IPackageJson, IParsedPackageName, PackageName } from '@microsoft/node-core-library';
import { ExtractorContext } from '../ExtractorContext';
import { ApiDocumentation } from '../aedoc/ApiDocumentation';
import { MarkupElement } from '../markup/MarkupElement';
import { ReleaseTag } from '../aedoc/ReleaseTag';
import { TypeScriptHelpers } from '../utils/TypeScriptHelpers';
import { Markup } from '../markup/Markup';
import { ResolvedApiItem } from '../ResolvedApiItem';
import {
  ApiDefinitionReference,
  IApiDefinitionReferenceParts
} from '../ApiDefinitionReference';
import { AstItemContainer } from './AstItemContainer';

/**
 * Indicates the type of definition represented by a AstItem object.
 */
export enum AstItemKind {
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
  Constructor = 10,
  /**
   * A Typescript namespace.
   */
  Namespace = 11,
  /**
   * A Typescript BlockScopedVariable.
   */
  ModuleVariable = 12
}

/**
 * The state of completing the AstItem's doc comment references inside a recursive call to AstItem.resolveReferences().
 */
enum InitializationState {
  /**
   * The references of this AstItem have not begun to be completed.
   */
  Incomplete = 0,
  /**
   * The references of this AstItem are in the process of being completed.
   * If we encounter this state again during completing, a circular dependency
   * has occurred.
   */
  Completing = 1,
  /**
   * The references of this AstItem have all been completed and the documentation can
   * now safely be created.
   */
  Completed = 2
}

/**
  * This interface is used to pass options between constructors for AstItem child classes.
  */
export interface IAstItemOptions {
  /**
   * The associated ExtractorContext object for this AstItem
   */
  context: ExtractorContext;
  /**
   * The declaration node for the main syntax item that this AstItem is associated with.
   */
  declaration: ts.Declaration;
  /**
   * The semantic information for the declaration.
   */
  declarationSymbol: ts.Symbol;

  /**
   * The JSDoc-style comment range (including the "/**" characters), which is assumed
   * to be in the same source file as the IAstItemOptions.declaration node.
   * If this is undefined, then the comment will be obtained from the
   * IAstItemOptions.declaration node.
   */
  aedocCommentRange?: ts.TextRange;

  /**
   * The symbol used to export this AstItem from the AstPackage.
   */
  exportSymbol?: ts.Symbol;
}

// Names of NPM scopes that contain packages that provide typings for the real package.
// The TypeScript compiler's typings design doesn't seem to handle scoped NPM packages,
// so the transformation will always be simple, like this:
// "@types/example" --> "example"
// NOT like this:
// "@types/@contoso/example" --> "@contoso/example"
// "@contosotypes/example" --> "@contoso/example"
// Eventually this constant should be provided by the gulp task that invokes the compiler.
const typingsScopeNames: string[] = [ '@types' ];

/**
 * AstItem is an abstract base that represents TypeScript API definitions such as classes,
 * interfaces, enums, properties, functions, and variables.  Rather than directly using the
 * abstract syntax tree from the TypeScript Compiler API, we use AstItem to extract a
 * simplified tree which correponds to the major topics for our API documentation.
 */
export abstract class AstItem {

  /**
   * Names of API items should only contain letters, numbers and underscores.
   */
  private static _allowedNameRegex: RegExp = /^[a-zA-Z_]+[a-zA-Z_0-9]*$/;

  /**
   * The name of the definition, as seen by external consumers of the Public API.
   * For example, suppose a class is defined as "export default class MyClass { }"
   * but exported from the package's index.ts like this:
   *
   *    export { default as _MyClass } from './MyClass';
   *
   * In this example, the AstItem.name would be "_MyClass", i.e. the alias as exported
   * from the top-level AstPackage, not "MyClass" from the original definition.
   */
  public name: string;

  /**
   * The name of an API item should be readable and not contain any special characters.
   */
  public supportedName: boolean;

  /**
   * Indicates the type of definition represented by this AstItem instance.
   */
  public kind: AstItemKind;

  /**
   * A superset of memberItems. Includes memberItems and also other AstItems that
   * comprise this AstItem.
   *
   * Ex: if this AstItem is an AstFunction, then in it's innerItems would
   * consist of AstParameters.
   * Ex: if this AstItem is an AstMember that is a type literal, then it's
   * innerItems would contain ApiProperties.
   */
  public innerItems: AstItem[] = [];

  /**
   * True if this AstItem either itself has missing type information or one
   * of it's innerItems is missing type information.
   *
   * Ex: if this AstItem is an AstMethod and has no type on the return value, then
   * we consider the AstItem as 'itself' missing type informations and this property
   * is set to true.
   * Ex: If this AstItem is an AstMethod and one of its innerItems is an AstParameter
   * that has no type specified, then we say an innerItem of this AstMethod is missing
   * type information and this property is set to true.
   */
  public hasIncompleteTypes: boolean = false;

  /**
   * A list of extractor warnings that were reported using AstItem.reportWarning().
   * Whereas an "error" will break the build, a "warning" will merely be tracked in
   * the API file produced by ApiFileGenerator.
   */
  public warnings: string[];

  /**
   * The parsed AEDoc comment for this item.
   */
  public documentation: ApiDocumentation;

  /**
   * Indicates that this AstItem does not have adequate AEDoc comments. If shouldHaveDocumentation()=true,
   * and there is less than 10 characters of summary text in the AEDoc, then this will be set to true and
   * noted in the API file produced by ApiFileGenerator.
   * (The AEDoc text itself is not included in that report, because documentation
   * changes do not require an API review, and thus should not cause a diff for that report.)
   */
  public needsDocumentation: boolean;

  /**
   * The release tag for this item, which may be inherited from a parent.
   * By contrast, ApiDocumentation.releaseTag merely tracks the release tag that was
   * explicitly applied to this item, and does not consider inheritance.
   * @remarks
   * This is calculated during completeInitialization() and should not be used beforehand.
   */
  public inheritedReleaseTag: ReleaseTag = ReleaseTag.None;

  /**
   * The deprecated message for this item, which may be inherited from a parent.
   * By contrast, ApiDocumentation.deprecatedMessage merely tracks the message that was
   * explicitly applied to this item, and does not consider inheritance.
   * @remarks
   * This is calculated during completeInitialization() and should not be used beforehand.
   */
  public inheritedDeprecatedMessage: MarkupElement[] = [];

  /**
   * The ExtractorContext object provides common contextual information for all of
   * items in the AstItem tree.
   */
  protected context: ExtractorContext;

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
   * would be the alias that is exported from the top-level package (i.e. AstPackage).
   */
  protected exportSymbol: ts.Symbol;

  protected typeChecker: ts.TypeChecker;

  /**
   * Syntax information from the TypeScript Compiler API, used to locate the file name
   * and line number when reporting an error for this AstItem.
   */
  private _errorNode: ts.Node;

  /**
   * The state of this AstItems references. These references could include \@inheritdoc references
   * or type references.
   */
  private _state: InitializationState;

  private _parentContainer: AstItemContainer | undefined;

  constructor(options: IAstItemOptions) {
    this.reportError = this.reportError.bind(this);

    this.declaration = options.declaration;
    this._errorNode = options.declaration;
    this._state = InitializationState.Incomplete;
    this.warnings = [];

    this.context = options.context;
    this.typeChecker = this.context.typeChecker;
    this.declarationSymbol = options.declarationSymbol;
    this.exportSymbol = options.exportSymbol || this.declarationSymbol;

    this.name = this.exportSymbol.name || '???';

    const sourceFileText: string = this.declaration.getSourceFile().text;

    // This will contain the AEDoc content, including the "/**" characters
    let inputTextRange: tsdoc.TextRange = tsdoc.TextRange.empty;

    if (options.aedocCommentRange) { // but might be ""
      // This is e.g. for the special @packagedocumentation comment, which is pulled
      // from elsewhere in the AST.
      inputTextRange = tsdoc.TextRange.fromStringRange(sourceFileText,
        options.aedocCommentRange.pos, options.aedocCommentRange.end);
    } else {
      // This is the typical case
      const ranges: ts.CommentRange[] = TypeScriptHelpers.getJSDocCommentRanges(
        this.declaration, sourceFileText) || [];
      if (ranges.length > 0) {
        // We use the JSDoc comment block that is closest to the definition, i.e.
        // the last one preceding it
        const lastRange: ts.TextRange =  ranges[ranges.length - 1];
        inputTextRange = tsdoc.TextRange.fromStringRange(sourceFileText,
          lastRange.pos, lastRange.end);
      }
    }

    this.documentation = new ApiDocumentation(
      inputTextRange,
      this.context.docItemLoader,
      this.context,
      this.reportError,
      this.warnings
    );
  }

  /**
   * Called by AstItemContainer.addMemberItem().  Other code should NOT call this method.
   */
  public notifyAddedToContainer(parentContainer: AstItemContainer): void {
    if (this._parentContainer) {
      // This would indicate a program bug
      throw new Error('The API item has already been added to another container: ' + this._parentContainer.name);
    }
    this._parentContainer = parentContainer;
  }

  /**
   * Called after the constructor to finish the analysis.
   */
  public visitTypeReferencesForAstItem(): void {
    // (virtual)
  }

  /**
   * Return the compiler's underlying Declaration object
   * @todo Generally AstItem classes don't expose ts API objects; we should add
   *       an appropriate member to avoid the need for this.
   */
  public getDeclaration(): ts.Declaration {
    return this.declaration;
  }

  /**
   * Return the compiler's underlying Symbol object that contains semantic information about the item
   * @todo Generally AstItem classes don't expose ts API objects; we should add
   *       an appropriate member to avoid the need for this.
   */
  public getDeclarationSymbol(): ts.Symbol {
    return this.declarationSymbol;
  }

  /**
   * Whether this APiItem should have documentation or not.  If false, then
   * AstItem.missingDocumentation will never be set.
   */
  public shouldHaveDocumentation(): boolean {
    return true;
  }

  /**
   * The AstItemContainer that this member belongs to, or undefined if there is none.
   */
  public get parentContainer(): AstItemContainer|undefined {
    return this._parentContainer;
  }

  /**
   * This function is a second stage that happens after ExtractorContext.analyze() calls AstItem constructor to build up
   * the abstract syntax tree. In this second stage, we are creating the documentation for each AstItem.
   *
   * This function makes sure we create the documentation for each AstItem in the correct order.
   * In the event that a circular dependency occurs, an error is reported. For example, if AstItemOne has
   * an \@inheritdoc referencing AstItemTwo, and AstItemTwo has an \@inheritdoc referencing AstItemOne then
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
        throw new Error('AstItem state is invalid');
    }
  }

  /**
   * A procedure for determining if this AstItem is missing type
   * information. We first check if the AstItem itself is missing
   * any type information and if not then we check each of it's
   * innerItems for missing types.
   *
   * Ex: On the AstItem itself, there may be missing type information
   * on the return value or missing type declaration of itself
   * (const name;).
   * Ex: For each innerItem, there may be an AstParameter that is missing
   * a type. Or for an AstMember that is a type literal, there may be an
   * AstProperty that is missing type information.
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
   * Reports an error through the ApiErrorHandler interface that was registered with the Extractor,
   * adding the filename and line number information for the declaration of this AstItem.
   */
  protected reportError(message: string): void {
    this.context.reportError(message, this._errorNode.getSourceFile(), this._errorNode.getStart());
  }

  /**
   * Adds a warning to the AstItem.warnings list.  These warnings will be emitted in the API file
   * produced by ApiFileGenerator.
   */
  protected reportWarning(message: string): void {
    this.warnings.push(message);
  }

  /**
   * This function assumes all references from this AstItem have been resolved and we can now safely create
   * the documentation.
   */
  protected onCompleteInitialization(): void {
    this.documentation.completeInitialization(this.warnings);

    // Calculate the inherited release tag
    if (this.documentation.releaseTag !== ReleaseTag.None) {
      this.inheritedReleaseTag = this.documentation.releaseTag;
    } else if (this.parentContainer) {
      this.inheritedReleaseTag = this.parentContainer.inheritedReleaseTag;
    }

    // Calculate the inherited deprecation message
    if (this.documentation.deprecatedMessage.length) {
      this.inheritedDeprecatedMessage = this.documentation.deprecatedMessage;
    } else if (this.parentContainer) {
      this.inheritedDeprecatedMessage = this.parentContainer.inheritedDeprecatedMessage;
    }

    // TODO: this.visitTypeReferencesForNode(this);

    const summaryTextCondensed: string = Markup.extractTextContent(
      this.documentation.summary).replace(/\s\s/g, ' ');
    this.needsDocumentation = this.shouldHaveDocumentation() && summaryTextCondensed.length <= 10;

    this.supportedName = (this.kind === AstItemKind.Package) || AstItem._allowedNameRegex.test(this.name);
    if (!this.supportedName) {
      this.warnings.push(`The name "${this.name}" contains unsupported characters; ` +
        'API names should use only letters, numbers, and underscores');
    }

    if (this.kind === AstItemKind.Package) {
      // TODO: Use isEmpty()
      if (this.documentation.aedocCommentFound) {
        if (!this.documentation.isPackageDocumentation) {
          this.reportError('A package comment was found, but it is missing the @packagedocumentation tag');
        }
      }

      if (this.documentation.releaseTag !== ReleaseTag.None) {
        const tag: string = '@' + ReleaseTag[this.documentation.releaseTag].toLowerCase();
        this.reportError(`The ${tag} tag is not allowed on the package, which is always considered to be @public`);
      }
    } else {
      if (this.documentation.isPackageDocumentation) {
        this.reportError(`The @packagedocumentation tag cannot be used for an item of type ${AstItemKind[this.kind]}`);
      }
    }

    if (this.documentation.preapproved) {
      if (!(this.getDeclaration().kind & (ts.SyntaxKind.InterfaceDeclaration | ts.SyntaxKind.ClassDeclaration))) {
        this.reportError('The @preapproved tag may only be applied to classes and interfaces');
        this.documentation.preapproved = false;
      }
    }

    if (this.documentation.isEventProperty) {
      if (this.kind !== AstItemKind.Property) {
        this.reportError('The @eventProperty tag may only be applied to a property');
      }
    }

    if (this.documentation.isDocInheritedDeprecated && this.documentation.deprecatedMessage.length === 0) {
      this.reportError('The @inheritdoc target has been marked as @deprecated.  ' +
        'Add a @deprecated message here, or else remove the @inheritdoc relationship.');
    }

    if (this.name.substr(0, 1) === '_') {
      if (this.documentation.releaseTag !== ReleaseTag.Internal
        && this.documentation.releaseTag !== ReleaseTag.None) {
        this.reportWarning('The underscore prefix ("_") should only be used with definitions'
          + ' that are explicitly marked as @internal');
      }
    } else {
      if (this.documentation.releaseTag === ReleaseTag.Internal) {
        this.reportWarning('Because this definition is explicitly marked as @internal, an underscore prefix ("_")'
          + ' should be added to its name');
      }
    }

    // Is it missing a release tag?
    if (this.documentation.releaseTag === ReleaseTag.None) {
      // Only warn about top-level exports
      if (this.parentContainer && this.parentContainer.kind === AstItemKind.Package) {
        // Don't warn about items that failed to parse.
        if (!this.documentation.failedToParse) {
          if (this.context.validationRules.missingReleaseTags === 'error') {
            // If there is no release tag, and this is a top-level export of the package, then
            // report an error
            this.reportError(`A release tag (@alpha, @beta, @public, @internal) must be specified`
              + ` for ${this.name}`);
          }
        }

        // If the release tag was not specified for a top-level export, then it defaults
        // to @public (even if we reported an error above)
        this.documentation.releaseTag = ReleaseTag.Public;
      }
    }
  }

  /**
   * This is called by AstItems to visit the types that appear in an expression.  For example,
   * if a Public API function returns a class that is defined in this package, but not exported,
   * this is a problem. visitTypeReferencesForNode() finds all TypeReference child nodes under the
   * specified node and analyzes each one.
   */
  protected visitTypeReferencesForNode(node: ts.Node): void {
    if (node.kind === ts.SyntaxKind.Block ||
      (node.kind >= ts.SyntaxKind.JSDocTypeExpression && node.kind <= ts.SyntaxKind.NeverKeyword)) {
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
    const symbol: ts.Symbol | undefined = this.context.typeChecker.getSymbolAtLocation(typeReferenceNode.typeName);
    if (!symbol) {
      // Is this bad?
      return;
    }

    if (symbol.flags & ts.SymbolFlags.TypeParameter) {
      // Don't analyze e.g. "T" in "Set<T>"
      return;
    }

    // Follow the aliases all the way to the ending SourceFile
    const currentSymbol: ts.Symbol = TypeScriptHelpers.followAliases(symbol, this.typeChecker);

    if (!currentSymbol.declarations || !currentSymbol.declarations.length) {
      // This is a degenerate case that happens sometimes
      return;
    }
    const sourceFile: ts.SourceFile = currentSymbol.declarations[0].getSourceFile();

    // Walk upwards from that directory until you find a directory containing package.json,
    // this is where the referenced type is located.
    // Example: "c:\users\<username>\sp-client\spfx-core\sp-core-library"
    const typeReferencePackageJson: IPackageJson | undefined = this.context.packageJsonLookup
      .tryLoadPackageJsonFor(sourceFile.fileName);
    // Example: "@microsoft/sp-core-library"
    let typeReferencePackageName: string = '';

    // If we can not find a package path, we consider the type to be part of the current project's package.
    // One case where this happens is when looking for a type that is a symlink
    if (!typeReferencePackageJson) {
      typeReferencePackageName = this.context.package.name;
    } else {
      typeReferencePackageName = typeReferencePackageJson.name;

      typingsScopeNames.every(typingScopeName => {
        if (typeReferencePackageName.indexOf(typingScopeName) > -1) {
          typeReferencePackageName = typeReferencePackageName.replace(typingScopeName + '/', '');
          // returning true breaks the every loop
          return true;
        }
        return false;
      });
    }

    // Read the name/version from package.json -- that tells you what package the symbol
    // belongs to. If it is your own AstPackage.name/version, then you know it's a local symbol.
    const currentPackageName: string = this.context.package.name;

    const typeName: string = typeReferenceNode.typeName.getText();
    if (!typeReferencePackageJson || typeReferencePackageName === currentPackageName) {
      // The type is defined in this project.  Did the person remember to export it?
      const exportedLocalName: string | undefined = this.context.package.tryGetExportedSymbolName(currentSymbol);
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
    const parsedPackageName: IParsedPackageName = PackageName.parse(
      typeReferencePackageName
    );
    const apiDefinitionRefParts: IApiDefinitionReferenceParts = {
      scopeName: parsedPackageName.scope,
      packageName: parsedPackageName.unscopedName,
      exportName: '',
      memberName: ''
    };

    // the currentSymbol.name is the name of an export, if it contains a '.' then the substring
    // after the period is the member name
    if (currentSymbol.name.indexOf('.') > -1) {
      const exportMemberName: string[] = currentSymbol.name.split('.');
      apiDefinitionRefParts.exportName = exportMemberName.pop() || '';
      apiDefinitionRefParts.memberName = exportMemberName.pop() || '';
    } else {
      apiDefinitionRefParts.exportName = currentSymbol.name;
    }

    const apiDefinitionRef: ApiDefinitionReference = ApiDefinitionReference.createFromParts(
      apiDefinitionRefParts
    );

    // Attempt to resolve the type by checking the node modules
    const referenceResolutionWarnings: string[] = [];
    const resolvedAstItem: ResolvedApiItem | undefined = this.context.docItemLoader.resolveJsonReferences(
      apiDefinitionRef,
      referenceResolutionWarnings
    );

    if (resolvedAstItem) {
      // [CASE 3] External/Resolved
      // This is a reference to a type from an external package, and it was resolved.
      return;
    } else {
      // [CASE 4] External/Unresolved
      // For cases when we can't find the external package, we are going to write a report
      // at the bottom of the *api.ts file. We do this because we do not yet support references
      // to items like react:Component.
      // For now we are going to silently ignore these errors.
      return;
    }
  }
}
