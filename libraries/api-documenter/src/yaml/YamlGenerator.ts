// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import yaml = require('js-yaml');
import { JsonFile, JsonSchema } from '@microsoft/node-core-library';
import { MarkupElement, IDocElement } from '@microsoft/api-extractor';

import { DocItemSet, DocItem, DocItemKind } from '../DocItemSet';
import {
  IYamlFile,
  IYamlItem,
  YamlTypeId
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

    if (this._shouldEmbed(yamlItem.type)) {
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

  private _shouldEmbed(yamlTypeId: YamlTypeId): boolean {
    switch (yamlTypeId) {
      case 'class':
      case 'package':
      case 'interface':
      case 'enum':
      return false;
    }
    return true;
  }

  private _generateYamlItem(docItem: DocItem): IYamlItem | undefined {
    const yamlItem: Partial<IYamlItem> = { };
    yamlItem.uid = this._getUid(docItem);

    const summary: string = this._renderMarkdownFromDocElement(docItem.apiItem.summary);
    if (summary) {
      yamlItem.summary = summary;
    }

    const remarks: string = this._renderMarkdownFromDocElement(docItem.apiItem.remarks);
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
      default:
        return undefined;
    }

    if (docItem.kind !== DocItemKind.Package && !this._shouldEmbed(yamlItem.type)) {
      yamlItem.package = this._getUid(docItem.getHierarchy()[0]);
    }

    return yamlItem as IYamlItem;
  }

  private _renderMarkdownFromDocElement(docElements: IDocElement[] | undefined): string {
    return this._renderMarkdown(MarkupBuilder.renderDocElements(docElements || []));
  }

  private _renderMarkdown(markupElements: MarkupElement[]): string {
    if (!markupElements.length) {
      return '';
    }

    return MarkdownRenderer.renderElements(markupElements, {
      onRenderApiLink: (args: IMarkdownRenderApiLinkArgs) => {
        // no link for now
      }
    });
  }

  private _writeYamlFile(yamlFile: IYamlFile, docItem: DocItem): void {
    const yamlFilePath: string = this._getYamlFilePath(docItem);

    console.log('Writing ' + yamlFilePath);

    JsonFile.validateNoUndefinedMembers(yamlFile);

    const stringified: string = '### YamlMime:UniversalReference\n' + yaml.safeDump(yamlFile, {
      lineWidth: 120
    });
    const normalized: string = stringified.split('\n').join('\r\n');

    fsx.mkdirsSync(path.dirname(yamlFilePath));
    fsx.writeFileSync(yamlFilePath, normalized);
    yamlSchema.validateObject(yamlFile, yamlFilePath);
  }

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
