// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';

import { RushConfiguration } from '../../api/RushConfiguration';
import {
  PackageJsonDependency,
  DependencyType
} from '../../api/PackageJsonEditor';
import { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration';
import { VersionMismatchFinderEntity } from './VersionMismatchFinderEntity';
import { VersionMismatchFinderProject } from './VersionMismatchFinderProject';
import { VersionMismatchFinderCommonVersions } from './VersionMismatchFinderCommonVersions';
// import { RushConfigurationProject } from '../../api/RushConfigurationProject';

export interface IVersionMismatchFinderRushCheckOptions {
  variant?: string | undefined;
  jsonFlag?: boolean | undefined;
}

export interface IVersionMismatchFinderEnsureConsistentVersionsOptions {
  variant?: string | undefined;
}

export interface IVersionMismatchFinderGetMismatchesOptions {
  variant?: string | undefined;
}

export interface IMismatchProject {
  name: string;
  versions: IMismatchVersion[];
}

export interface IMismatchVersion {
  version: string,
  projects: string[];
}

export interface IMismatchVersions {
  mismatchedVersions: IMismatchProject[];
}

export class VersionMismatchFinder {
 /* store it like this:
  * {
  *   "@types/node": {
  *     "1.0.0": [ '@ms/rush' ]
  *   }
  * }
  */
  private _allowedAlternativeVersion:  Map<string, ReadonlyArray<string>>;
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
    options: IVersionMismatchFinderRushCheckOptions = {}
  ): void {
    VersionMismatchFinder._checkForInconsistentVersions(rushConfiguration, {
      ...options,
      isRushCheckCommand: true
    });
  }

  public static ensureConsistentVersions(
    rushConfiguration: RushConfiguration,
    options: IVersionMismatchFinderEnsureConsistentVersionsOptions = {}
  ): void {
    VersionMismatchFinder._checkForInconsistentVersions(rushConfiguration, {
      ...options,
      isRushCheckCommand: false
    });
  }

  /**
   * Populates a version mismatch finder object given a Rush Configuration.
   * Intentionally considers preferred versions.
   */
  public static getMismatches(
    rushConfiguration: RushConfiguration,
    options: IVersionMismatchFinderRushCheckOptions = {}
  ): VersionMismatchFinder {
    const commonVersions: CommonVersionsConfiguration = rushConfiguration.getCommonVersions(options.variant);

    const projects: VersionMismatchFinderEntity[] = rushConfiguration.projects.map((project) => {
      return new VersionMismatchFinderProject(project);
    });

    // Create an object for the purposes of reporting conflicts with preferredVersions
    // or xstitchPreferredVersions from common-versions.json
    projects.push(new VersionMismatchFinderCommonVersions(commonVersions));

    return new VersionMismatchFinder(
      projects,
      commonVersions.allowedAlternativeVersions
    );
  }

  private static _checkForInconsistentVersions(
    rushConfiguration: RushConfiguration,
    options: {
      isRushCheckCommand: boolean;
      variant?: string | undefined;
      jsonFlag?: boolean | undefined;
    }
  ): void {

    if (rushConfiguration.ensureConsistentVersions || options.isRushCheckCommand) {
      const mismatchFinder: VersionMismatchFinder = VersionMismatchFinder.getMismatches(rushConfiguration, options);

      if (options.jsonFlag) {
        console.log(JSON.stringify(mismatchFinder.getMismatchJson(), undefined, 2));
      } else {
        mismatchFinder.print();

        if (mismatchFinder.numberOfMismatches) {
          console.log(colors.red(`Found ${mismatchFinder.numberOfMismatches} mis-matching dependencies!`));
          process.exit(1);
        } else {
          if (options.isRushCheckCommand) {
            console.log(colors.green(`Found no mis-matching dependencies!`));
          }
        }
      }
    }
  }

    public get numberOfMismatches(): number {
    return this._mismatches.size;
  }

  public getMismatches(): string[] {
    return this._getKeys(this._mismatches);
  }

  public getVersionsOfMismatch(mismatch: string): string[] | undefined {
    return this._mismatches.has(mismatch)
      ? this._getKeys(this._mismatches.get(mismatch))
      : undefined;
  }

  public getConsumersOfMismatch(mismatch: string, version: string): VersionMismatchFinderEntity[] | undefined {
    const mismatchedPackage: Map<string, VersionMismatchFinderEntity[]> | undefined = this._mismatches.get(mismatch);
    if (!mismatchedPackage) {
      return undefined;
    }

    const mismatchedVersion: VersionMismatchFinderEntity[] | undefined = mismatchedPackage.get(version);
    return mismatchedVersion;
  }

  public getMismatchJson(): IMismatchVersions {
    const mismatchedVersions: IMismatchProject[] = [];

    this.getMismatches().forEach((dependency: string) => {
      const mismatchedVersionsArray: IMismatchVersion[] = [];
      this.getVersionsOfMismatch(dependency)!.forEach((version: string) => {
        const projects: string[] = []
        this.getConsumersOfMismatch(dependency, version)!.forEach((project: VersionMismatchFinderEntity) => {
          projects.push(project.friendlyName);
        });
        const mismatchedVersion: IMismatchVersion = {
          version: version,
          projects: projects
        }
        mismatchedVersionsArray.push(mismatchedVersion);
      });
      const mismatchedProject: IMismatchProject = {
          name: dependency,
          versions: mismatchedVersionsArray
      };

      mismatchedVersions.push(mismatchedProject);
    });

    const output: IMismatchVersions = {
      mismatchedVersions: mismatchedVersions
    };
    return output;
  }

  public print(): void {
    // Iterate over the list. For any dependency with mismatching versions, print the projects
    this.getMismatches().forEach((dependency: string) => {
      console.log(colors.yellow(dependency));
      this.getVersionsOfMismatch(dependency)!.forEach((version: string) => {
        console.log(`  ${version}`);
        this.getConsumersOfMismatch(dependency, version)!.forEach((project: VersionMismatchFinderEntity) => {
          console.log(`   - ${project.friendlyName}`);
        });
      });
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

            const isCyclic: boolean = project.cyclicDependencyProjects.has(dependency.name);

            if (this._isVersionAllowedAlternative(dependency.name, version)) {
              return;
            }

            const name: string = dependency.name + (isCyclic ? ' (cyclic)' : '');

            if (!this._mismatches.has(name)) {
              this._mismatches.set(name, new Map<string, VersionMismatchFinderEntity[]>());
            }

            const dependencyVersions: Map<string, VersionMismatchFinderEntity[]> = this._mismatches.get(name)!;

            if (!dependencyVersions.has(version)) {
              dependencyVersions.set(version, []);
            }

            dependencyVersions.get(version)!.push(project);
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

  private _isVersionAllowedAlternative(
    dependency: string,
    version: string): boolean {

    const allowedAlternatives: ReadonlyArray<string> | undefined = this._allowedAlternativeVersion.get(dependency);
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
