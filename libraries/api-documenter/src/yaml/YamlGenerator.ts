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
import { MarkdownRenderer } from '../MarkdownRenderer';

const yamlSchema: JsonSchema = JsonSchema.fromFile(path.join(__dirname, 'typescript.schema.json'));

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
      this._generatePackage(docPackage);
    }
  }

  private _generatePackage(docPackage: DocItem): void {
    const yamlFile: IYamlFile = {
      items: [ ]
    };

    const yamlItem: IYamlItem = this._createYamlItem(docPackage, 'package');
    yamlFile.items.push(yamlItem);

    this._writeYamlFile(yamlFile, docPackage);
  }

  private _createYamlItem(docItem: DocItem, type: YamlTypeId): IYamlItem {
    const yamlItem: IYamlItem = {
      type: type,
      uid: this._getUid(docItem)
    };

    const summary: string = this._renderMarkdownFromDocElement(docItem.apiItem.summary);
    if (summary) {
      yamlItem.summary = summary;
    }

    const remarks: string = this._renderMarkdownFromDocElement(docItem.apiItem.remarks);
    if (remarks) {
      yamlItem.remarks = remarks;
    }

    return yamlItem;
  }

  private _renderMarkdownFromDocElement(docElements: IDocElement[] | undefined): string {
    return this._renderMarkdown(MarkupBuilder.renderDocElements(docElements || []));
  }

  private _renderMarkdown(markupElements: MarkupElement[]): string {
    if (!markupElements.length) {
      return '';
    }

    return MarkdownRenderer.renderElements(markupElements, {
      docIdResolver: (docId: string) => {
        return ''; // no link for now
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
          result += RenderingHelpers.getUnscopedPackageName(docItem.name);
          break;
        default:
          result += '.';
          result += docItem.name;
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
          result += RenderingHelpers.getUnscopedPackageName(docItem.name);
          break;
        default:
          if (current.parent && current.parent.kind === DocItemKind.Package) {
            result += '/';
          } else {
            result += '.';
          }
          result += docItem.name;
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
