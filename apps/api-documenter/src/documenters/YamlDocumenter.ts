// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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
  ApiProperty,
  ApiPropertyItem,
  ApiMethod,
  ApiMethodSignature,
  ApiPropertySignature,
  ApiItemContainerMixin,
  ApiPackage,
  ApiFunctionLikeMixin,
  ApiEnumMember
} from '@microsoft/api-extractor';

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

  private _outputFolder: string;

  public constructor(apiModel: ApiModel) {
    this._apiModel = apiModel;
    this._markdownEmitter = new CustomMarkdownEmitter(this._apiModel);
    this._apiItemsByTypeName = new Map<string, ApiItem>();

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
    const tocFile: IYamlTocFile = {
      items: [ ]
    };

    const rootItem: IYamlTocItem = this.onGetTocRoot();
    tocFile.items.push(rootItem);

    rootItem.items!.push(...this._buildTocItems(apiItems));

    const tocFilePath: string = path.join(this._outputFolder, 'toc.yml');
    console.log('Writing ' + tocFilePath);
    this._writeYamlFile(tocFile, tocFilePath, '', undefined);
  }

  private _buildTocItems(apiItems: ReadonlyArray<ApiItem>): IYamlTocItem[] {
    const tocItems: IYamlTocItem[] = [];
    for (const apiItem of apiItems) {
      let tocItem: IYamlTocItem;

      if (apiItem.kind === ApiItemKind.Namespace) {
        // Namespaces don't have nodes yet
        tocItem = {
          name: apiItem.name
        };
      } else {
        if (this._shouldEmbed(apiItem.kind)) {
          // Don't generate table of contents items for embedded definitions
          continue;
        }

        if (apiItem.kind === ApiItemKind.Package) {
          tocItem = {
            name: PackageName.getUnscopedName(apiItem.name),
            uid: this._getUid(apiItem)
          };
        } else {
          tocItem = {
            name: apiItem.name,
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

  private _shouldEmbed(apiItemKind: ApiItemKind): boolean {
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
        this._populateYamlClassOrInterface(yamlItem, apiItem);
        break;
      case ApiItemKind.Interface:
        yamlItem.type = 'interface';
        this._populateYamlClassOrInterface(yamlItem, apiItem);
        break;
      case ApiItemKind.Method:
      case ApiItemKind.MethodSignature:
        yamlItem.type = 'method';
        this._populateYamlFunctionLike(yamlItem, apiItem as ApiMethod);
        break;
      /*
      case ApiItemKind.Constructor:
        yamlItem.type = 'constructor';
        this._populateYamlFunctionLike(yamlItem, apiItem);
        break;
      */
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
        this._populateYamlProperty(yamlItem, apiItem as ApiProperty);
        break;
      /*
      case ApiItemKind.Function:
        yamlItem.type = 'function';
        this._populateYamlFunctionLike(yamlItem, apiItem);
        break;
      default:
        throw new Error('Unimplemented item kind: ' + apiItem.kind);
      */
    }

    if (apiItem.kind !== ApiItemKind.Package && !this._shouldEmbed(apiItem.kind)) {
      const associatedPackage: ApiPackage | undefined = apiItem.getAssociatedPackage();
      if (!associatedPackage) {
        throw new Error('Unable to determine associated package for ' + apiItem.name);
      }
      yamlItem.package = this._getUid(associatedPackage);
    }

    return yamlItem as IYamlItem;
  }

  private _populateYamlClassOrInterface(yamlItem: Partial<IYamlItem>, apiItem: ApiDocumentedItem): void {
    /*
    if (apiStructure.extends) {
      yamlItem.extends = [ this._linkToUidIfPossible(apiStructure.extends) ];
    }

    if (apiStructure.implements) {
      yamlItem.implements = [ this._linkToUidIfPossible(apiStructure.implements) ];
    }
    */

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

  private _populateYamlFunctionLike(yamlItem: Partial<IYamlItem>, apiItem: ApiMethod | ApiMethodSignature): void {
    const syntax: IYamlSyntax = {
      content: apiItem.getExcerptWithModifiers()
    };
    yamlItem.syntax = syntax;

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
  }

  private _populateYamlProperty(yamlItem: Partial<IYamlItem>, apiItem: ApiProperty | ApiPropertySignature): void {
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
  private _getUid(apiItem: ApiItem): string {
    let result: string = '';
    for (const hierarchyItem of apiItem.getHierarchy()) {

      // For overloaded methods, add a suffix such as "MyClass.myMethod_2".
      let qualifiedName: string = hierarchyItem.name;
      if (ApiFunctionLikeMixin.isBaseClassOf(hierarchyItem)) {
        if (hierarchyItem.overloadIndex > 0) {
          qualifiedName += `_${hierarchyItem.overloadIndex}`;
        }
      }

      switch (hierarchyItem.kind) {
        case ApiItemKind.Model:
        case ApiItemKind.EntryPoint:
          break;
        case ApiItemKind.Package:
          result += PackageName.getUnscopedName(hierarchyItem.name);
          break;
        default:
          result += '.';
          result += qualifiedName;
          break;
      }
    }
    return result;
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
        const namesForType: string[] = [apiItem.name];

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
    let result: string = '';

    for (const current of apiItem.getHierarchy()) {
      switch (current.kind) {
        case ApiItemKind.Model:
        case ApiItemKind.EntryPoint:
          break;
        case ApiItemKind.Package:
          result += PackageName.getUnscopedName(current.name);
          break;
        default:
          if (current.parent && current.parent.kind === ApiItemKind.EntryPoint) {
            result += '/';
          } else {
            result += '.';
          }
          result += current.name;
          break;
      }
    }
    return path.join(this._outputFolder, result.toLowerCase() + '.yml');
  }

  private _deleteOldOutputFiles(): void {
    console.log('Deleting old output from ' + this._outputFolder);
    FileSystem.ensureEmptyFolder(this._outputFolder);
  }
}
