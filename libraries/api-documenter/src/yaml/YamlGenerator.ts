// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import yaml = require('js-yaml');
import { JsonFile, JsonSchema } from '@microsoft/node-core-library';

import { DocItemSet, DocItem, DocItemKind } from '../DocItemSet';
import { IYamlFile } from './IYamlFile';
import { RenderingHelpers } from '../RenderingHelpers';

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
      items: [
        {
          uid: docPackage.name,
          type: 'package'
        }
      ]
    };

    this._writeYamlFile(yamlFile, docPackage);
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
