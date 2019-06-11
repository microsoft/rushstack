// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// tslint:disable:member-ordering

import * as path from 'path';

import yaml = require('js-yaml');
import {
  JsonFile,
  JsonSchema,
  PackageName,
  FileSystem,
  NewlineKind,
  InternalError
} from '@microsoft/node-core-library';
import { StringBuilder, DocSection, DocComment } from '@microsoft/tsdoc';
import {
  ApiModel,
  ApiItem,
  ApiItemKind,
  ApiDocumentedItem,
  ApiReleaseTagMixin,
  ReleaseTag,
  ApiPropertyItem,
  ApiItemContainerMixin,
  ApiPackage,
  ApiEnumMember,
  ApiClass,
  ApiInterface,
  ApiParameterListMixin,
  ApiMethod,
  ApiMethodSignature,
  ApiConstructor,
  ApiFunction,
  ApiReturnTypeMixin,
  ApiTypeParameterListMixin,
  Parameter
} from '@microsoft/api-extractor-model';

import {
  IYamlApiFile,
  IYamlItem,
  IYamlSyntax,
  IYamlParameter
} from '../yaml/IYamlApiFile';
import {
  IYamlTocFile,
  IYamlTocItem
} from '../yaml/IYamlTocFile';
import { Utilities } from '../utils/Utilities';
import { CustomMarkdownEmitter} from '../markdown/CustomMarkdownEmitter';

const yamlApiSchema: JsonSchema = JsonSchema.fromFile(path.join(__dirname, '..', 'yaml', 'typescript.schema.json'));

interface IPrecomputeContext {
  recordedPaths: Set<string>;
  apiItemNeedsDisambiguation: Map<ApiItem, boolean>;
  uidFragmentCache: Map<ApiItem, string>;
}

/**
 * Writes documentation in the Universal Reference YAML file format, as defined by typescript.schema.json.
 */
export class YamlDocumenter {
  private readonly _apiModel: ApiModel;
  private readonly _markdownEmitter: CustomMarkdownEmitter;

  // This is used by the _linkToUidIfPossible() workaround.
  // It stores a mapping from type name (e.g. "MyClass") to the corresponding ApiItem.
  // If the mapping would be ambiguous (e.g. "MyClass" is defined by multiple packages)
  // then it is excluded from the mapping.  Also excluded are ApiItem objects (such as package
  // and function) which are not typically used as a data type.
  private _apiItemsByTypeName: Map<string, ApiItem>;
  private _apiItemToFile: Map<ApiItem, string>;
  private _apiItemToUid: Map<ApiItem, string>;
  private _uidToApiItem: Map<string, ApiItem>;

  private _outputFolder: string;

  public constructor(apiModel: ApiModel) {
    this._apiModel = apiModel;
    this._markdownEmitter = new CustomMarkdownEmitter(this._apiModel);
    this._apiItemsByTypeName = new Map<string, ApiItem>();
    this._apiItemToUid = new Map<ApiItem, string>();
    this._apiItemToFile = new Map<ApiItem, string>();
    this._uidToApiItem = new Map<string, ApiItem>();

    this._precompute();
    this._initApiItemsByTypeName();
  }

  /** @virtual */
  public generateFiles(outputFolder: string): void {
    this._outputFolder = outputFolder;

    console.log();
    this._deleteOldOutputFiles();

    for (const apiPackage of this._apiModel.packages) {
      console.log(`Writing ${apiPackage.name} package`);
      this._visitApiItems(apiPackage, undefined);
    }

    this._writeTocFile(this._apiModel.packages);
  }

  /** @virtual */
  protected onGetTocRoot(): IYamlTocItem {
    return {
      name: 'SharePoint Framework reference',
      href: '~/overview/sharepoint.md',
      items: [ ]
    };
  }

  /** @virtual */
  protected onCustomizeYamlItem(yamlItem: IYamlItem): void { // virtual
    // (overridden by child class)
  }

  private _visitApiItems(apiItem: ApiDocumentedItem, parentYamlFile: IYamlApiFile | undefined): boolean {
    const yamlItem: IYamlItem | undefined = this._generateYamlItem(apiItem);
    if (!yamlItem) {
      return false;
    }

    this.onCustomizeYamlItem(yamlItem);

    if (this._shouldEmbed(apiItem.kind)) {
      if (!parentYamlFile) {
        throw new InternalError('Missing file context');
      }
      parentYamlFile.items.push(yamlItem);
    } else {
      const newYamlFile: IYamlApiFile = {
        items: []
      };
      newYamlFile.items.push(yamlItem);

      let children: ReadonlyArray<ApiItem>;
      if (apiItem.kind === ApiItemKind.Package) {
        // Skip over the entry point, since it's not part of the documentation hierarchy
        children = apiItem.members[0].members;
      } else {
        children = apiItem.members;
      }

      const flattenedChildren: ApiItem[] = this._flattenNamespaces(children);

      for (const child of flattenedChildren) {
        if (child instanceof ApiDocumentedItem) {
          if (this._visitApiItems(child, newYamlFile)) {
            if (!yamlItem.children) {
              yamlItem.children = [];
            }
            yamlItem.children.push(this._getUid(child));
          }
        }
      }

      const yamlFilePath: string = this._getYamlFilePath(apiItem);

      if (apiItem.kind === ApiItemKind.Package) {
        console.log('Writing ' + yamlFilePath);
      }

      this._writeYamlFile(newYamlFile, yamlFilePath, 'UniversalReference', yamlApiSchema);

      if (parentYamlFile) {
        if (!parentYamlFile.references) {
          parentYamlFile.references = [];
        }

        parentYamlFile.references.push({
          uid: this._getUid(apiItem),
          name: this._getYamlItemName(apiItem)
        });

      }
    }

    return true;
  }

  // Since the YAML schema does not yet support nested namespaces, we simply omit them from
  // the tree.  However, _getYamlItemName() will show the namespace.
  private _flattenNamespaces(items: ReadonlyArray<ApiItem>): ApiItem[] {
    const flattened: ApiItem[] = [];
    for (const item of items) {
      if (item.kind === ApiItemKind.Namespace) {
        flattened.push(... this._flattenNamespaces(item.members));
      } else {
        flattened.push(item);
      }
    }
    return flattened;
  }

  /**
   * Write the table of contents
   */
  private _writeTocFile(apiItems: ReadonlyArray<ApiItem>): void {
    const tocFile: IYamlTocFile = this.buildYamlTocFile(apiItems);

    const tocFilePath: string = path.join(this._outputFolder, 'toc.yml');
    console.log('Writing ' + tocFilePath);

    this._disambiguateTocItems(tocFile.items);
    this._writeYamlFile(tocFile, tocFilePath, '', undefined);
  }

  /** @virtual */
  protected buildYamlTocFile(apiItems: ReadonlyArray<ApiItem>): IYamlTocFile {
    const tocFile: IYamlTocFile = {
      items: [ ]
    };

    const rootItem: IYamlTocItem = this.onGetTocRoot();
    tocFile.items.push(rootItem);

    rootItem.items!.push(...this._buildTocItems(apiItems));
    return tocFile;
  }

  private _buildTocItems(apiItems: ReadonlyArray<ApiItem>): IYamlTocItem[] {
    const tocItems: IYamlTocItem[] = [];
    for (const apiItem of apiItems) {
      let tocItem: IYamlTocItem;

      if (apiItem.kind === ApiItemKind.Namespace) {
        // Namespaces don't have nodes yet
        tocItem = {
          name: apiItem.displayName
        };
      } else {
        if (this._shouldEmbed(apiItem.kind)) {
          // Don't generate table of contents items for embedded definitions
          continue;
        }

        if (apiItem.kind === ApiItemKind.Package) {
          tocItem = {
            name: PackageName.getUnscopedName(apiItem.displayName),
            uid: this._getUid(apiItem)
          };
        } else {
          tocItem = {
            name: apiItem.displayName,
            uid: this._getUid(apiItem)
          };
        }
      }

      tocItems.push(tocItem);

      let children: ReadonlyArray<ApiItem>;
      if (apiItem.kind === ApiItemKind.Package) {
        // Skip over the entry point, since it's not part of the documentation hierarchy
        children = apiItem.members[0].members;
      } else {
        children = apiItem.members;
      }

      const childItems: IYamlTocItem[] = this._buildTocItems(children);
      if (childItems.length > 0) {
        tocItem.items = childItems;
      }
    }
    return tocItems;
  }

  protected _shouldEmbed(apiItemKind: ApiItemKind): boolean {
    switch (apiItemKind) {
      case ApiItemKind.Class:
      case ApiItemKind.Package:
      case ApiItemKind.Interface:
      case ApiItemKind.Enum:
      return false;
    }
    return true;
  }

  private _generateYamlItem(apiItem: ApiDocumentedItem): IYamlItem | undefined {
    // Filter out known items that are not yet supported
    switch (apiItem.kind) {
      case ApiItemKind.CallSignature:
      case ApiItemKind.ConstructSignature:
      case ApiItemKind.IndexSignature:
      case ApiItemKind.TypeAlias:
      case ApiItemKind.Variable:
        return undefined;
    }

    const yamlItem: Partial<IYamlItem> = { };
    yamlItem.uid = this._getUid(apiItem);

    if (apiItem.tsdocComment) {
      const tsdocComment: DocComment = apiItem.tsdocComment;
      if (tsdocComment.summarySection) {
        const summary: string = this._renderMarkdown(tsdocComment.summarySection, apiItem);
        if (summary) {
          yamlItem.summary = summary;
        }
      }

      if (tsdocComment.remarksBlock) {
        const remarks: string = this._renderMarkdown(tsdocComment.remarksBlock.content, apiItem);
        if (remarks) {
          yamlItem.remarks = remarks;
        }
      }

      if (tsdocComment.deprecatedBlock) {
        const deprecatedMessage: string = this._renderMarkdown(tsdocComment.deprecatedBlock.content, apiItem);
        if (deprecatedMessage.length > 0) {
          yamlItem.deprecated = { content: deprecatedMessage };
        }
      }
    }

    if (ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
      if (apiItem.releaseTag === ReleaseTag.Beta) {
        yamlItem.isPreview = true;
      }
    }

    yamlItem.name = this._getYamlItemName(apiItem);

    yamlItem.fullName = yamlItem.name;
    yamlItem.langs = [ 'typeScript' ];

    switch (apiItem.kind) {
      case ApiItemKind.Enum:
        yamlItem.type = 'enum';
        break;
      case ApiItemKind.EnumMember:
        yamlItem.type = 'field';
        const enumMember: ApiEnumMember = apiItem as ApiEnumMember;

        if (enumMember.initializerExcerpt.text.length > 0) {
          yamlItem.numericValue = enumMember.initializerExcerpt.text;
        }

        break;
      case ApiItemKind.Class:
        yamlItem.type = 'class';
        this._populateYamlClassOrInterface(yamlItem, apiItem as ApiClass);
        break;
      case ApiItemKind.Interface:
        yamlItem.type = 'interface';
        this._populateYamlClassOrInterface(yamlItem, apiItem as ApiInterface);
        break;
      case ApiItemKind.Method:
      case ApiItemKind.MethodSignature:
        yamlItem.type = 'method';
        this._populateYamlFunctionLike(yamlItem, apiItem as ApiMethod | ApiMethodSignature);
        break;

      case ApiItemKind.Constructor:
        yamlItem.type = 'constructor';
        this._populateYamlFunctionLike(yamlItem, apiItem as ApiConstructor);
        break;

      case ApiItemKind.Package:
        yamlItem.type = 'package';
        break;
      case ApiItemKind.Property:
      case ApiItemKind.PropertySignature:
        const apiProperty: ApiPropertyItem = apiItem as ApiPropertyItem;
        if (apiProperty.isEventProperty) {
          yamlItem.type = 'event';
        } else {
          yamlItem.type = 'property';
        }
        this._populateYamlProperty(yamlItem, apiProperty);
        break;

      case ApiItemKind.Function:
        yamlItem.type = 'function';
        this._populateYamlFunctionLike(yamlItem, apiItem as ApiFunction);
        break;

      default:
        throw new Error('Unimplemented item kind: ' + apiItem.kind);
    }

    if (apiItem.kind !== ApiItemKind.Package && !this._shouldEmbed(apiItem.kind)) {
      const associatedPackage: ApiPackage | undefined = apiItem.getAssociatedPackage();
      if (!associatedPackage) {
        throw new Error('Unable to determine associated package for ' + apiItem.displayName);
      }
      yamlItem.package = this._getUid(associatedPackage);
    }

    return yamlItem as IYamlItem;
  }

  private _populateYamlTypeParameters(apiItem: ApiTypeParameterListMixin): IYamlParameter[] {
    const typeParameters: IYamlParameter[] = [];
    for (const apiTypeParameter of apiItem.typeParameters) {
      const typeParameter: IYamlParameter = {
        id: apiTypeParameter.name
      };

      if (apiTypeParameter.tsdocTypeParamBlock) {
        typeParameter.description = this._renderMarkdown(apiTypeParameter.tsdocTypeParamBlock.content, apiItem);
      }

      if (!apiTypeParameter.constraintExcerpt.isEmpty) {
        typeParameter.type = [ this._linkToUidIfPossible(apiTypeParameter.constraintExcerpt.text) ];
      }

      typeParameters.push(typeParameter);
    }
    return typeParameters;
  }

  private _populateYamlClassOrInterface(yamlItem: Partial<IYamlItem>, apiItem: ApiClass | ApiInterface): void {
    if (apiItem instanceof ApiClass) {
      if (apiItem.extendsType) {
        yamlItem.extends = [ this._linkToUidIfPossible(apiItem.extendsType.excerpt.text) ];
      }
      if (apiItem.implementsTypes.length > 0) {
        yamlItem.implements = [];
        for (const implementsType of apiItem.implementsTypes) {
          yamlItem.implements.push(this._linkToUidIfPossible(implementsType.excerpt.text));
        }
      }
    } else if (apiItem instanceof ApiInterface) {
      if (apiItem.extendsTypes.length > 0) {
        yamlItem.extends = [];
        for (const extendsType of apiItem.extendsTypes) {
          yamlItem.extends.push(this._linkToUidIfPossible(extendsType.excerpt.text));
        }
      }

      const typeParameters: IYamlParameter[] = this._populateYamlTypeParameters(apiItem);
      if (typeParameters.length) {
        yamlItem.syntax = { typeParameters };
      }
    }

    if (apiItem.tsdocComment) {
      if (apiItem.tsdocComment.modifierTagSet.isSealed()) {
        let sealedMessage: string;
        if (apiItem.kind === ApiItemKind.Class) {
          sealedMessage = 'This class is marked as `@sealed`. Subclasses should not extend it.';
        } else {
          sealedMessage = 'This interface is marked as `@sealed`. Other interfaces should not extend it.';
        }
        if (!yamlItem.remarks) {
          yamlItem.remarks = sealedMessage;
        } else {
          yamlItem.remarks = sealedMessage + '\n\n' + yamlItem.remarks;
        }
      }
    }
  }

  private _populateYamlFunctionLike(yamlItem: Partial<IYamlItem>, apiItem: ApiMethod | ApiMethodSignature
    | ApiConstructor | ApiFunction): void {

    const syntax: IYamlSyntax = {
      content: apiItem.getExcerptWithModifiers()
    };
    yamlItem.syntax = syntax;

    if (ApiReturnTypeMixin.isBaseClassOf(apiItem)) {
      const returnType: string = this._linkToUidIfPossible(apiItem.returnTypeExcerpt.text);

      let returnDescription: string = '';

      if (apiItem.tsdocComment && apiItem.tsdocComment.returnsBlock) {
        returnDescription = this._renderMarkdown(apiItem.tsdocComment.returnsBlock.content, apiItem);
        // temporary workaround for people who mistakenly add a hyphen, e.g. "@returns - blah"
        returnDescription = returnDescription.replace(/^\s*-\s+/, '');
      }

      if (returnType || returnDescription) {
        syntax.return = {
          type: [ returnType ],
          description: returnDescription
        };
      }
    }

    const parameters: IYamlParameter[] = [];
    for (const apiParameter of apiItem.parameters) {
      let parameterDescription: string = '';
      if (apiParameter.tsdocParamBlock) {
        parameterDescription = this._renderMarkdown(apiParameter.tsdocParamBlock.content, apiItem);
      }

      parameters.push(
        {
           id: apiParameter.name,
           description:  parameterDescription,
           type: [ this._linkToUidIfPossible(apiParameter.parameterTypeExcerpt.text) ]
        } as IYamlParameter
      );
    }

    if (parameters.length) {
      syntax.parameters = parameters;
    }

    if (ApiTypeParameterListMixin.isBaseClassOf(apiItem)) {
      const typeParameters: IYamlParameter[] = this._populateYamlTypeParameters(apiItem);
      if (typeParameters.length) {
        syntax.typeParameters = typeParameters;
      }
    }

  }

  private _populateYamlProperty(yamlItem: Partial<IYamlItem>, apiItem: ApiPropertyItem): void {
    const syntax: IYamlSyntax = {
      content: apiItem.getExcerptWithModifiers()
    };
    yamlItem.syntax = syntax;

    if (apiItem.propertyTypeExcerpt.text) {
      syntax.return = {
        type: [ this._linkToUidIfPossible(apiItem.propertyTypeExcerpt.text) ]
      };
    }
  }

  private _renderMarkdown(docSection: DocSection, contextApiItem: ApiItem): string {
    const stringBuilder: StringBuilder = new StringBuilder();

    this._markdownEmitter.emit(stringBuilder, docSection, {
      contextApiItem,
      onGetFilenameForApiItem: (apiItem: ApiItem) => {
        // NOTE: GitHub's markdown renderer does not resolve relative hyperlinks correctly
        // unless they start with "./" or "../".
        return `xref:${this._getUid(apiItem)}`;
      }
    });

    return stringBuilder.toString().trim();
  }

  private _disambiguateTocItems(items: IYamlTocItem[]): void {
    // Track the number of times a toc item occurs for the same name at this level.
    const nameCollisions: Map<string, IYamlTocItem[]> = new Map<string, IYamlTocItem[]>();
    const recordedNames: Set<string> = new Set<string>();
    for (const item of items) {
      if (item.items) {
        this._disambiguateTocItems(item.items);
      }

      recordedNames.add(item.name);
      let collisions: IYamlTocItem[] | undefined = nameCollisions.get(item.name);
      if (!collisions) {
        nameCollisions.set(item.name, collisions = []);
      }
      collisions.push(item);
    }

    // Disambiguate any collisions.
    for (const [name, collisions] of nameCollisions) {
      if (collisions.length === 1) {
        continue;
      }

      // find the highest precedence among collisions
      for (const collision of collisions) {
        // If a toc item doesn't have a uid, or the uid does not correlate to an ApiItem we know of, then it must not
        // be renamed.
        const apiItem: ApiItem | undefined = collision.uid ? this._uidToApiItem.get(collision.uid) : undefined;
        if (!apiItem) {
          continue;
        }

        // Disambiguate the name by appending its kind. Provide further disambiguation if necessary, appending
        // something like '_2', '_3', etc. if there is still a collision.
        let candidateName: string;
        let attempt: number = 0;
        do {
          candidateName = `${name} (${apiItem.kind})${attempt === 0 ? '' : ` (${attempt + 1})`}`;
          attempt++;
        } while (recordedNames.has(candidateName));

        recordedNames.add(candidateName);
        collision.name = candidateName;
      }
    }
  }

  private _writeYamlFile(dataObject: {}, filePath: string, yamlMimeType: string,
    schema: JsonSchema|undefined): void {

    JsonFile.validateNoUndefinedMembers(dataObject);

    let stringified: string = yaml.safeDump(dataObject, {
      lineWidth: 120
    });

    if (yamlMimeType) {
      stringified = `### YamlMime:${yamlMimeType}\n` + stringified;
    }

    FileSystem.writeFile(filePath, stringified, {
      convertLineEndings: NewlineKind.CrLf,
      ensureFolderExists: true
    });

    if (schema) {
      schema.validateObject(dataObject, filePath);
    }
  }

  /**
   * Calculate the DocFX "uid" for the ApiItem
   * Example:  node-core-library.JsonFile.load
   */
  protected _getUid(apiItem: ApiItem): string {
    if (!this._canHaveUid(apiItem)) {
      return '';
    }

    const uid: string | undefined = this._apiItemToUid.get(apiItem);
    if (uid === undefined) {
      throw new InternalError(`Failed to precompute uid for ApiItem of kind '${apiItem.kind}'`);
    }

    return uid;
  }

  private _precompute(): void {
    // In order to ensure uid and file generation and disambiguation is stable, we must precompute the uids for each
    // item by walking the tree. We perform this computation in two phases:
    // 1. Package, Namespace, Class, Interface, Enum, TypeAlias, Variable, EnumMember, Property, PropertySignature
    //    - These items only depend on the uids of their containers.
    // 2. Function, Constructor, Method, MethodSignature
    //    - These items may have overloads and are disambiguated by the types of their parameters, which must
    //      already be pre-computed in the phase 1.

    const context: IPrecomputeContext = {
      recordedPaths: new Set<string>(),
      apiItemNeedsDisambiguation: new Map<ApiItem, boolean>(),
      uidFragmentCache: new Map<ApiItem, string>()
    };

    this._precomputeNonFunctionLikeRecursive(this._apiModel, '', 0, context);
    this._precomputeFunctionLikeRecursive(this._apiModel, '', 0, context);
  }

  private _precomputeNonFunctionLikeRecursive(apiItem: ApiItem, parentUid: string, packageLength: number,
    context: IPrecomputeContext): void {

    const uid: string = this._precomputeUidAndPath(apiItem, parentUid, packageLength, context);
    if (apiItem.kind === ApiItemKind.Package) {
      packageLength = uid.length;
    }

    for (const member of apiItem.members) {
      if (!this._isFunctionLike(member)) {
        this._precomputeNonFunctionLikeRecursive(member, uid, packageLength, context);
      }
    }
  }

  private _precomputeFunctionLikeRecursive(apiItem: ApiItem, parentUid: string, packageLength: number,
    context: IPrecomputeContext): void {

    if (this._isFunctionLike(apiItem)) {
      this._precomputeUidAndPath(apiItem, parentUid, packageLength, context);
    } else {
      const uid: string | undefined = this._canHaveUid(apiItem) ? this._apiItemToUid.get(apiItem) : '';
      if (uid === undefined) {
        throw new InternalError('Failed to precompute uid for item in first pass.');
      }
      if (apiItem.kind === ApiItemKind.Package) {
        packageLength = uid.length;
      }
      for (const member of apiItem.members) {
        this._precomputeFunctionLikeRecursive(member, uid, packageLength, context);
      }
    }
  }

  private _precomputeUidAndPath(apiItem: ApiItem, parentUid: string, packageLength: number,
    context: IPrecomputeContext): string {

    if (this._canHaveUid(apiItem)) {
      const itemUid: string = this._getUidFragment(apiItem, context);

      // Compute whether an ApiItem has a uid collision with any other ApiItems in the same scope.
      let needsDisambiguation: boolean | undefined;
      if (apiItem.parent) {
        needsDisambiguation = context.apiItemNeedsDisambiguation.get(apiItem);
        if (needsDisambiguation === undefined) {
          const collisions: ApiItem[] = apiItem.parent.members
            .filter(item => this._getUidFragment(item, context) === itemUid);

          if (collisions.length === 1) {
            // If there is only one thing with this uid, the item does not need disambiguation.
            needsDisambiguation = false;
            context.apiItemNeedsDisambiguation.set(apiItem, false);
          } else {
            // Determine which collision has the highest precedence.
            let highestPrecedence: number = -1;
            for (const collision of collisions) {
              highestPrecedence = Math.max(highestPrecedence, this._getDisambiguationPrecedence(collision));
            }

            // Store whether each collision needs disambiguation.
            //
            // A suffix will *not* be added if the item has the highest precedence among its siblings. The precedence
            // is:
            // 1. Classes, Functions, Enums, Variables
            // 2. Interfaces, TypeAliases
            // 3. Namespaces
            //
            // If a class, an interface, and a namespace all have the same uid ('MyService'), it will generate the
            // following:
            // - ApiClass: 'MyService'
            // - ApiInterface: 'MyService:interface'
            // - ApiNamespace: 'MyService:namespace'
            //
            // If an interface and a namespace both have the same uid ('MyService'), it will generate the following:
            // - ApiInterface: 'MyService'
            // - ApiNamespace: 'MyService:namespace'
            for (const collision of collisions) {
              const collisionNeedsDisambiguation: boolean =
                this._getDisambiguationPrecedence(collision) < highestPrecedence;

              context.apiItemNeedsDisambiguation.set(apiItem, collisionNeedsDisambiguation);
              if (collision === apiItem) {
                needsDisambiguation = collisionNeedsDisambiguation;
              }
            }
          }
        }
      }

      // Adds something like ':interface' to disambiguate declarations with the same name but different kinds.
      let candidateUid: string = this._combineUids(parentUid, itemUid, '.');
      if (needsDisambiguation) {
        candidateUid += ':' + apiItem.kind.toLowerCase();
      }

      const packagePath: string = packageLength ? this._safePath(candidateUid.slice(0, packageLength)) : '';
      const itemFile: string = this._safePath(packageLength ? candidateUid.slice(packageLength + 1) : candidateUid);
      const candidateFile: string = path.join(packagePath, itemFile);

      // Provide further disambiguation if necessary, appending something like '_2', '_3', etc.
      // The first item in gets the uid without a disambiguation suffix.
      let attempt: number = 0;
      let uid: string;
      let file: string;
      do {
        uid = attempt === 0 ? candidateUid : `${candidateUid}_${attempt + 1}`;
        file = attempt === 0 ? `${candidateFile}.yml` : `${candidateFile}_${attempt + 1}.yml`;
        attempt++;
      } while (this._uidToApiItem.has(uid) || context.recordedPaths.has(file));

      // Record the mappings from uid and file to ApiItem.
      this._apiItemToUid.set(apiItem, uid);
      this._apiItemToFile.set(apiItem, file);

      // Prevent any other ApiItem from using this uid or file.
      this._uidToApiItem.set(uid, apiItem);
      context.recordedPaths.add(file);
      return uid;
    } else {
      return parentUid;
    }
  }

  private _canHaveUid(apiItem: ApiItem): boolean {
    switch (apiItem.kind) {
      case ApiItemKind.Model:
      case ApiItemKind.EntryPoint:
      case ApiItemKind.CallSignature:
      case ApiItemKind.ConstructSignature:
      case ApiItemKind.IndexSignature:
        return false;
    }
    return true;
  }

  private _isFunctionLike(apiItem: ApiItem): boolean {
    switch (apiItem.kind) {
      case ApiItemKind.CallSignature:
      case ApiItemKind.ConstructSignature:
      case ApiItemKind.Function:
      case ApiItemKind.Constructor:
      case ApiItemKind.Method:
      case ApiItemKind.MethodSignature:
        return true;
    }
    return false;
  }

  /**
   * Gets the unscoped/non-namespaced portion of the uid for an ApiItem.
   */
  private _getUidFragment(apiItem: ApiItem, context: IPrecomputeContext): string {
    let fragment: string | undefined = context.uidFragmentCache.get(apiItem);
    if (fragment === undefined) {
      switch (apiItem.kind) {
        case ApiItemKind.Package:
          fragment = PackageName.getUnscopedName(apiItem.displayName);
          break;
        case ApiItemKind.Constructor:
          fragment = `constructor${this._getSignatureUidSuffix(apiItem as ApiConstructor)}`;
          break;
        case ApiItemKind.Function:
        case ApiItemKind.Method:
        case ApiItemKind.MethodSignature:
          fragment = `${apiItem.displayName}${this._getSignatureUidSuffix(apiItem as ApiParameterListMixin)}`;
          break;
        case ApiItemKind.Class:
        case ApiItemKind.Interface:
        case ApiItemKind.TypeAlias:
        case ApiItemKind.Namespace:
        case ApiItemKind.Variable:
        case ApiItemKind.Enum:
        case ApiItemKind.EnumMember:
        case ApiItemKind.Property:
        case ApiItemKind.PropertySignature:
          fragment = apiItem.displayName;
          break;
        default:
            return '';
      }
      context.uidFragmentCache.set(apiItem, fragment);
    }
    return fragment;
  }

  /**
   * Gets the precedence of an ApiItem for use when performing disambiguation.
   * The highest precedence item often avoids needing a suffix.
   */
  private _getDisambiguationPrecedence(apiItem: ApiItem): number {
    switch (apiItem.kind) {
      case ApiItemKind.Class:
      case ApiItemKind.Enum:
        // Classes and Enums both exist in the type-space and value-space and cannot merge with each other.
        return 4;
      case ApiItemKind.Interface:
      case ApiItemKind.TypeAlias:
        // Interfaces and TypeAliases both exist in type-space and cannot merge with each other.
        return 3;
      case ApiItemKind.Function:
      case ApiItemKind.Variable:
        // Functions and Variables both exist in value-space and cannot merge with each other.
        return 2;
      case ApiItemKind.Namespace:
        // Namespaces merge with everything except variables.
        return 1;
      default:
        // Anything else we will always disambiguate.
        return 0;
    }
  }

  private _getSignatureUidSuffix(apiItem: ApiParameterListMixin): string {
    // Generate a uid suffix do disambiguate function-like items by emulating the naming behavior of the .NET
    // Metadata specification.
    //
    // Per the Generics section of the .NET Metadata specification:
    // https://dotnet.github.io/docfx/spec/metadata_dotnet_spec.html#6-generics
    //
    // > The *ID* of a generic method uses postfix '``n', 'n' is the count of in method parameters, for example,
    // > 'System.Tuple.Create``1(``0)'.
    //
    // Per the Methods section of the .NET Metadata specification:
    // https://dotnet.github.io/docfx/spec/metadata_dotnet_spec.html#52-methods
    //
    // > The *ID* of a method is defined by its name, followed by the list of the *UIDs* of its parameter types.
    // > When a method does not have parameter, its *ID* **MUST** end with parentheses.

    let result: string = '';

    const typeParameterToIndex: Map<string, number> = new Map<string, number>();
    if (ApiTypeParameterListMixin.isBaseClassOf(apiItem) && apiItem.typeParameters.length) {
      for (let i: number = 0; i < apiItem.typeParameters.length; i++) {
        typeParameterToIndex.set(apiItem.typeParameters[i].name, i);
      }
      result += `\`\`${apiItem.typeParameters.length}`;
    }

    result += '(';
    for (let i: number = 0; i < apiItem.parameters.length; i++) {
      if (i > 0) {
        result += ',';
      }
      const parameter: Parameter = apiItem.parameters[i];
      if (!parameter.parameterTypeExcerpt.isEmpty) {
        const typeParameterIndex: number | undefined =
          typeParameterToIndex.get(parameter.parameterTypeExcerpt.text.trim());

        if (typeParameterIndex !== undefined) {
          result += `\`\`${typeParameterIndex}`;
        } else {
          result += this._linkToUidIfPossible(parameter.parameterTypeExcerpt.text);
        }
      }
    }

    return result + ')';
  }

  private _combineUids(left: string, right: string, sep: string): string {
    return left ? right ? `${left}${sep}${right}` : left : right;
  }

  private _safePath(file: string): string {
    // allow unicode word characters to support non-english language characters.
    return file.toLowerCase().replace(/[^-.\w]/gu, () => '_');
  }

  /**
   * Initialize the _apiItemsByTypeName data structure.
   */
  private _initApiItemsByTypeName(): void {
    // Collect the _apiItemsByTypeName table
    const ambiguousNames: Set<string> = new Set<string>();

    this._initApiItemsByTypeNameRecursive(this._apiModel, ambiguousNames);

    // Remove the ambiguous matches
    for (const ambiguousName of ambiguousNames) {
      this._apiItemsByTypeName.delete(ambiguousName);
    }
  }

  /**
   * Helper for _initApiItemsByTypeName()
   */
  private _initApiItemsByTypeNameRecursive(apiItem: ApiItem, ambiguousNames: Set<string>): void {
    switch (apiItem.kind) {
      case ApiItemKind.Class:
      case ApiItemKind.Enum:
      case ApiItemKind.Interface:
        // Attempt to register both the fully qualified name and the short name
        const namesForType: string[] = [apiItem.displayName];

        // Note that nameWithDot cannot conflict with apiItem.name (because apiItem.name
        // cannot contain a dot)
        const nameWithDot: string | undefined = this._getTypeNameWithDot(apiItem);
        if (nameWithDot) {
          namesForType.push(nameWithDot);
        }

        // Register all names
        for (const typeName of namesForType) {
          if (ambiguousNames.has(typeName)) {
            break;
          }

          if (this._apiItemsByTypeName.has(typeName)) {
            // We saw this name before, so it's an ambiguous match
            ambiguousNames.add(typeName);
            break;
          }

          this._apiItemsByTypeName.set(typeName, apiItem);
        }

        break;
    }

    // Recurse container members
    if (ApiItemContainerMixin.isBaseClassOf(apiItem)) {
      for (const apiMember of apiItem.members) {
        this._initApiItemsByTypeNameRecursive(apiMember, ambiguousNames);
      }
    }
  }

  /**
   * This is a temporary workaround to enable limited autolinking of API item types
   * until the YAML file format is enhanced to support general hyperlinks.
   * @remarks
   * In the current version, fields such as IApiProperty.type allow either:
   * (1) a UID identifier such as "node-core-library.JsonFile" which will be rendered
   * as a hyperlink to that type name, or (2) a block of freeform text that must not
   * contain any Markdown links.  The _substituteUidForSimpleType() function assumes
   * it is given #2 but substitutes #1 if the name can be matched to a ApiItem.
   */
  private _linkToUidIfPossible(typeName: string): string {
    // Note that typeName might be a _getTypeNameWithDot() name or it might be a simple class name
    const apiItem: ApiItem | undefined = this._apiItemsByTypeName.get(typeName.trim());
    if (apiItem) {
      // Substitute the UID
      return this._getUid(apiItem);
    }
    return typeName;
  }

  /**
   * If the apiItem represents a scoped name such as "my-library#MyNamespace.MyClass",
   * this returns a string such as "MyNamespace.MyClass".  If the result would not
   * have at least one dot in it, then undefined is returned.
   */
  private _getTypeNameWithDot(apiItem: ApiItem): string | undefined {
    const result: string = apiItem.getScopedNameWithinPackage();
    if (result.indexOf('.') >= 0) {
      return result;
    }
    return undefined;
  }

  private _getYamlItemName(apiItem: ApiItem): string {
    if (apiItem.parent && apiItem.parent.kind === ApiItemKind.Namespace) {
      // For members a namespace, show the full name excluding the package part:
      // Example: excel.Excel.Binding --> Excel.Binding
      return this._getUid(apiItem).replace(/^[^.]+\./, '');
    }
    return Utilities.getConciseSignature(apiItem);
  }

  private _getYamlFilePath(apiItem: ApiItem): string {
    if (!this._canHaveUid(apiItem)) {
      return '';
    }

    const file: string | undefined = this._apiItemToFile.get(apiItem);
    if (file === undefined) {
      throw new InternalError(`Failed to precompute path for ApiItem of kind '${apiItem.kind}'`);
    }

    return path.join(this._outputFolder, file);
  }

  private _deleteOldOutputFiles(): void {
    console.log('Deleting old output from ' + this._outputFolder);
    FileSystem.ensureEmptyFolder(this._outputFolder);
  }
}
