// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { Sort, Import, Path } from '@rushstack/node-core-library';

import { BaseWorkspaceFile } from '../base/BaseWorkspaceFile';
import { PNPM_SHRINKWRAP_YAML_FORMAT } from './PnpmYamlCommon';

const yamlModule: typeof import('js-yaml') = Import.lazy('js-yaml', require);

const globEscape: (unescaped: string) => string = require('glob-escape'); // No @types/glob-escape package exists

/**
 * This interface represents the raw pnpm-workspace.YAML file
 * Example:
 *  {
 *    "packages": [
 *      "../../apps/project1"
 *    ],
 *    "catalogs": {
 *      "default": {
 *        "react": "^18.0.0"
 *      }
 *    },
 *    "onlyBuiltDependencies": [
 *      "esbuild",
 *      "playwright"
 *    ]
 *  }
 */
interface IPnpmWorkspaceYaml {
  /** The list of local package directories */
  packages: string[];
  /** Catalog definitions for centralized version management */
  catalogs?: Record<string, Record<string, string>>;
  /** Allowlist of dependencies permitted to run build scripts (PNPM 10.1.0+) */
  onlyBuiltDependencies?: string[];
}

export class PnpmWorkspaceFile extends BaseWorkspaceFile {
  /**
   * The filename of the workspace file.
   */
  public readonly workspaceFilename: string;

  private _workspacePackages: Set<string>;
  private _catalogs: Record<string, Record<string, string>> | undefined;
  private _onlyBuiltDependencies: string[] | undefined;

  /**
   * The PNPM workspace file is used to specify the location of workspaces relative to the root
   * of your PNPM install.
   */
  public constructor(workspaceYamlFilename: string) {
    super();

    this.workspaceFilename = workspaceYamlFilename;
    // Ignore any existing file since this file is generated and we need to handle deleting packages
    // If we need to support manual customization, that should be an additional parameter for "base file"
    this._workspacePackages = new Set<string>();
    this._catalogs = undefined;
    this._onlyBuiltDependencies = undefined;
  }

  /**
   * Sets the catalog definitions for the workspace.
   * @param catalogs - A map of catalog name to package versions
   */
  public setCatalogs(catalogs: Record<string, Record<string, string>> | undefined): void {
    this._catalogs = catalogs;
  }

  /**
   * Sets the onlyBuiltDependencies list for the workspace.
   * This specifies which dependencies are allowed to run build scripts in PNPM 10.1.0+.
   * @param deps - An array of package names allowed to run build scripts
   */
  public setOnlyBuiltDependencies(deps: string[] | undefined): void {
    this._onlyBuiltDependencies = deps;
  }

  /** @override */
  public addPackage(packagePath: string): void {
    // Ensure the path is relative to the pnpm-workspace.yaml file
    if (path.isAbsolute(packagePath)) {
      packagePath = path.relative(path.dirname(this.workspaceFilename), packagePath);
    }

    // Glob can't handle Windows paths
    const globPath: string = Path.convertToSlashes(packagePath);
    this._workspacePackages.add(globEscape(globPath));
  }

  /** @override */
  protected serialize(): string {
    // Ensure stable sort order when serializing
    Sort.sortSet(this._workspacePackages);

    const workspaceYaml: IPnpmWorkspaceYaml = {
      packages: Array.from(this._workspacePackages)
    };

    if (this._catalogs && Object.keys(this._catalogs).length > 0) {
      workspaceYaml.catalogs = this._catalogs;
    }

    if (this._onlyBuiltDependencies && this._onlyBuiltDependencies.length > 0) {
      workspaceYaml.onlyBuiltDependencies = this._onlyBuiltDependencies;
    }

    return yamlModule.dump(workspaceYaml, PNPM_SHRINKWRAP_YAML_FORMAT);
  }
}
