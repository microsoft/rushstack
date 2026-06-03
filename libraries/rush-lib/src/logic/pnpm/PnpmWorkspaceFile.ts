// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { escapePath as globEscape } from 'fast-glob';

import { Sort, Import, Path } from '@rushstack/node-core-library';

import { BaseWorkspaceFile } from '../base/BaseWorkspaceFile';
import { PNPM_SHRINKWRAP_YAML_FORMAT } from './PnpmYamlCommon';

const yamlModule: typeof import('js-yaml') = Import.lazy('js-yaml', require);

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
 *    }
 *  }
 */
interface IPnpmWorkspaceYaml {
  /** The list of local package directories */
  packages: string[];
  /** Catalog definitions for centralized version management */
  catalogs?: Record<string, Record<string, string>>;
  /** Per-package build permission map. True permits build scripts, false blocks them. (pnpm 10.26.0+) */
  allowBuilds?: Record<string, boolean>;
  /**
   * When true, installation exits with non-zero if any dependencies have unreviewed build scripts.
   * (pnpm 10.3.0+)
   */
  strictDepBuilds?: boolean;
  /**
   * When true, all build scripts from dependencies run automatically without requiring approval.
   * (pnpm 10.9.0+)
   */
  dangerouslyAllowAllBuilds?: boolean;
}

export class PnpmWorkspaceFile extends BaseWorkspaceFile {
  /**
   * The filename of the workspace file.
   */
  public readonly workspaceFilename: string;

  private _workspacePackages: Set<string>;
  private _catalogs: Record<string, Record<string, string>> | undefined;
  private _allowBuilds: Record<string, boolean> | undefined;
  private _strictDepBuilds: boolean | undefined;
  private _dangerouslyAllowAllBuilds: boolean | undefined;

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
    this._allowBuilds = undefined;
    this._strictDepBuilds = undefined;
    this._dangerouslyAllowAllBuilds = undefined;
  }

  /**
   * Sets the catalog definitions for the workspace.
   * @param catalogs - A map of catalog name to package versions
   */
  public setCatalogs(catalogs: Record<string, Record<string, string>> | undefined): void {
    this._catalogs = catalogs;
  }

  /**
   * Sets the `allowBuilds` map for the workspace. Each key is a package name and each value
   * is `true` (permit build scripts) or `false` (block build scripts).
   *
   * @remarks
   * This writes to the `allowBuilds` field in `pnpm-workspace.yaml`, which requires pnpm 10.26.0+.
   *
   * @param allowBuilds - A map of package name to boolean permission flag
   */
  public setAllowBuilds(allowBuilds: Record<string, boolean> | undefined): void {
    this._allowBuilds = allowBuilds;
  }

  /**
   * Sets the `strictDepBuilds` flag for the workspace. When `true`, installation exits with a
   * non-zero exit code if any dependencies have unreviewed build scripts.
   *
   * @remarks
   * This writes to the `strictDepBuilds` field in `pnpm-workspace.yaml`, which requires pnpm 10.3.0+.
   *
   * @param strictDepBuilds - Whether to enforce strict build script review
   */
  public setStrictDepBuilds(strictDepBuilds: boolean | undefined): void {
    this._strictDepBuilds = strictDepBuilds;
  }

  /**
   * Sets the `dangerouslyAllowAllBuilds` flag for the workspace. When `true`, all build scripts
   * from all dependencies run automatically without requiring approval.
   *
   * @remarks
   * This writes to the `dangerouslyAllowAllBuilds` field in `pnpm-workspace.yaml`, which requires
   * pnpm 10.9.0+.
   *
   * @param dangerouslyAllowAllBuilds - Whether to allow all build scripts unconditionally
   */
  public setDangerouslyAllowAllBuilds(dangerouslyAllowAllBuilds: boolean | undefined): void {
    this._dangerouslyAllowAllBuilds = dangerouslyAllowAllBuilds;
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

    if (this._allowBuilds && Object.keys(this._allowBuilds).length > 0) {
      workspaceYaml.allowBuilds = this._allowBuilds;
    }

    if (this._strictDepBuilds !== undefined) {
      workspaceYaml.strictDepBuilds = this._strictDepBuilds;
    }

    if (this._dangerouslyAllowAllBuilds !== undefined) {
      workspaceYaml.dangerouslyAllowAllBuilds = this._dangerouslyAllowAllBuilds;
    }

    return yamlModule.dump(workspaceYaml, PNPM_SHRINKWRAP_YAML_FORMAT);
  }
}
