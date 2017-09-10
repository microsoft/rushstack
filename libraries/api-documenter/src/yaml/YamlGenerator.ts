// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import yaml = require('js-yaml');
import { JsonFile, JsonSchema } from '@microsoft/node-core-library';
import {
  MarkupElement,
  IDocElement,
  IApiMethod,
  IApiConstructor,
  IApiParameter,
  IApiProperty,
  IApiEnumMember,
  IApiClass,
  IApiInterface
} from '@microsoft/api-extractor';

import { DocItemSet, DocItem, DocItemKind, IDocItemSetResolveResult } from '../DocItemSet';
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
import { RenderingHelpers } from '../RenderingHelpers';
import { MarkupBuilder } from '../MarkupBuilder';
import { MarkdownRenderer, IMarkdownRenderApiLinkArgs } from '../MarkdownRenderer';

const yamlApiSchema: JsonSchema = JsonSchema.fromFile(path.join(__dirname, 'typescript.schema.json'));

/**
 * Writes documentation in the Universal Reference YAML file format, as defined by typescript.schema.json.
 */
export class YamlGenerator {
  private _docItemSet: DocItemSet;
  private _outputFolder: string;

  public constructor(docItemSet: DocItemSet) {
    this._docItemSet = docItemSet;
  }

  public generateFiles(outputFolder: string): void {
    this._outputFolder = outputFolder;

    console.log();
    this._deleteOldOutputFiles();

    for (const docPackage of this._docItemSet.docPackages) {
      this._visitDocItems(docPackage, undefined);
    }

    this._writeTocFile(this._docItemSet.docPackages);
  }

  private _visitDocItems(docItem: DocItem, parentYamlFile: IYamlApiFile | undefined): boolean {
    const yamlItem: IYamlItem | undefined = this._generateYamlItem(docItem);
    if (!yamlItem) {
      return false;
    }

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

      for (const child of docItem.children) {
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
          name: docItem.name
        });

      }
    }

    return true;
  }

  /**
   * Write the table of contents
   */
  private _writeTocFile(docItems: DocItem[]): void {
    const tocFile: IYamlTocFile = {
      items: [ ]
    };

    tocFile.items.push({
      name: 'SharePoint Framework', // TODO: parameterize this
      items: [
        {
          name: 'Overview',
          href: './index.md'
        } as IYamlTocItem
      ].concat(this._buildTocItems(docItems.filter(x => x.isExternalPackage)))
    });

    const externalPackages: DocItem[] = docItems.filter(x => !x.isExternalPackage);
    if (externalPackages.length) {
      tocFile.items.push({
        name: '─────────────'
      });
      tocFile.items.push({
        name: 'External Packages',
        items: this._buildTocItems(externalPackages)
      });
    }

    this._buildTocItems(docItems);
    const tocFilePath: string = path.join(this._outputFolder, 'toc.yml');
    console.log('Writing ' + tocFilePath);
    this._writeYamlFile(tocFile, tocFilePath, '', undefined);
  }

  private _buildTocItems(docItems: DocItem[]): IYamlTocItem[] {
    const tocItems: IYamlTocItem[] = [];
    for (const docItem of docItems) {
      if (this._shouldEmbed(docItem.kind)) {
        // Don't generate table of contents items for embedded definitions
        continue;
      }

      const tocItem: IYamlTocItem = {
        name: RenderingHelpers.getUnscopedPackageName(docItem.name),
        uid: this._getUid(docItem)
      };

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

    let summary: string = this._renderMarkdownFromDocElement(docItem.apiItem.summary, docItem);
    const remarks: string = this._renderMarkdownFromDocElement(docItem.apiItem.remarks, docItem);

    if ((docItem.apiItem.deprecatedMessage || []).length > 0) {
      const deprecatedMessage: string = this._renderMarkdownFromDocElement(docItem.apiItem.deprecatedMessage, docItem);
      yamlItem.deprecated = { content: deprecatedMessage };
    }

    if (docItem.apiItem.isBeta) {
      yamlItem.isPreview = true;
    }

    if (remarks && this._shouldEmbed(docItem.kind)) {
      // This is a temporary workaround, since "Remarks" are not currently being displayed for embedded items
      if (summary) {
        summary += '\n\n';
      }
      summary += '### Remarks\n\n' + remarks;
    }

    if (summary) {
      yamlItem.summary = summary;
    }

    if (remarks) {
      yamlItem.remarks = remarks;
    }

    yamlItem.name = docItem.name;
    yamlItem.fullName = yamlItem.uid;
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
        yamlItem.type = 'property';
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
      yamlItem.extends = [ apiStructure.extends ];
    }

    if (apiStructure.implements) {
      yamlItem.implements = [ apiStructure.implements ];
    }
  }

  private _populateYamlMethod(yamlItem: Partial<IYamlItem>, docItem: DocItem): void {
    const apiMethod: IApiMethod | IApiConstructor = docItem.apiItem as IApiMethod;
    yamlItem.name = RenderingHelpers.getConciseSignature(docItem.name, apiMethod);

    const syntax: IYamlSyntax = {
      content: apiMethod.signature
    };
    yamlItem.syntax = syntax;

    if (apiMethod.returnValue) {
      const returnDescription: string = this._renderMarkdownFromDocElement(apiMethod.returnValue.description, docItem)
        .replace(/^\s*-\s+/, ''); // temporary workaround for people who mistakenly add a hyphen, e.g. "@returns - blah"

      syntax.return = {
        type: [ apiMethod.returnValue.type ],
        description: returnDescription
      };
    }

    const parameters: IYamlParameter[] = [];
    for (const parameterName of Object.keys(apiMethod.parameters)) {
      const apiParameter: IApiParameter = apiMethod.parameters[parameterName];
      parameters.push(
        {
           id: parameterName,
           description:  this._renderMarkdownFromDocElement(apiParameter.description, docItem),
           type: [ apiParameter.type || '' ]
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
      content: apiProperty.signature
    };
    yamlItem.syntax = syntax;

    if (apiProperty.type) {
      syntax.return = {
        type: [ apiProperty.type ]
      };
    }
  }

  private _renderMarkdownFromDocElement(docElements: IDocElement[] | undefined, containingDocItem: DocItem): string {
    return this._renderMarkdown(MarkupBuilder.renderDocElements(docElements || []), containingDocItem);
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
          console.error('==> UNRESOLVED REFERENCE: ' + JSON.stringify(args.reference));
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

    const normalized: string = stringified.split('\n').join('\r\n');

    fsx.mkdirsSync(path.dirname(filePath));
    fsx.writeFileSync(filePath, normalized);

    if (schema) {
      schema.validateObject(dataObject, filePath);
    }
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
          result += RenderingHelpers.getUnscopedPackageName(current.name);
          break;
        default:
          result += '.';
          result += current.name;
          break;
      }
    }
    return result;
  }

  private _getYamlFilePath(docItem: DocItem): string {
    let result: string = '';

    for (const current of docItem.getHierarchy()) {
      switch (current.kind) {
        case DocItemKind.Package:
          result += RenderingHelpers.getUnscopedPackageName(current.name);
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
    fsx.emptyDirSync(this._outputFolder);
  }
}
