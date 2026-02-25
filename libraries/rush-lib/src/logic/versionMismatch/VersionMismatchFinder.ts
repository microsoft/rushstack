// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../../api/RushConfiguration.ts';
import { type PackageJsonDependency, DependencyType } from '../../api/PackageJsonEditor.ts';
import type { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration.ts';
import type { VersionMismatchFinderEntity } from './VersionMismatchFinderEntity.ts';
import { VersionMismatchFinderProject } from './VersionMismatchFinderProject.ts';
import { VersionMismatchFinderCommonVersions } from './VersionMismatchFinderCommonVersions.ts';
import { CustomTipId } from '../../api/CustomTipsConfiguration.ts';
import type { Subspace } from '../../api/Subspace.ts';

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
  version: string;
  projects: string[];
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
  private _allowedAlternativeVersion: Map<string, ReadonlyArray<string>>;
  private _mismatches: Map<string, Map<string, VersionMismatchFinderEntity[]>>;
  private _projects: VersionMismatchFinderEntity[];

  public constructor(
    projects: VersionMismatchFinderEntity[],
    allowedAlternativeVersions?: Map<string, ReadonlyArray<string>>
  ) {
    this._projects = projects;
    this._mismatches = new Map<string, Map<string, VersionMismatchFinderEntity[]>>();
    this._allowedAlternativeVersion = allowedAlternativeVersions || new Map<string, ReadonlyArray<string>>();
    this._analyze();
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

    VersionMismatchFinder._checkForInconsistentVersions(rushConfiguration, {
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

    VersionMismatchFinder._checkForInconsistentVersions(rushConfiguration, {
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

    // If subspace is specified, only go through projects in that subspace
    for (const project of subspace.getProjects()) {
      projects.push(new VersionMismatchFinderProject(project));
    }

    return new VersionMismatchFinder(projects, commonVersions.allowedAlternativeVersions);
  }

  private static _checkForInconsistentVersions(
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

  public get mismatches(): ReadonlyMap<string, ReadonlyMap<string, readonly VersionMismatchFinderEntity[]>> {
    return this._mismatches;
  }

  public get numberOfMismatches(): number {
    return this._mismatches.size;
  }

  public getMismatches(): string[] {
    return this._getKeys(this._mismatches);
  }

  public getVersionsOfMismatch(mismatch: string): string[] | undefined {
    return this._mismatches.has(mismatch) ? this._getKeys(this._mismatches.get(mismatch)) : undefined;
  }

  public getConsumersOfMismatch(
    mismatch: string,
    version: string
  ): VersionMismatchFinderEntity[] | undefined {
    const mismatchedPackage: Map<string, VersionMismatchFinderEntity[]> | undefined =
      this._mismatches.get(mismatch);
    if (!mismatchedPackage) {
      return undefined;
    }

    const mismatchedVersion: VersionMismatchFinderEntity[] | undefined = mismatchedPackage.get(version);
    return mismatchedVersion;
  }

  public printAsJson(): void {
    const mismatchDependencies: IMismatchDependency[] = [];

    this.getMismatches().forEach((dependency: string) => {
      const mismatchDependencyVersionArray: IMismatchDependencyVersion[] = [];
      this.getVersionsOfMismatch(dependency)!.forEach((version: string) => {
        const projects: string[] = [];
        this.getConsumersOfMismatch(dependency, version)!.forEach((project: VersionMismatchFinderEntity) => {
          projects.push(project.friendlyName);
        });
        const mismatchDependencyVersion: IMismatchDependencyVersion = {
          version: version,
          projects: projects
        };
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
        // eslint-disable-next-line no-console
        console.log(`  ${version}`);
        const consumersOfMismatch: VersionMismatchFinderEntity[] = this.getConsumersOfMismatch(
          dependency,
          version
        )!;

        let numberToPrint: number = truncateLongPackageNameLists
          ? TRUNCATE_AFTER_PACKAGE_NAME_COUNT
          : consumersOfMismatch.length;
        let numberRemaining: number = consumersOfMismatch.length;
        for (const { friendlyName } of consumersOfMismatch) {
          if (numberToPrint-- === 0) {
            break;
          }

          numberRemaining--;

          // eslint-disable-next-line no-console
          console.log(`   - ${friendlyName}`);
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

  private _analyze(): void {
    this._projects.forEach((project: VersionMismatchFinderEntity) => {
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
            const version: string = dependency.version!;

            const isCyclic: boolean = project.decoupledLocalDependencies.has(dependency.name);

            if (this._isVersionAllowedAlternative(dependency.name, version)) {
              return;
            }

            const name: string = dependency.name + (isCyclic ? ' (cyclic)' : '');

            let dependencyVersions: Map<string, VersionMismatchFinderEntity[]> | undefined =
              this._mismatches.get(name);
            if (!dependencyVersions) {
              this._mismatches.set(
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
          }
        });
      }
    });

    this._mismatches.forEach((mismatches: Map<string, VersionMismatchFinderEntity[]>, project: string) => {
      if (mismatches.size <= 1) {
        this._mismatches.delete(project);
      }
    });
  }

  private _isVersionAllowedAlternative(dependency: string, version: string): boolean {
    const allowedAlternatives: ReadonlyArray<string> | undefined =
      this._allowedAlternativeVersion.get(dependency);
    return Boolean(allowedAlternatives && allowedAlternatives.indexOf(version) > -1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _getKeys(iterable: Map<string, any> | undefined): string[] {
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
