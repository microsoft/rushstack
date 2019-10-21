// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageJsonLookup, IPackageJson, JsonFile } from '@microsoft/node-core-library';
import * as path from 'path';

/**
 * @beta
 */
export class ToolPaths {
  private static _typescriptPackagePath: string | undefined;
  private static _eslintPackagePath: string | undefined;
  private static _tslintPackagePath: string | undefined;

  public static get typescriptPackagePath(): string {
    if (!ToolPaths._typescriptPackagePath) {
      ToolPaths._typescriptPackagePath = ToolPaths._getPackagePath('typescript');

      if (!ToolPaths._typescriptPackagePath) {
        throw new Error('Unable to find "typescript" package.');
      }
    }

    return ToolPaths._typescriptPackagePath;
  }

  public static get typescriptPackageJson(): IPackageJson {
    return JsonFile.load(path.join(ToolPaths.typescriptPackagePath, 'package.json'));
  }

  public static get eslintPackagePath(): string {
    if (!ToolPaths._eslintPackagePath) {
      ToolPaths._eslintPackagePath = ToolPaths._getPackagePath('eslint');

      if (!ToolPaths._eslintPackagePath) {
        throw new Error('Unable to find "eslint" package.');
      }
    }

    return ToolPaths._eslintPackagePath;
  }

  public static get eslintPackageJson(): IPackageJson {
    return JsonFile.load(path.join(ToolPaths.eslintPackagePath, 'package.json'));
  }

  public static get tslintPackagePath(): string {
    if (!ToolPaths._tslintPackagePath) {
      ToolPaths._tslintPackagePath = ToolPaths._getPackagePath('tslint');

      if (!ToolPaths._tslintPackagePath) {
        throw new Error('Unable to find "tslint" package.');
      }
    }

    return ToolPaths._tslintPackagePath;
  }

  public static get tslintPackageJson(): IPackageJson {
    return JsonFile.load(path.join(ToolPaths.tslintPackagePath, 'package.json'));
  }

  private static _getPackagePath(packageName: string): string | undefined {
    const packageJsonPath: string | undefined = ToolPaths._getPackageJsonPath(packageName);
    return packageJsonPath ? path.dirname(packageJsonPath) : undefined;
  }

  private static _getPackageJsonPath(packageName: string): string | undefined {
    const lookup: PackageJsonLookup = new PackageJsonLookup();
    const mainEntryPath: string = require.resolve(packageName);
    return lookup.tryGetPackageJsonFilePathFor(mainEntryPath);
  }
}
