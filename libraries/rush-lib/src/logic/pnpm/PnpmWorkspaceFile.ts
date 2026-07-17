// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { escapePath as globEscape } from 'fast-glob';

import { FileSystem, Sort, Path } from '@rushstack/node-core-library';

import { BaseWorkspaceFile } from '../base/BaseWorkspaceFile';
import { PNPM_SHRINKWRAP_YAML_FORMAT } from './PnpmYamlCommon';
import type { IPnpmPackageExtension, IPnpmPeerDependencyRules } from './PnpmOptionsConfiguration';

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
  catalogs: Record<string, Record<string, string>> | undefined;
  /**
   * Controls which packages are allowed to run build scripts. A value of `true` means the
   * package is allowed to run build scripts; `false` means it is explicitly denied.
   * Packages with build scripts not listed here will cause pnpm to fail with ERR_PNPM_IGNORED_BUILDS.
   * (SUPPORTED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  allowBuilds: Record<string, boolean> | undefined;
  /**
   * Dependency version overrides. In pnpm 11+ this replaces the `pnpm.overrides` field of
   * `package.json`, which pnpm no longer reads.
   * (SUPPORTED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  overrides: Record<string, string> | undefined;
  /**
   * Extensions applied to the `package.json` of matched dependencies. In pnpm 11+ this replaces
   * the `pnpm.packageExtensions` field of `package.json`, which pnpm no longer reads.
   * (SUPPORTED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  packageExtensions: Record<string, IPnpmPackageExtension> | undefined;
  /**
   * Rules for suppressing peer dependency validation errors. In pnpm 11+ this replaces the
   * `pnpm.peerDependencyRules` field of `package.json`, which pnpm no longer reads.
   * (SUPPORTED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  peerDependencyRules: IPnpmPeerDependencyRules | undefined;
  /**
   * Suppresses installation warnings for deprecated package versions. In pnpm 11+ this replaces
   * the `pnpm.allowedDeprecatedVersions` field of `package.json`, which pnpm no longer reads.
   * (SUPPORTED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  allowedDeprecatedVersions: Record<string, string> | undefined;
  /**
   * Patches applied to dependencies. In pnpm 11+ this replaces the `pnpm.patchedDependencies`
   * field of `package.json`, which pnpm no longer reads.
   * (SUPPORTED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  patchedDependencies: Record<string, string> | undefined;
  /**
   * The minimum number of minutes that must pass after a version is published before pnpm will install it.
   * (SUPPORTED ONLY IN PNPM 10.16.0 AND NEWER)
   */
  minimumReleaseAge: number | undefined;
  /**
   * List of package names or patterns that are excluded from the minimumReleaseAge check.
   * (SUPPORTED ONLY IN PNPM 10.16.0 AND NEWER)
   */
  minimumReleaseAgeExclude: string[] | undefined;
}

export class PnpmWorkspaceFile extends BaseWorkspaceFile {
  /**
   * The filename of the workspace file.
   */
  public readonly workspaceFilename: string;

  private readonly _workspacePackages: Set<string>;
  public catalogs: IPnpmWorkspaceYaml['catalogs'];
  public allowBuilds: IPnpmWorkspaceYaml['allowBuilds'];
  public overrides: IPnpmWorkspaceYaml['overrides'];
  public packageExtensions: IPnpmWorkspaceYaml['packageExtensions'];
  public peerDependencyRules: IPnpmWorkspaceYaml['peerDependencyRules'];
  public allowedDeprecatedVersions: IPnpmWorkspaceYaml['allowedDeprecatedVersions'];
  public patchedDependencies: IPnpmWorkspaceYaml['patchedDependencies'];
  public minimumReleaseAge: IPnpmWorkspaceYaml['minimumReleaseAge'];
  public minimumReleaseAgeExclude: IPnpmWorkspaceYaml['minimumReleaseAgeExclude'];

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
  }

  /**
   * Reads an existing `pnpm-workspace.yaml` file and returns a {@link PnpmWorkspaceFile} whose
   * settings properties are populated from its contents.
   *
   * @remarks
   * The workspace `packages` list is not loaded; the returned instance is intended for reading the
   * generated pnpm settings (such as `allowBuilds` and `patchedDependencies`), not for
   * re-serialization.
   *
   * @param workspaceYamlFilename - The path to the `pnpm-workspace.yaml` file
   */
  public static async tryLoadAsync(workspaceYamlFilename: string): Promise<PnpmWorkspaceFile | undefined> {
    let workspaceYamlContent: string;
    try {
      workspaceYamlContent = await FileSystem.readFileAsync(workspaceYamlFilename);
    } catch (error) {
      if (FileSystem.isNotExistError(error)) {
        return undefined;
      } else {
        throw error;
      }
    }

    const yamlModule: typeof import('js-yaml') = await import('js-yaml');
    const workspaceYaml: IPnpmWorkspaceYaml | undefined = yamlModule.load(workspaceYamlContent) as
      | IPnpmWorkspaceYaml
      | undefined;

    const workspaceFile: PnpmWorkspaceFile = new PnpmWorkspaceFile(workspaceYamlFilename);
    if (workspaceYaml) {
      const {
        catalogs,
        allowBuilds,
        overrides,
        packageExtensions,
        peerDependencyRules,
        allowedDeprecatedVersions,
        patchedDependencies,
        minimumReleaseAge,
        minimumReleaseAgeExclude
      } = workspaceYaml;
      workspaceFile.catalogs = catalogs;
      workspaceFile.allowBuilds = allowBuilds;
      workspaceFile.overrides = overrides;
      workspaceFile.packageExtensions = packageExtensions;
      workspaceFile.peerDependencyRules = peerDependencyRules;
      workspaceFile.allowedDeprecatedVersions = allowedDeprecatedVersions;
      workspaceFile.patchedDependencies = patchedDependencies;
      workspaceFile.minimumReleaseAge = minimumReleaseAge;
      workspaceFile.minimumReleaseAgeExclude = minimumReleaseAgeExclude;
    }

    return workspaceFile;
  }

  public override addPackage(packagePath: string): void {
    // Ensure the path is relative to the pnpm-workspace.yaml file
    if (path.isAbsolute(packagePath)) {
      packagePath = path.relative(path.dirname(this.workspaceFilename), packagePath);
    }

    // Glob can't handle Windows paths
    const globPath: string = Path.convertToSlashes(packagePath);
    this._workspacePackages.add(globEscape(globPath));
  }

  protected override async serializeAsync(): Promise<string> {
    const {
      _workspacePackages: workspacePackages,
      catalogs,
      allowBuilds,
      overrides,
      packageExtensions,
      peerDependencyRules,
      allowedDeprecatedVersions,
      patchedDependencies,
      minimumReleaseAge,
      minimumReleaseAgeExclude
    } = this;
    // Ensure stable sort order when serializing
    Sort.sortSet(workspacePackages);
    const workspaceYaml: IPnpmWorkspaceYaml = {
      packages: Array.from(workspacePackages),
      // js-yaml omits mapping entries whose value is `undefined`, so no guard is needed here.
      // An explicitly-set empty object is passed through as-is.
      catalogs,
      allowBuilds,
      overrides,
      packageExtensions,
      peerDependencyRules,
      allowedDeprecatedVersions,
      patchedDependencies,
      minimumReleaseAge,
      minimumReleaseAgeExclude
    };

    const yamlModule: typeof import('js-yaml') = await import('js-yaml');
    return yamlModule.dump(workspaceYaml, PNPM_SHRINKWRAP_YAML_FORMAT);
  }
}
