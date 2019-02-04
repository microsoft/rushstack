// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import * as tsdoc from '@microsoft/tsdoc';

import {
  IPackageJson
} from '@microsoft/node-core-library';

/**
 * Constructor options for CollectorPackage
 */
export interface ICollectorPackageOptions {
  packageFolder: string;
  packageJson: IPackageJson;
  entryPointSourceFile: ts.SourceFile;
}

export class CollectorPackage {
  /**
   * Returns the folder for the package being analyzed.
   *
   * @remarks
   * If the entry point is `C:\Folder\project\src\index.ts` and the nearest package.json
   * is `C:\Folder\project\package.json`, then the packageFolder is `C:\Folder\project`
   */
  public readonly packageFolder: string;

  /**
   * The parsed package.json file for this package.
   */
  public readonly packageJson: IPackageJson;

  public readonly entryPointSourceFile: ts.SourceFile;

  public tsdocComment: tsdoc.DocComment | undefined;
  public tsdocParserContext: tsdoc.ParserContext | undefined;

  public constructor(options: ICollectorPackageOptions) {
    this.packageFolder = options.packageFolder;
    this.packageJson = options.packageJson;
    this.entryPointSourceFile = options.entryPointSourceFile;
  }

  /**
   * Returns the full name of the package being analyzed.
   */
  public get name(): string {
    return this.packageJson.name;
  }
}
