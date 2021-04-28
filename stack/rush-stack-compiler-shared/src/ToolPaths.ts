// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageJsonLookup, IPackageJson } from '@rushstack/node-core-library';
import * as path from 'path';

/**
 * @beta
 */
export class ToolPaths {
  private static _typescriptPackagePath: string | undefined;
  private static _typescriptPackageJson: IPackageJson | undefined;
  private static _eslintPackagePath: string | undefined;
  private static _eslintPackageJson: IPackageJson | undefined;
  private static _tslintPackagePath: string | undefined;
  private static _tslintPackageJson: IPackageJson | undefined;
  private static _apiExtractorPackagePath: string | undefined;
  private static _apiExtractorPackageJson: IPackageJson | undefined;

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
    if (!ToolPaths._typescriptPackageJson) {
      ToolPaths._typescriptPackageJson = PackageJsonLookup.instance.loadPackageJson(
        path.join(ToolPaths.typescriptPackagePath, 'package.json')
      );
    }

    return ToolPaths._typescriptPackageJson;
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
    if (!ToolPaths._eslintPackageJson) {
      ToolPaths._eslintPackageJson = PackageJsonLookup.instance.loadPackageJson(
        path.join(ToolPaths.eslintPackagePath, 'package.json')
      );
    }

    return ToolPaths._eslintPackageJson;
  }

  public static get tslintPackagePath(): string {
    if (!ToolPaths._tslintPackagePath) {
      ToolPaths._tslintPackagePath = ToolPaths._getPackagePath('tslint');

      if (!ToolPaths._tslintPackagePath) {
        const typeScriptPackageVersion: string = this.typescriptPackageJson.version;
        const typeScriptMajorVersion: number = Number(
          typeScriptPackageVersion.substr(0, typeScriptPackageVersion.indexOf('.'))
        );
        if (typeScriptMajorVersion >= 4) {
          throw new Error('TSLint is not supported for rush-stack-compiler-4.X packages.');
        } else {
          throw new Error('Unable to find "tslint" package.');
        }
      }
    }

    return ToolPaths._tslintPackagePath;
  }

  public static get tslintPackageJson(): IPackageJson {
    if (!ToolPaths._tslintPackageJson) {
      ToolPaths._tslintPackageJson = PackageJsonLookup.instance.loadPackageJson(
        path.join(ToolPaths.tslintPackagePath, 'package.json')
      );
    }

    return ToolPaths._tslintPackageJson;
  }

  public static get apiExtractorPackagePath(): string {
    if (!ToolPaths._apiExtractorPackagePath) {
      ToolPaths._apiExtractorPackagePath = ToolPaths._getPackagePath('@microsoft/api-extractor');

      if (!ToolPaths._apiExtractorPackagePath) {
        throw new Error('Unable to find "@microsoft/api-extractor" package.');
      }
    }

    return ToolPaths._apiExtractorPackagePath;
  }

  public static get apiExtractorPackageJson(): IPackageJson {
    if (!ToolPaths._apiExtractorPackageJson) {
      ToolPaths._apiExtractorPackageJson = PackageJsonLookup.instance.loadPackageJson(
        path.join(ToolPaths.apiExtractorPackagePath, 'package.json')
      );
    }

    return ToolPaths._apiExtractorPackageJson;
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
