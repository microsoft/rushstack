// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import yaml = require('js-yaml');
import { JsonFile, JsonSchema } from '@microsoft/node-core-library';
import {
  MarkupElement,
  IDocElement,
  IApiEnumMember
} from '@microsoft/api-extractor';

import { DocItemSet, DocItem, DocItemKind, IDocItemSetResolveResult } from '../DocItemSet';
import {
  IYamlFile,
  IYamlItem
} from './IYamlFile';
import { RenderingHelpers } from '../RenderingHelpers';
import { MarkupBuilder } from '../MarkupBuilder';
import { MarkdownRenderer, IMarkdownRenderApiLinkArgs } from '../MarkdownRenderer';

const yamlSchema: JsonSchema = JsonSchema.fromFile(path.join(__dirname, 'typescript.schema.json'));

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
  }

  private _visitDocItems(docItem: DocItem, parentYamlFile: IYamlFile | undefined): boolean {
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
      const newYamlFile: IYamlFile = {
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

      this._writeYamlFile(newYamlFile, docItem);

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

    const summary: string = this._renderMarkdownFromDocElement(docItem.apiItem.summary, docItem);
    if (summary) {
      yamlItem.summary = summary;
    }

    const remarks: string = this._renderMarkdownFromDocElement(docItem.apiItem.remarks, docItem);
    if (remarks) {
      yamlItem.remarks = remarks;
    }

    yamlItem.name = docItem.name;
    yamlItem.fullName = docItem.name;
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
        break;
      case DocItemKind.Interface:
        yamlItem.type = 'interface';
        break;
      case DocItemKind.Method:
        yamlItem.type = 'method';
        break;
      case DocItemKind.Constructor:
        yamlItem.type = 'constructor';
        break;
      case DocItemKind.Property:
        yamlItem.type = 'property';
        break;
      case DocItemKind.Function:
        // Unimplemented
        break;
      default:
        throw new Error('Unimplemented item kind: ' + DocItemKind[docItem.kind as DocItemKind]);
    }

    if (docItem.kind !== DocItemKind.Package && !this._shouldEmbed(docItem.kind)) {
      yamlItem.package = this._getUid(docItem.getHierarchy()[0]);
    }

    return yamlItem as IYamlItem;
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
          // We will calculate a relativeUrl to the nearest non-embedded DocItem.
          // (The rest will be determined by the URL fragment.)
          let nonEmbeddedDocItem: DocItem = result.docItem;
          while (this._shouldEmbed(nonEmbeddedDocItem.kind) && nonEmbeddedDocItem.parent) {
            nonEmbeddedDocItem = nonEmbeddedDocItem.parent;
          }

          const currentFolder: string = path.dirname(this._getYamlFilePath(containingDocItem));
          const targetFilePath: string = this._getYamlFilePath(nonEmbeddedDocItem);
          const relativePath: string = path.relative(currentFolder, targetFilePath);
          let relativeUrl: string = relativePath
            .replace(/[\\]/g, '/') // replace all backslashes with slashes
            .replace(/\.[^\.\\/]+$/, ''); // remove file extension

          if (relativeUrl.substr(0, 1) !== '.') {
            // If the path doesn't already start with "./", then add this prefix.
            relativeUrl = './' + relativeUrl;
          }

          // Do we need to link to a fragment within the page?
          if (nonEmbeddedDocItem !== result.docItem) {
            const urlFragment: string = this._getEmbeddedUrlFragment(result.docItem);
            args.prefix = '[';
            args.suffix = `](${relativeUrl}#${urlFragment})`;
          } else {
            args.prefix = '[';
            args.suffix = `](${relativeUrl})`;
          }

        }
      }
    });
  }

  private _writeYamlFile(yamlFile: IYamlFile, docItem: DocItem): void {
    const yamlFilePath: string = this._getYamlFilePath(docItem);

    if (docItem.kind === DocItemKind.Package) {
      console.log('Writing ' + this._getYamlFilePath(docItem));
    }

    JsonFile.validateNoUndefinedMembers(yamlFile);

    const stringified: string = '### YamlMime:UniversalReference\n' + yaml.safeDump(yamlFile, {
      lineWidth: 120
    });
    const normalized: string = stringified.split('\n').join('\r\n');

    fsx.mkdirsSync(path.dirname(yamlFilePath));
    fsx.writeFileSync(yamlFilePath, normalized);
    yamlSchema.validateObject(yamlFile, yamlFilePath);
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

  /**
   * Calculate the HTML anchor fragment for DocItems that are embedded in a web page containing
   * other items.
   * Example:  node_core_library_JsonFile_load
   */
  private _getEmbeddedUrlFragment(docItem: DocItem): string {
    return this._getUid(docItem).replace(/\./g, '_'); // replace all periods with underscores
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
