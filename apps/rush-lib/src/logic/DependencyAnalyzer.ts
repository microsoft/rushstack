// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';
import { CommonVersionsConfiguration } from '../api/CommonVersionsConfiguration';
import { DependencyType, PackageJsonDependency } from '../api/PackageJsonEditor';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';

export interface IDependencyAnalysis {
  /**
   * The common versions configuration from the repo's rush configuration.
   */
  commonVersionsConfiguration: CommonVersionsConfiguration;

  /**
   * A map of all direct dependencies that only have a single semantic version specifier,
   * unless the variant has the {@link CommonVersionsConfiguration.implicitlyPreferredVersions} option
   * set to `false`.
   */
  implicitlyPreferredVersionByPackageName: Map<string, string>;

  /**
   * A map of dependency name to the set of version specifiers used in the repo.
   */
  allVersionsByPackageName: Map<string, Set<string>>;
}

export class DependencyAnalyzer {
  private static _dependencyAnalyzerByRushConfiguration:
    | Map<RushConfiguration, DependencyAnalyzer>
    | undefined;

  private _rushConfiguration: RushConfiguration;
  private _analysisByVariant: Map<string, IDependencyAnalysis> = new Map();

  private constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public static forRushConfiguration(rushConfiguration: RushConfiguration): DependencyAnalyzer {
    if (!DependencyAnalyzer._dependencyAnalyzerByRushConfiguration) {
      DependencyAnalyzer._dependencyAnalyzerByRushConfiguration = new Map();
    }

    let analyzer: DependencyAnalyzer | undefined =
      DependencyAnalyzer._dependencyAnalyzerByRushConfiguration.get(rushConfiguration);
    if (!analyzer) {
      analyzer = new DependencyAnalyzer(rushConfiguration);
      DependencyAnalyzer._dependencyAnalyzerByRushConfiguration.set(rushConfiguration, analyzer);
    }

    return analyzer;
  }

  public getAnalysis(variant?: string): IDependencyAnalysis {
    // Use an empty string as the key when no variant provided. Anything else would possibly conflict
    // with a variant created by the user
    const variantKey: string = variant || '';
    let analysis: IDependencyAnalysis | undefined = this._analysisByVariant.get(variantKey);
    if (!analysis) {
      const commonVersionsConfiguration: CommonVersionsConfiguration =
        this._rushConfiguration.getCommonVersions(variant);

      const allVersionsByPackageName: Map<string, Set<string>> = this._collectAllVersionsByPackageName(
        commonVersionsConfiguration
      );

      const implicitlyPreferredVersionByPackageName: Map<string, string> =
        this._getImplicitlyPreferredVersionByPackageName(
          commonVersionsConfiguration,
          allVersionsByPackageName
        );

      analysis = {
        commonVersionsConfiguration,
        implicitlyPreferredVersionByPackageName,
        allVersionsByPackageName
      };
      this._analysisByVariant.set(variantKey, analysis);
    }

    return analysis;
  }

  /**
   * Generates the {@link IDependencyAnalysis.allVersionsByPackageName} map.
   *
   * @remarks
   * The result of this function is not cached.
   */
  private _collectAllVersionsByPackageName(
    commonVersionsConfiguration: CommonVersionsConfiguration
  ): Map<string, Set<string>> {
    const allVersionsByPackageName: Map<string, Set<string>> = new Map();
    const allowedAlternativeVersions: Map<
      string,
      ReadonlyArray<string>
    > = commonVersionsConfiguration.allowedAlternativeVersions;
    for (const project of this._rushConfiguration.projects) {
      const dependencies: PackageJsonDependency[] = [
        ...project.packageJsonEditor.dependencyList,
        ...project.packageJsonEditor.devDependencyList
      ];
      for (const { name: dependencyName, version: dependencyVersion, dependencyType } of dependencies) {
        if (dependencyType === DependencyType.Peer) {
          // If this is a peer dependency, it isn't a real dependency in this context, so it shouldn't
          // be included in the list of dependency versions.
          continue;
        }

        const alternativesForThisDependency: ReadonlyArray<string> =
          allowedAlternativeVersions.get(dependencyName) || [];

        // For each dependency, collectImplicitlyPreferredVersions() is collecting the set of all version specifiers
        // that appear across the repo.  If there is only one version specifier, then that's the "preferred" one.
        // However, there are a few cases where additional version specifiers can be safely ignored.
        let ignoreVersion: boolean = false;

        // 1. If the version specifier was listed in "allowedAlternativeVersions", then it's never a candidate.
        //    (Even if it's the only version specifier anywhere in the repo, we still ignore it, because
        //    otherwise the rule would be difficult to explain.)
        if (alternativesForThisDependency.indexOf(dependencyVersion) > 0) {
          ignoreVersion = true;
        } else {
          // Is it a local project?
          const localProject: RushConfigurationProject | undefined =
            this._rushConfiguration.getProjectByName(dependencyName);
          if (localProject) {
            // 2. If it's a symlinked local project, then it's not a candidate, because the package manager will
            //    never even see it.
            // However there are two ways that a local project can NOT be symlinked:
            // - if the local project doesn't satisfy the referenced semver specifier; OR
            // - if the local project was specified in "cyclicDependencyProjects" in rush.json
            if (
              !project.cyclicDependencyProjects.has(dependencyName) &&
              semver.satisfies(localProject.packageJsonEditor.version, dependencyVersion)
            ) {
              ignoreVersion = true;
            }
          }

          if (!ignoreVersion) {
            let versionForDependency: Set<string> | undefined = allVersionsByPackageName.get(dependencyName);
            if (!versionForDependency) {
              versionForDependency = new Set<string>();
              allVersionsByPackageName.set(dependencyName, versionForDependency);
            }
            versionForDependency.add(dependencyVersion);
          }
        }
      }
    }

    return allVersionsByPackageName;
  }

  /**
   * Generates the {@link IDependencyAnalysis.implicitlyPreferredVersionByPackageName} map,
   * given the {@link IDependencyAnalysis.allVersionsByPackageName} map.
   *
   * @remarks
   * The result of this function is not cached.
   */
  private _getImplicitlyPreferredVersionByPackageName(
    commonVersionsConfiguration: CommonVersionsConfiguration,
    allVersionsByPackageName: Map<string, Set<string>>
  ): Map<string, string> {
    // Only generate implicitly preferred versions for variants that request it
    const useImplicitlyPreferredVersions: boolean =
      commonVersionsConfiguration.implicitlyPreferredVersions !== undefined
        ? commonVersionsConfiguration.implicitlyPreferredVersions
        : true;

    if (useImplicitlyPreferredVersions) {
      // If any dependency has more than one version, then filter it out (since we don't know which version
      // should be preferred).  What remains will be the list of preferred dependencies.
      // dependency --> version specifier
      const implicitlyPreferred: Map<string, string> = new Map<string, string>();
      for (const [dep, versions] of allVersionsByPackageName) {
        if (versions.size === 1) {
          const version: string = Array.from(versions)[0];
          implicitlyPreferred.set(dep, version);
        }
      }

      return implicitlyPreferred;
    } else {
      return new Map();
    }
  }
}
