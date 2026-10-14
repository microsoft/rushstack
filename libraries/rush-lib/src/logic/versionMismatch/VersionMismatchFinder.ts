// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../../api/RushConfiguration';
import { type PackageJsonDependency, DependencyType } from '../../api/PackageJsonEditor';
import type { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration';
import type { VersionMismatchFinderEntity } from './VersionMismatchFinderEntity';
import { VersionMismatchFinderProject } from './VersionMismatchFinderProject';
import { VersionMismatchFinderCommonVersions } from './VersionMismatchFinderCommonVersions';
import { CustomTipId } from '../../api/CustomTipsConfiguration';
import type { Subspace } from '../../api/Subspace';
import { getEffectivePnpmCatalogs, type PnpmCatalogs } from '../pnpm/EffectivePnpmOptions';
import {
  formatPnpmCatalogSpecifier,
  type IPnpmCatalogReference,
  tryParsePnpmCatalogName,
  tryResolvePnpmCatalogReference
} from '../pnpm/PnpmCatalogReference';

const TRUNCATE_AFTER_PACKAGE_NAME_COUNT: number = 5;

export interface IVersionMismatchFinderOptions {
  subspace?: Subspace;
  variant: string | undefined;
}

export interface IVersionMismatchFinderRushCheckOptions extends IVersionMismatchFinderOptions {
  printAsJson?: boolean | undefined;
  truncateLongPackageNameLists?: boolean | undefined;
}

export interface IVersionMismatchFinderEnsureConsistentVersionsOptions
  extends IVersionMismatchFinderOptions {}

export interface IVersionMismatchFinderGetMismatchesOptions extends IVersionMismatchFinderOptions {}

export interface IMismatchDependency {
  dependencyName: string;
  versions: IMismatchDependencyVersion[];
}

export interface IMismatchDependencyVersion {
  /**
   * For a PNPM catalog reference, the version from the catalog entry, or the reference itself
   * (such as `catalog:tools`) if it does not resolve.
   */
  version: string;
  projects: string[];
  /**
   * Projects that reference this version through a PNPM catalog. Omitted if there are none.
   */
  catalogReferences?: IMismatchDependencyCatalogReference[];
}

export interface IMismatchDependencyCatalogReference {
  project: string;
  versionSpecifier: string;
}

export interface IMismatchDependencies {
  mismatchedVersions: IMismatchDependency[];
}

export class VersionMismatchFinder {
  /* store it like this:
   * {
   *   "@types/node": {
   *     "1.0.0": [ '@ms/rush' ]
   *   }
   * }
   */
  #allowedAlternativeVersion: Map<string, ReadonlyArray<string>>;
  #mismatches: Map<string, Map<string, VersionMismatchFinderEntity[]>>;
  /**
   * dependency name -> version -> consumer -> the consumer's catalog reference
   */
  #catalogVersionSpecifiers: Map<string, Map<string, Map<VersionMismatchFinderEntity, string>>>;
  #projects: VersionMismatchFinderEntity[];

  public constructor(
    projects: VersionMismatchFinderEntity[],
    allowedAlternativeVersions?: Map<string, ReadonlyArray<string>>
  ) {
    this.#projects = projects;
    this.#mismatches = new Map<string, Map<string, VersionMismatchFinderEntity[]>>();
    this.#catalogVersionSpecifiers = new Map();
    this.#allowedAlternativeVersion = allowedAlternativeVersions || new Map<string, ReadonlyArray<string>>();
    this.#analyze();
  }

  public static rushCheck(
    rushConfiguration: RushConfiguration,
    terminal: ITerminal,
    options?: IVersionMismatchFinderRushCheckOptions
  ): void {
    const {
      variant,
      subspace = rushConfiguration.defaultSubspace,
      printAsJson,
      truncateLongPackageNameLists
    } = options ?? {};

    _checkForInconsistentVersions(rushConfiguration, {
      variant,
      subspace,
      printAsJson,
      truncateLongPackageNameLists,
      terminal,
      isRushCheckCommand: true
    });
  }

  public static ensureConsistentVersions(
    rushConfiguration: RushConfiguration,
    terminal: ITerminal,
    options?: IVersionMismatchFinderEnsureConsistentVersionsOptions
  ): void {
    const { variant, subspace = rushConfiguration.defaultSubspace } = options ?? {};

    _checkForInconsistentVersions(rushConfiguration, {
      subspace,
      variant,
      terminal,
      isRushCheckCommand: false,
      truncateLongPackageNameLists: true
    });
  }

  /**
   * Populates a version mismatch finder object given a Rush Configuration.
   * Intentionally considers preferred versions.
   * PNPM catalog references are compared by the version that they resolve to in the subspace's catalogs.
   */
  public static getMismatches(
    rushConfiguration: RushConfiguration,
    options?: IVersionMismatchFinderOptions
  ): VersionMismatchFinder {
    const { subspace = rushConfiguration.defaultSubspace, variant } = options ?? {};
    const commonVersions: CommonVersionsConfiguration = subspace.getCommonVersions(variant);

    const projects: VersionMismatchFinderEntity[] = [];

    // Create an object for the purposes of reporting conflicts with preferredVersions from common-versions.json
    // Make sure this one is first so it doesn't get truncated when a long list is printed
    projects.push(new VersionMismatchFinderCommonVersions(commonVersions));

    const pnpmCatalogs: PnpmCatalogs | undefined = getEffectivePnpmCatalogs(subspace, rushConfiguration);

    // If subspace is specified, only go through projects in that subspace
    for (const project of subspace.getProjects()) {
      projects.push(new VersionMismatchFinderProject(project, pnpmCatalogs));
    }

    return new VersionMismatchFinder(projects, commonVersions.allowedAlternativeVersions);
  }

  public get mismatches(): ReadonlyMap<string, ReadonlyMap<string, readonly VersionMismatchFinderEntity[]>> {
    return this.#mismatches;
  }

  public get numberOfMismatches(): number {
    return this.#mismatches.size;
  }

  public getMismatches(): string[] {
    return this.#getKeys(this.#mismatches);
  }

  public getVersionsOfMismatch(mismatch: string): string[] | undefined {
    return this.#mismatches.has(mismatch) ? this.#getKeys(this.#mismatches.get(mismatch)) : undefined;
  }

  public getConsumersOfMismatch(
    mismatch: string,
    version: string
  ): VersionMismatchFinderEntity[] | undefined {
    const mismatchedPackage: Map<string, VersionMismatchFinderEntity[]> | undefined =
      this.#mismatches.get(mismatch);
    if (!mismatchedPackage) {
      return undefined;
    }

    const mismatchedVersion: VersionMismatchFinderEntity[] | undefined = mismatchedPackage.get(version);
    return mismatchedVersion;
  }

  /**
   * Returns the consumer's catalog reference (such as `catalog:tools`) if it references the version
   * through a PNPM catalog.
   */
  public tryGetCatalogVersionSpecifier(
    mismatch: string,
    version: string,
    consumer: VersionMismatchFinderEntity
  ): string | undefined {
    return this.#catalogVersionSpecifiers.get(mismatch)?.get(version)?.get(consumer);
  }

  public printAsJson(): void {
    const mismatchDependencies: IMismatchDependency[] = [];

    this.getMismatches().forEach((dependency: string) => {
      const mismatchDependencyVersionArray: IMismatchDependencyVersion[] = [];
      this.getVersionsOfMismatch(dependency)!.forEach((version: string) => {
        const projects: string[] = [];
        const catalogReferences: IMismatchDependencyCatalogReference[] = [];
        this.getConsumersOfMismatch(dependency, version)!.forEach((project: VersionMismatchFinderEntity) => {
          projects.push(project.friendlyName);
          const versionSpecifier: string | undefined = this.tryGetCatalogVersionSpecifier(
            dependency,
            version,
            project
          );
          if (versionSpecifier !== undefined) {
            catalogReferences.push({ project: project.friendlyName, versionSpecifier });
          }
        });
        const mismatchDependencyVersion: IMismatchDependencyVersion = {
          version: version,
          projects: projects
        };
        if (catalogReferences.length > 0) {
          mismatchDependencyVersion.catalogReferences = catalogReferences;
        }
        mismatchDependencyVersionArray.push(mismatchDependencyVersion);
      });
      const mismatchDependency: IMismatchDependency = {
        dependencyName: dependency,
        versions: mismatchDependencyVersionArray
      };
      mismatchDependencies.push(mismatchDependency);
    });

    const output: IMismatchDependencies = {
      mismatchedVersions: mismatchDependencies
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(output, undefined, 2));
  }

  public print(truncateLongPackageNameLists: boolean = false): void {
    // Iterate over the list. For any dependency with mismatching versions, print the projects
    this.getMismatches().forEach((dependency: string) => {
      // eslint-disable-next-line no-console
      console.log(Colorize.yellow(dependency));
      this.getVersionsOfMismatch(dependency)!.forEach((version: string) => {
        const consumersOfMismatch: VersionMismatchFinderEntity[] = this.getConsumersOfMismatch(
          dependency,
          version
        )!;

        // eslint-disable-next-line no-console
        console.log(`  ${version}${this.#getVersionAnnotation(dependency, version)}`);

        let numberToPrint: number = truncateLongPackageNameLists
          ? TRUNCATE_AFTER_PACKAGE_NAME_COUNT
          : consumersOfMismatch.length;
        let numberRemaining: number = consumersOfMismatch.length;
        for (const consumer of consumersOfMismatch) {
          if (numberToPrint-- === 0) {
            break;
          }

          numberRemaining--;

          const versionSpecifier: string | undefined = this.tryGetCatalogVersionSpecifier(
            dependency,
            version,
            consumer
          );
          const consumerAnnotation: string =
            versionSpecifier !== undefined && versionSpecifier !== version ? ` (${versionSpecifier})` : '';

          // eslint-disable-next-line no-console
          console.log(`   - ${consumer.friendlyName}${consumerAnnotation}`);
        }

        if (numberRemaining > 0) {
          // eslint-disable-next-line no-console
          console.log(`   (and ${numberRemaining} others)`);
        }
      });
      // eslint-disable-next-line no-console
      console.log();
    });
  }

  /**
   * Returns a suffix such as ` (catalog:)` or ` (unresolved PNPM catalog reference)`, or `''`.
   */
  #getVersionAnnotation(dependency: string, version: string): string {
    const catalogConsumers: Map<VersionMismatchFinderEntity, string> | undefined =
      this.#catalogVersionSpecifiers.get(dependency)?.get(version);
    if (!catalogConsumers) {
      return '';
    }

    if (tryParsePnpmCatalogName(version) !== undefined) {
      return ' (unresolved PNPM catalog reference)';
    }

    const catalogSpecifiers: Set<string> = new Set();
    for (const versionSpecifier of catalogConsumers.values()) {
      catalogSpecifiers.add(formatPnpmCatalogSpecifier(tryParsePnpmCatalogName(versionSpecifier)!));
    }

    return ` (${Array.from(catalogSpecifiers).join(', ')})`;
  }

  #analyze(): void {
    this.#projects.forEach((project: VersionMismatchFinderEntity) => {
      if (!project.skipRushCheck) {
        // NOTE: We do not consider peer dependencies here.  The purpose of "rush check" is
        // mainly to avoid side-by-side duplicates in the node_modules folder, whereas
        // peer dependencies are just a compatibility statement that will be satisfied by a
        // regular dependency.  (It might be useful for Rush to help people keep their peer dependency
        // patterns consistent, but on the other hand different projects may have different
        // levels of compatibility -- we should wait for someone to actually request this feature
        // before we get into that.)
        project.allDependencies.forEach((dependency: PackageJsonDependency) => {
          if (dependency.dependencyType !== DependencyType.Peer) {
            const versionSpecifier: string = dependency.version!;

            // Compare a catalog reference by the version that PNPM installs. An unresolved reference keeps its
            // canonical form so that it is reported as its own version.
            const catalogReference: IPnpmCatalogReference | undefined = tryResolvePnpmCatalogReference(
              dependency.name,
              versionSpecifier,
              project.pnpmCatalogs
            );
            const version: string = catalogReference
              ? (catalogReference.resolvedVersion ?? formatPnpmCatalogSpecifier(catalogReference.catalogName))
              : versionSpecifier;

            const isCyclic: boolean = project.decoupledLocalDependencies.has(dependency.name);

            if (
              this.#isVersionAllowedAlternative(dependency.name, version) ||
              (catalogReference && this.#isVersionAllowedAlternative(dependency.name, versionSpecifier))
            ) {
              return;
            }

            const name: string = dependency.name + (isCyclic ? ' (cyclic)' : '');

            let dependencyVersions: Map<string, VersionMismatchFinderEntity[]> | undefined =
              this.#mismatches.get(name);
            if (!dependencyVersions) {
              this.#mismatches.set(
                name,
                (dependencyVersions = new Map<string, VersionMismatchFinderEntity[]>())
              );
            }

            const consumers: VersionMismatchFinderEntity[] | undefined = dependencyVersions.get(version);
            if (!consumers) {
              dependencyVersions.set(version, [project]);
            } else {
              consumers.push(project);
            }

            if (catalogReference) {
              let catalogVersions: Map<string, Map<VersionMismatchFinderEntity, string>> | undefined =
                this.#catalogVersionSpecifiers.get(name);
              if (!catalogVersions) {
                this.#catalogVersionSpecifiers.set(name, (catalogVersions = new Map()));
              }

              let catalogConsumers: Map<VersionMismatchFinderEntity, string> | undefined =
                catalogVersions.get(version);
              if (!catalogConsumers) {
                catalogVersions.set(version, (catalogConsumers = new Map()));
              }

              catalogConsumers.set(project, versionSpecifier);
            }
          }
        });
      }
    });

    this.#mismatches.forEach((mismatches: Map<string, VersionMismatchFinderEntity[]>, project: string) => {
      if (mismatches.size <= 1) {
        this.#mismatches.delete(project);
        this.#catalogVersionSpecifiers.delete(project);
      }
    });
  }

  #isVersionAllowedAlternative(dependency: string, version: string): boolean {
    const allowedAlternatives: ReadonlyArray<string> | undefined =
      this.#allowedAlternativeVersion.get(dependency);
    return Boolean(allowedAlternatives && allowedAlternatives.indexOf(version) > -1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #getKeys(iterable: Map<string, any> | undefined): string[] {
    const keys: string[] = [];
    if (iterable) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      iterable.forEach((value: any, key: string) => {
        keys.push(key);
      });
    }
    return keys;
  }
}

function _checkForInconsistentVersions(
  rushConfiguration: RushConfiguration,
  options: {
    isRushCheckCommand: boolean;
    subspace: Subspace;
    variant: string | undefined;
    printAsJson?: boolean | undefined;
    terminal: ITerminal;
    truncateLongPackageNameLists?: boolean | undefined;
  }
): void {
  const { variant, isRushCheckCommand, printAsJson, subspace, truncateLongPackageNameLists, terminal } =
    options;
  if (subspace.shouldEnsureConsistentVersions(variant) || isRushCheckCommand) {
    const mismatchFinder: VersionMismatchFinder = VersionMismatchFinder.getMismatches(
      rushConfiguration,
      options
    );

    if (printAsJson) {
      mismatchFinder.printAsJson();
    } else {
      mismatchFinder.print(truncateLongPackageNameLists);

      if (mismatchFinder.numberOfMismatches > 0) {
        // eslint-disable-next-line no-console
        console.log(
          Colorize.red(
            `Found ${mismatchFinder.numberOfMismatches} mis-matching dependencies ${
              subspace?.subspaceName ? `in subspace: ${subspace?.subspaceName}` : ''
            }`
          )
        );
        rushConfiguration.customTipsConfiguration._showErrorTip(
          terminal,
          CustomTipId.TIP_RUSH_INCONSISTENT_VERSIONS
        );
        if (!isRushCheckCommand && truncateLongPackageNameLists) {
          // There isn't a --verbose flag in `rush install`/`rush update`, so a long list will always be truncated.
          // eslint-disable-next-line no-console
          console.log(
            'For more detailed reporting about these version mismatches, use the "rush check --verbose" command.'
          );
        }

        throw new AlreadyReportedError();
      } else {
        if (isRushCheckCommand) {
          // eslint-disable-next-line no-console
          console.log(Colorize.green(`Found no mis-matching dependencies!`));
        }
      }
    }
  }
}
