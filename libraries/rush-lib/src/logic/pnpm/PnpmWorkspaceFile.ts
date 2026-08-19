// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { escapePath as globEscape } from 'fast-glob';

import { FileSystem, Sort, Path } from '@rushstack/node-core-library';

import { BaseWorkspaceFile } from '../base/BaseWorkspaceFile';
import { PNPM_SHRINKWRAP_YAML_FORMAT } from './PnpmYamlCommon';
import type {
  IPnpmPackageExtension,
  IPnpmPeerDependencyRules,
  PnpmTrustPolicy
} from './PnpmOptionsConfiguration';

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
   * Optional dependencies whose names are listed here are skipped during installation. In pnpm 11+
   * this replaces the `pnpm.ignoredOptionalDependencies` field of `package.json`, which pnpm no
   * longer reads.
   * (SUPPORTED ONLY IN PNPM 9.0.0 AND NEWER)
   */
  ignoredOptionalDependencies: string[] | undefined;
  /**
   * The trust policy applied when installing packages. In pnpm 11+ this replaces the
   * `pnpm.trustPolicy` field of `package.json`, which pnpm no longer reads.
   * (SUPPORTED ONLY IN PNPM 10.21.0 AND NEWER)
   */
  trustPolicy: PnpmTrustPolicy | undefined;
  /**
   * Package selectors excluded from the trust policy check. In pnpm 11+ this replaces the
   * `pnpm.trustPolicyExclude` field of `package.json`, which pnpm no longer reads.
   * (SUPPORTED ONLY IN PNPM 10.22.0 AND NEWER)
   */
  trustPolicyExclude: string[] | undefined;
  /**
   * Ignore the trust policy check for packages published more than this many minutes ago. In
   * pnpm 11+ this replaces the `pnpm.trustPolicyIgnoreAfter` field of `package.json`, which pnpm
   * no longer reads.
   * (SUPPORTED ONLY IN PNPM 10.27.0 AND NEWER)
   */
  trustPolicyIgnoreAfter: number | undefined;
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
  /**
   * The path to the "global pnpmfile" that Rush generates when subspaces are enabled, which rewrites
   * cross-subspace `workspace:*` dependency specifiers to `link:` specifiers. pnpm 11+ only reads
   * auth/registry settings from `.npmrc`, so the `global-pnpmfile=` line Rush writes there is
   * silently ignored; for pnpm 11+ the path is emitted here instead. Without it, installation of a
   * subspace with cross-subspace dependencies fails with ERR_PNPM_WORKSPACE_PKG_NOT_FOUND.
   * (USED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  globalPnpmfile: string | undefined;
}

export class PnpmWorkspaceFile extends BaseWorkspaceFile {
  /**
   * The filename of the workspace file.
   */
  public readonly workspaceFilename: string;

  readonly #workspacePackages: Set<string>;
  public catalogs: IPnpmWorkspaceYaml['catalogs'];
  public allowBuilds: IPnpmWorkspaceYaml['allowBuilds'];
  public overrides: IPnpmWorkspaceYaml['overrides'];
  public packageExtensions: IPnpmWorkspaceYaml['packageExtensions'];
  public peerDependencyRules: IPnpmWorkspaceYaml['peerDependencyRules'];
  public allowedDeprecatedVersions: IPnpmWorkspaceYaml['allowedDeprecatedVersions'];
  public patchedDependencies: IPnpmWorkspaceYaml['patchedDependencies'];
  public ignoredOptionalDependencies: IPnpmWorkspaceYaml['ignoredOptionalDependencies'];
  public trustPolicy: IPnpmWorkspaceYaml['trustPolicy'];
  public trustPolicyExclude: IPnpmWorkspaceYaml['trustPolicyExclude'];
  public trustPolicyIgnoreAfter: IPnpmWorkspaceYaml['trustPolicyIgnoreAfter'];
  public minimumReleaseAge: IPnpmWorkspaceYaml['minimumReleaseAge'];
  public minimumReleaseAgeExclude: IPnpmWorkspaceYaml['minimumReleaseAgeExclude'];
  public globalPnpmfile: IPnpmWorkspaceYaml['globalPnpmfile'];

  /**
   * The PNPM workspace file is used to specify the location of workspaces relative to the root
   * of your PNPM install.
   */
  public constructor(workspaceYamlFilename: string) {
    super();

    this.workspaceFilename = workspaceYamlFilename;
    // Ignore any existing file since this file is generated and we need to handle deleting packages
    // If we need to support manual customization, that should be an additional parameter for "base file"
    this.#workspacePackages = new Set<string>();
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
        ignoredOptionalDependencies,
        trustPolicy,
        trustPolicyExclude,
        trustPolicyIgnoreAfter,
        minimumReleaseAge,
        minimumReleaseAgeExclude,
        globalPnpmfile
      } = workspaceYaml;
      workspaceFile.catalogs = catalogs;
      workspaceFile.allowBuilds = allowBuilds;
      workspaceFile.overrides = overrides;
      workspaceFile.packageExtensions = packageExtensions;
      workspaceFile.peerDependencyRules = peerDependencyRules;
      workspaceFile.allowedDeprecatedVersions = allowedDeprecatedVersions;
      workspaceFile.patchedDependencies = patchedDependencies;
      workspaceFile.ignoredOptionalDependencies = ignoredOptionalDependencies;
      workspaceFile.trustPolicy = trustPolicy;
      workspaceFile.trustPolicyExclude = trustPolicyExclude;
      workspaceFile.trustPolicyIgnoreAfter = trustPolicyIgnoreAfter;
      workspaceFile.minimumReleaseAge = minimumReleaseAge;
      workspaceFile.minimumReleaseAgeExclude = minimumReleaseAgeExclude;
      workspaceFile.globalPnpmfile = globalPnpmfile;
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
    this.#workspacePackages.add(globEscape(globPath));
  }

  protected override async serializeAsync(): Promise<string> {
    const workspacePackages: Set<string> = this.#workspacePackages;
    const {
      catalogs,
      allowBuilds,
      overrides,
      packageExtensions,
      peerDependencyRules,
      allowedDeprecatedVersions,
      patchedDependencies,
      ignoredOptionalDependencies,
      trustPolicy,
      trustPolicyExclude,
      trustPolicyIgnoreAfter,
      minimumReleaseAge,
      minimumReleaseAgeExclude,
      globalPnpmfile
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
      ignoredOptionalDependencies,
      trustPolicy,
      trustPolicyExclude,
      trustPolicyIgnoreAfter,
      minimumReleaseAge,
      minimumReleaseAgeExclude,
      globalPnpmfile
    };

    const yamlModule: typeof import('js-yaml') = await import('js-yaml');
    return yamlModule.dump(workspaceYaml, PNPM_SHRINKWRAP_YAML_FORMAT);
  }
}
