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
 *    },
 *    "allowBuilds": {
 *      "esbuild": true,
 *      "fsevents": false
 *    },
 *    "enableGlobalVirtualStore": true
 *  }
 */
interface IPnpmWorkspaceYaml {
  /** The list of local package directories */
  packages: string[];
  /** Catalog definitions for centralized version management */
  catalogs?: Record<string, Record<string, string>>;
  /**
   * Controls which packages are allowed to run build scripts. A value of `true` means the
   * package is allowed to run build scripts; `false` means it is explicitly denied.
   * Packages with build scripts not listed here will cause pnpm to fail with ERR_PNPM_IGNORED_BUILDS.
   * (SUPPORTED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  allowBuilds?: Record<string, boolean>;
  /**
   * Places the virtual store under the configured PNPM store instead of under the workspace
   * node_modules folder.
   * (SUPPORTED ONLY IN PNPM 10.12.1 AND NEWER)
   */
  enableGlobalVirtualStore?: boolean;
}

export class PnpmWorkspaceFile extends BaseWorkspaceFile {
  /**
   * The filename of the workspace file.
   */
  public readonly workspaceFilename: string;

  private _workspacePackages: Set<string>;
  private _catalogs: Record<string, Record<string, string>> | undefined;
  private _allowBuilds: Record<string, boolean> | undefined;
  private _enableGlobalVirtualStore: boolean | undefined;

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
    this._enableGlobalVirtualStore = undefined;
  }

  /**
   * Sets the catalog definitions for the workspace.
   * @param catalogs - A map of catalog name to package versions
   */
  public setCatalogs(catalogs: Record<string, Record<string, string>> | undefined): void {
    this._catalogs = catalogs;
  }

  /**
   * Sets the allowBuilds definitions for the workspace.
   * This controls which packages are allowed to run build scripts in pnpm 11+.
   * @param allowBuilds - A map of package name to boolean (true = allowed, false = denied)
   */
  public setAllowBuilds(allowBuilds: Record<string, boolean> | undefined): void {
    this._allowBuilds = allowBuilds;
  }

  /**
   * Sets whether PNPM should use the global virtual store for this workspace.
   */
  public setEnableGlobalVirtualStore(enableGlobalVirtualStore: boolean | undefined): void {
    this._enableGlobalVirtualStore = enableGlobalVirtualStore;
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

    if (this._enableGlobalVirtualStore) {
      workspaceYaml.enableGlobalVirtualStore = true;
    }

    return yamlModule.dump(workspaceYaml, PNPM_SHRINKWRAP_YAML_FORMAT);
  }
}
