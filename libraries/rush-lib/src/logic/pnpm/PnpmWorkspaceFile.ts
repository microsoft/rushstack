// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { escapePath as globEscape } from 'fast-glob';

import { Sort, Import, Path } from '@rushstack/node-core-library';

import { BaseWorkspaceFile } from '../base/BaseWorkspaceFile';
import { PNPM_SHRINKWRAP_YAML_FORMAT } from './PnpmYamlCommon';
import type { IPnpmPackageExtension, IPnpmPeerDependencyRules } from './PnpmOptionsConfiguration';

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
 *    }
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
   * Dependency version overrides. In pnpm 11+ this replaces the `pnpm.overrides` field of
   * `package.json`, which pnpm no longer reads.
   * (SUPPORTED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  overrides?: Record<string, string>;
  /**
   * Extensions applied to the `package.json` of matched dependencies. In pnpm 11+ this replaces
   * the `pnpm.packageExtensions` field of `package.json`, which pnpm no longer reads.
   * (SUPPORTED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  packageExtensions?: Record<string, IPnpmPackageExtension>;
  /**
   * Rules for suppressing peer dependency validation errors. In pnpm 11+ this replaces the
   * `pnpm.peerDependencyRules` field of `package.json`, which pnpm no longer reads.
   * (SUPPORTED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  peerDependencyRules?: IPnpmPeerDependencyRules;
  /**
   * Suppresses installation warnings for deprecated package versions. In pnpm 11+ this replaces
   * the `pnpm.allowedDeprecatedVersions` field of `package.json`, which pnpm no longer reads.
   * (SUPPORTED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  allowedDeprecatedVersions?: Record<string, string>;
  /**
   * Patches applied to dependencies. In pnpm 11+ this replaces the `pnpm.patchedDependencies`
   * field of `package.json`, which pnpm no longer reads.
   * (SUPPORTED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  patchedDependencies?: Record<string, string>;
}

export class PnpmWorkspaceFile extends BaseWorkspaceFile {
  /**
   * The filename of the workspace file.
   */
  public readonly workspaceFilename: string;

  private _workspacePackages: Set<string>;
  private _catalogs: Record<string, Record<string, string>> | undefined;
  private _allowBuilds: Record<string, boolean> | undefined;
  private _overrides: Record<string, string> | undefined;
  private _packageExtensions: Record<string, IPnpmPackageExtension> | undefined;
  private _peerDependencyRules: IPnpmPeerDependencyRules | undefined;
  private _allowedDeprecatedVersions: Record<string, string> | undefined;
  private _patchedDependencies: Record<string, string> | undefined;

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
    this._overrides = undefined;
    this._packageExtensions = undefined;
    this._peerDependencyRules = undefined;
    this._allowedDeprecatedVersions = undefined;
    this._patchedDependencies = undefined;
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
   * Sets the dependency version overrides for the workspace.
   * In pnpm 11+ this replaces the `pnpm.overrides` field of `package.json`.
   * @param overrides - A map of package selector to version
   */
  public setOverrides(overrides: Record<string, string> | undefined): void {
    this._overrides = overrides;
  }

  /**
   * Sets the package extensions for the workspace.
   * In pnpm 11+ this replaces the `pnpm.packageExtensions` field of `package.json`.
   * @param packageExtensions - A map of package selector to package.json extension
   */
  public setPackageExtensions(packageExtensions: Record<string, IPnpmPackageExtension> | undefined): void {
    this._packageExtensions = packageExtensions;
  }

  /**
   * Sets the peer dependency rules for the workspace.
   * In pnpm 11+ this replaces the `pnpm.peerDependencyRules` field of `package.json`.
   * @param peerDependencyRules - The peer dependency rules
   */
  public setPeerDependencyRules(peerDependencyRules: IPnpmPeerDependencyRules | undefined): void {
    this._peerDependencyRules = peerDependencyRules;
  }

  /**
   * Sets the allowed deprecated versions for the workspace.
   * In pnpm 11+ this replaces the `pnpm.allowedDeprecatedVersions` field of `package.json`.
   * @param allowedDeprecatedVersions - A map of package name to version range
   */
  public setAllowedDeprecatedVersions(allowedDeprecatedVersions: Record<string, string> | undefined): void {
    this._allowedDeprecatedVersions = allowedDeprecatedVersions;
  }

  /**
   * Sets the patched dependencies for the workspace.
   * In pnpm 11+ this replaces the `pnpm.patchedDependencies` field of `package.json`.
   * @param patchedDependencies - A map of package name and version to patch file path
   */
  public setPatchedDependencies(patchedDependencies: Record<string, string> | undefined): void {
    this._patchedDependencies = patchedDependencies;
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

    if (this._overrides && Object.keys(this._overrides).length > 0) {
      workspaceYaml.overrides = this._overrides;
    }

    if (this._packageExtensions && Object.keys(this._packageExtensions).length > 0) {
      workspaceYaml.packageExtensions = this._packageExtensions;
    }

    if (this._peerDependencyRules && Object.keys(this._peerDependencyRules).length > 0) {
      workspaceYaml.peerDependencyRules = this._peerDependencyRules;
    }

    if (this._allowedDeprecatedVersions && Object.keys(this._allowedDeprecatedVersions).length > 0) {
      workspaceYaml.allowedDeprecatedVersions = this._allowedDeprecatedVersions;
    }

    if (this._patchedDependencies && Object.keys(this._patchedDependencies).length > 0) {
      workspaceYaml.patchedDependencies = this._patchedDependencies;
    }

    return yamlModule.dump(workspaceYaml, PNPM_SHRINKWRAP_YAML_FORMAT);
  }
}
