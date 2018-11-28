// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as colors from 'colors';

import yaml = require('js-yaml');
import {
  JsonFile,
  JsonSchema,
  PackageName,
  FileSystem,
  NewlineKind
} from '@microsoft/node-core-library';
import {
  MarkupElement,
  IApiMethod,
  IApiConstructor,
  IApiParameter,
  IApiProperty,
  IApiEnumMember,
  IApiClass,
  IApiInterface,
  Markup
} from '@microsoft/api-extractor';

import { DocItemSet, DocItem, DocItemKind, IDocItemSetResolveResult } from '../utils/DocItemSet';
import {
  IYamlApiFile,
  IYamlItem,
  IYamlSyntax,
  IYamlParameter
} from './IYamlApiFile';
import {
  IYamlTocFile,
  IYamlTocItem
} from './IYamlTocFile';
import { Utilities } from '../utils/Utilities';
import { MarkdownRenderer, IMarkdownRenderApiLinkArgs } from '../utils/MarkdownRenderer';

const yamlApiSchema: JsonSchema = JsonSchema.fromFile(path.join(__dirname, 'typescript.schema.json'));

/**
 * Writes documentation in the Universal Reference YAML file format, as defined by typescript.schema.json.
 */
export class YamlDocumenter {
  private _docItemSet: DocItemSet;

  // This is used by the _linkToUidIfPossible() workaround.
  // It stores a mapping from type name (e.g. "MyClass") to the corresponding DocItem.
  // If the mapping would be ambiguous (e.g. "MyClass" is defined by multiple packages)
  // then it is excluded from the mapping.  Also excluded are DocItems (such as package
  // and function) which are not typically used as a data type.
  private _docItemsByTypeName: Map<string, DocItem>;

  private _outputFolder: string;

  public constructor(docItemSet: DocItemSet) {
    this._docItemSet = docItemSet;
    this._docItemsByTypeName = new Map<string, DocItem>();

    this._initDocItemsByTypeName();
  }

  public generateFiles(outputFolder: string): void { // virtual
    this._outputFolder = outputFolder;

    console.log();
    this._deleteOldOutputFiles();

    for (const docPackage of this._docItemSet.docPackages) {
      this._visitDocItems(docPackage, undefined);
    }

    this._writeTocFile(this._docItemSet.docPackages);
  }

  protected onGetTocRoot(): IYamlTocItem {  // virtual
    return {
      name: 'SharePoint Framework reference',
      href: '~/overview/sharepoint.md',
      items: [ ]
    };
  }

  protected onCustomizeYamlItem(yamlItem: IYamlItem): void { // virtual
    // (overridden by child class)
  }

  private _visitDocItems(docItem: DocItem, parentYamlFile: IYamlApiFile | undefined): boolean {
    const yamlItem: IYamlItem | undefined = this._generateYamlItem(docItem);
    if (!yamlItem) {
      return false;
    }

    this.onCustomizeYamlItem(yamlItem);

    if (this._shouldEmbed(docItem.kind)) {
      if (!parentYamlFile) {
        throw new Error('Missing file context'); // program bug
      }
      parentYamlFile.items.push(yamlItem);
    } else {
      const newYamlFile: IYamlApiFile = {
        items: []
      };
      newYamlFile.items.push(yamlItem);

      const flattenedChildren: DocItem[] = this._flattenNamespaces(docItem.children);

      for (const child of flattenedChildren) {
        if (this._visitDocItems(child, newYamlFile)) {
          if (!yamlItem.children) {
            yamlItem.children = [];
          }
          yamlItem.children.push(this._getUid(child));
        }
      }

      const yamlFilePath: string = this._getYamlFilePath(docItem);

      if (docItem.kind === DocItemKind.Package) {
        console.log('Writing ' + this._getYamlFilePath(docItem));
      }

      this._writeYamlFile(newYamlFile, yamlFilePath, 'UniversalReference', yamlApiSchema);

      if (parentYamlFile) {
        if (!parentYamlFile.references) {
          parentYamlFile.references = [];
        }

        parentYamlFile.references.push({
          uid: this._getUid(docItem),
          name: this._getYamlItemName(docItem)
        });

      }
    }

    return true;
  }

  // Since the YAML schema does not yet support nested namespaces, we simply omit them from
  // the tree.  However, _getYamlItemName() will show the namespace.
  private _flattenNamespaces(items: DocItem[]): DocItem[] {
    const flattened: DocItem[] = [];
    for (const item of items) {
      if (item.kind === DocItemKind.Namespace) {
        flattened.push(... this._flattenNamespaces(item.children));
      } else {
        flattened.push(item);
      }
    }
    return flattened;
  }

  /**
   * Write the table of contents
   */
  private _writeTocFile(docItems: DocItem[]): void {
    const tocFile: IYamlTocFile = {
      items: [ ]
    };

    const rootItem: IYamlTocItem = this.onGetTocRoot();
    tocFile.items.push(rootItem);

    rootItem.items!.push(...this._buildTocItems(docItems));

    const tocFilePath: string = path.join(this._outputFolder, 'toc.yml');
    console.log('Writing ' + tocFilePath);
    this._writeYamlFile(tocFile, tocFilePath, '', undefined);
  }

  private _buildTocItems(docItems: DocItem[]): IYamlTocItem[] {
    const tocItems: IYamlTocItem[] = [];
    for (const docItem of docItems) {
      let tocItem: IYamlTocItem;

      if (docItem.kind === DocItemKind.Namespace) {
        // Namespaces don't have nodes yet
        tocItem = {
          name: docItem.name
        };
      } else {
        if (this._shouldEmbed(docItem.kind)) {
          // Don't generate table of contents items for embedded definitions
          continue;
        }

        if (docItem.kind === DocItemKind.Package) {
          tocItem = {
            name: PackageName.getUnscopedName(docItem.name),
            uid: this._getUid(docItem)
          };
        } else {
          tocItem = {
            name: docItem.name,
            uid: this._getUid(docItem)
          };
        }
      }

      tocItems.push(tocItem);

      const childItems: IYamlTocItem[] = this._buildTocItems(docItem.children);
      if (childItems.length > 0) {
        tocItem.items = childItems;
      }
    }
    return tocItems;
  }

  private _shouldEmbed(docItemKind: DocItemKind): boolean {
    switch (docItemKind) {
      case DocItemKind.Class:
      case DocItemKind.Package:
      case DocItemKind.Interface:
      case DocItemKind.Enum:
      return false;
    }
    return true;
  }

  private _generateYamlItem(docItem: DocItem): IYamlItem | undefined {
    const yamlItem: Partial<IYamlItem> = { };
    yamlItem.uid = this._getUid(docItem);

    const summary: string = this._renderMarkdown(docItem.apiItem.summary, docItem);
    if (summary) {
      yamlItem.summary = summary;
    }

    const remarks: string = this._renderMarkdown(docItem.apiItem.remarks, docItem);
    if (remarks) {
      yamlItem.remarks = remarks;
    }

    if (docItem.apiItem.deprecatedMessage) {
      if (docItem.apiItem.deprecatedMessage.length > 0) {
        const deprecatedMessage: string = this._renderMarkdown(docItem.apiItem.deprecatedMessage, docItem);
        yamlItem.deprecated = { content: deprecatedMessage };
      }
    }

    if (docItem.apiItem.isBeta) {
      yamlItem.isPreview = true;
    }

    yamlItem.name = this._getYamlItemName(docItem);

    yamlItem.fullName = yamlItem.name;
    yamlItem.langs = [ 'typeScript' ];

    switch (docItem.kind) {
      case DocItemKind.Package:
        yamlItem.type = 'package';
        break;
      case DocItemKind.Enum:
        yamlItem.type = 'enum';
        break;
      case DocItemKind.EnumMember:
        yamlItem.type = 'field';
        const enumMember: IApiEnumMember = docItem.apiItem as IApiEnumMember;
        if (enumMember.value) {
          // NOTE: In TypeScript, enum members can be strings or integers.
          // If it is an integer, then enumMember.value will be a string representation of the integer.
          // If it is a string, then enumMember.value will include the quotation marks.
          // Enum values can also be calculated numbers, however this is not implemented yet.
          yamlItem.numericValue = enumMember.value as any; // tslint:disable-line:no-any
        }
        break;
      case DocItemKind.Class:
        yamlItem.type = 'class';
        this._populateYamlClassOrInterface(yamlItem, docItem);
        break;
      case DocItemKind.Interface:
        yamlItem.type = 'interface';
        this._populateYamlClassOrInterface(yamlItem, docItem);
        break;
      case DocItemKind.Method:
        yamlItem.type = 'method';
        this._populateYamlMethod(yamlItem, docItem);
        break;
      case DocItemKind.Constructor:
        yamlItem.type = 'constructor';
        this._populateYamlMethod(yamlItem, docItem);
        break;
      case DocItemKind.Property:
        if ((docItem.apiItem as IApiProperty).isEventProperty) {
          yamlItem.type = 'event';
        } else {
          yamlItem.type = 'property';
        }
        this._populateYamlProperty(yamlItem, docItem);
        break;
      case DocItemKind.Function:
        yamlItem.type = 'function';
        this._populateYamlMethod(yamlItem, docItem);
        break;
      default:
        throw new Error('Unimplemented item kind: ' + DocItemKind[docItem.kind as DocItemKind]);
    }

    if (docItem.kind !== DocItemKind.Package && !this._shouldEmbed(docItem.kind)) {
      yamlItem.package = this._getUid(docItem.getHierarchy()[0]);
    }

    return yamlItem as IYamlItem;
  }

  private _populateYamlClassOrInterface(yamlItem: Partial<IYamlItem>, docItem: DocItem): void {
    const apiStructure: IApiClass | IApiInterface = docItem.apiItem as IApiClass | IApiInterface;

    if (apiStructure.extends) {
      yamlItem.extends = [ this._linkToUidIfPossible(apiStructure.extends) ];
    }

    if (apiStructure.implements) {
      yamlItem.implements = [ this._linkToUidIfPossible(apiStructure.implements) ];
    }

    if (apiStructure.isSealed) {
      let sealedMessage: string;
      if (docItem.kind === DocItemKind.Class) {
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

  private _populateYamlMethod(yamlItem: Partial<IYamlItem>, docItem: DocItem): void {
    const apiMethod: IApiMethod | IApiConstructor = docItem.apiItem as IApiMethod;
    yamlItem.name = Utilities.getConciseSignature(docItem.name, apiMethod);

    const syntax: IYamlSyntax = {
      content: this._formatCommentedAnnotations(apiMethod.signature, apiMethod)
    };
    yamlItem.syntax = syntax;

    if (apiMethod.returnValue) {
      const returnDescription: string = this._renderMarkdown(apiMethod.returnValue.description, docItem)
        .replace(/^\s*-\s+/, ''); // temporary workaround for people who mistakenly add a hyphen, e.g. "@returns - blah"

      syntax.return = {
        type: [ this._linkToUidIfPossible(apiMethod.returnValue.type) ],
        description: returnDescription
      };
    }

    const parameters: IYamlParameter[] = [];
    for (const parameterName of Object.keys(apiMethod.parameters)) {
      const apiParameter: IApiParameter = apiMethod.parameters[parameterName];
      parameters.push(
        {
           id: parameterName,
           description:  this._renderMarkdown(apiParameter.description, docItem),
           type: [ this._linkToUidIfPossible(apiParameter.type || '') ]
        } as IYamlParameter
      );
    }

    if (parameters.length) {
      syntax.parameters = parameters;
    }

  }

  private _populateYamlProperty(yamlItem: Partial<IYamlItem>, docItem: DocItem): void {
    const apiProperty: IApiProperty = docItem.apiItem as IApiProperty;

    const syntax: IYamlSyntax = {
      content: this._formatCommentedAnnotations(apiProperty.signature, apiProperty)
    };

    yamlItem.syntax = syntax;

    if (apiProperty.type) {
      syntax.return = {
        type: [ this._linkToUidIfPossible(apiProperty.type) ]
      };
    }
  }

  private _renderMarkdown(markupElements: MarkupElement[], containingDocItem: DocItem): string {
    if (!markupElements.length) {
      return '';
    }

    return MarkdownRenderer.renderElements(markupElements, {
      onRenderApiLink: (args: IMarkdownRenderApiLinkArgs) => {
        const result: IDocItemSetResolveResult = this._docItemSet.resolveApiItemReference(args.reference);
        if (!result.docItem) {
          // Eventually we should introduce a warnings file
          console.error(colors.yellow('Warning: Unresolved hyperlink to '
            + Markup.formatApiItemReference(args.reference)));
        } else {
          args.prefix = '[';
          args.suffix = `](xref:${this._getUid(result.docItem)})`;
        }
      }
    }).trim();
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

  // Prepends a string such as "/** @sealed @override */" to an item signature where appropriate.
  private _formatCommentedAnnotations(signature: string, apiItem: IApiMethod | IApiProperty): string {
    const annotations: string[] = [];
    if (apiItem.isSealed) {
      annotations.push('@sealed');
    }
    if (apiItem.isVirtual) {
      annotations.push('@virtual');
    }
    if (apiItem.isOverride) {
      annotations.push('@override');
    }
    if (annotations.length === 0) {
      return signature;
    }
    return '/** ' + annotations.join(' ') + ' */\n' + signature;
  }

  /**
   * Calculate the docfx "uid" for the DocItem
   * Example:  node-core-library.JsonFile.load
   */
  private _getUid(docItem: DocItem): string {
    let result: string = '';
    for (const current of docItem.getHierarchy()) {
      switch (current.kind) {
        case DocItemKind.Package:
          result += PackageName.getUnscopedName(current.name);
          break;
        default:
          result += '.';
          result += current.name;
          break;
      }
    }
    return result;
  }

  /**
   * Initialize the _docItemsByTypeName() data structure.
   */
  private _initDocItemsByTypeName(): void {
    // Collect the _docItemsByTypeName table
    const ambiguousNames: Set<string> = new Set<string>();

    this._docItemSet.forEach((docItem: DocItem) => {
      switch (docItem.kind) {
        case DocItemKind.Class:
        case DocItemKind.Enum:
        case DocItemKind.Interface:
          // Attempt to register both the fully qualified name and the short name
          const namesForType: string[] = [docItem.name];

          // Note that nameWithDot cannot conflict with docItem.name (because docItem.name
          // cannot contain a dot)
          const nameWithDot: string | undefined = this._getTypeNameWithDot(docItem);
          if (nameWithDot) {
            namesForType.push(nameWithDot);
          }

          // Register all names
          for (const typeName of namesForType) {
            if (ambiguousNames.has(typeName)) {
              break;
            }

            if (this._docItemsByTypeName.has(typeName)) {
              // We saw this name before, so it's an ambiguous match
              ambiguousNames.add(typeName);
              break;
            }

            this._docItemsByTypeName.set(typeName, docItem);
          }

          break;
      }
    });

    // Remove the ambiguous matches
    for (const ambiguousName of ambiguousNames) {
      this._docItemsByTypeName.delete(ambiguousName);
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
   * it is given #2 but substitutes #1 if the name can be matched to a DocItem.
   */
  private _linkToUidIfPossible(typeName: string): string {
    // Note that typeName might be a _getTypeNameWithDot() name or it might be a simple class name
    const docItem: DocItem | undefined = this._docItemsByTypeName.get(typeName.trim());
    if (docItem) {
      // Substitute the UID
      return this._getUid(docItem);
    }
    return typeName;
  }

  /**
   * If the docItem represents a scoped name such as "my-library:MyNamespace.MyClass",
   * this returns a string such as "MyNamespace.MyClass".  If the result would not
   * have at least one dot in it, then undefined is returned.
   */
  private _getTypeNameWithDot(docItem: DocItem): string | undefined {
    const hierarchy: DocItem[] = docItem.getHierarchy();
    if (hierarchy.length > 0 && hierarchy[0].kind === DocItemKind.Package) {
      hierarchy.shift(); // ignore the package qualifier
    }
    if (hierarchy.length < 2) {
      return undefined;
    }
    return hierarchy.map(x => x.name).join('.');
  }

  private _getYamlItemName(docItem: DocItem): string {
    if (docItem.parent && docItem.parent.kind === DocItemKind.Namespace) {
      // For members a namespace, show the full name excluding the package part:
      // Example: excel.Excel.Binding --> Excel.Binding
      return this._getUid(docItem).replace(/^[^.]+\./, '');
    }
    return docItem.name;
  }

  private _getYamlFilePath(docItem: DocItem): string {
    let result: string = '';

    for (const current of docItem.getHierarchy()) {
      switch (current.kind) {
        case DocItemKind.Package:
          result += PackageName.getUnscopedName(current.name);
          break;
        default:
          if (current.parent && current.parent.kind === DocItemKind.Package) {
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
