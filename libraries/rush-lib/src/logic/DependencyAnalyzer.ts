// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';
import type { CommonVersionsConfiguration } from '../api/CommonVersionsConfiguration';
import { DependencyType, type PackageJsonDependency } from '../api/PackageJsonEditor';
import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { Subspace } from '../api/Subspace';

export interface IDependencyAnalysis {
  /**
   * The common versions configuration from the repo's rush configuration.
   */
  commonVersionsConfiguration: CommonVersionsConfiguration;

  /**
   * A map of all direct dependencies that only have a single semantic version specifier,
   * unless the {@link CommonVersionsConfiguration.implicitlyPreferredVersions} option
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
    | WeakMap<RushConfiguration, DependencyAnalyzer>
    | undefined;

  private _rushConfiguration: RushConfiguration;
  private _analysisByVariantBySubspace: Map<string, WeakMap<Subspace, IDependencyAnalysis>> | undefined;

  private constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public static forRushConfiguration(rushConfiguration: RushConfiguration): DependencyAnalyzer {
    if (!DependencyAnalyzer._dependencyAnalyzerByRushConfiguration) {
      DependencyAnalyzer._dependencyAnalyzerByRushConfiguration = new WeakMap();
    }

    let analyzer: DependencyAnalyzer | undefined =
      DependencyAnalyzer._dependencyAnalyzerByRushConfiguration.get(rushConfiguration);
    if (!analyzer) {
      analyzer = new DependencyAnalyzer(rushConfiguration);
      DependencyAnalyzer._dependencyAnalyzerByRushConfiguration.set(rushConfiguration, analyzer);
    }

    return analyzer;
  }

  public getAnalysis(
    subspace: Subspace | undefined,
    variant: string | undefined,
    addAction: boolean
  ): IDependencyAnalysis {
    // Use an empty string as the key when no variant provided. Anything else would possibly conflict
    // with a variant created by the user
    const variantKey: string = variant || '';

    if (!this._analysisByVariantBySubspace) {
      this._analysisByVariantBySubspace = new Map();
    }

    const subspaceToAnalyze: Subspace = subspace || this._rushConfiguration.defaultSubspace;
    let analysisForVariant: WeakMap<Subspace, IDependencyAnalysis> | undefined =
      this._analysisByVariantBySubspace.get(variantKey);

    if (!analysisForVariant) {
      analysisForVariant = new WeakMap();
      this._analysisByVariantBySubspace.set(variantKey, analysisForVariant);
    }

    let analysisForSubspace: IDependencyAnalysis | undefined = analysisForVariant.get(subspaceToAnalyze);
    if (!analysisForSubspace) {
      analysisForSubspace = this._getAnalysisInternal(subspaceToAnalyze, variant, addAction);

      analysisForVariant.set(subspaceToAnalyze, analysisForSubspace);
    }

    return analysisForSubspace;
  }

  /**
   * Generates the {@link IDependencyAnalysis}.
   *
   * @remarks
   * The result of this function is not cached.
   */
  private _getAnalysisInternal(
    subspace: Subspace,
    variant: string | undefined,
    addAction: boolean
  ): IDependencyAnalysis {
    const commonVersionsConfiguration: CommonVersionsConfiguration = subspace.getCommonVersions(variant);
    const allVersionsByPackageName: Map<string, Set<string>> = new Map();
    const allowedAlternativeVersions: Map<
      string,
      ReadonlyArray<string>
    > = commonVersionsConfiguration.allowedAlternativeVersions;

    let projectsToProcess: RushConfigurationProject[] = this._rushConfiguration.projects;
    if (addAction && this._rushConfiguration.subspacesFeatureEnabled) {
      projectsToProcess = subspace.getProjects();
    }

    for (const project of projectsToProcess) {
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

        if (dependencyVersion.startsWith('workspace:')) {
          // If this is a workspace protocol dependency, ignore it.
          continue;
        }

        // Is it a local project?
        const localProject: RushConfigurationProject | undefined =
          this._rushConfiguration.getProjectByName(dependencyName);
        if (localProject) {
          if (
            !project.decoupledLocalDependencies.has(dependencyName) &&
            semver.satisfies(localProject.packageJson.version, dependencyVersion)
          ) {
            // For now, ignore local dependencies (that aren't cyclic dependencies).
            continue;
          }
        }

        let allVersionForDependency: Set<string> | undefined = allVersionsByPackageName.get(dependencyName);
        if (!allVersionForDependency) {
          allVersionForDependency = new Set<string>();
          allVersionsByPackageName.set(dependencyName, allVersionForDependency);
        }

        allVersionForDependency.add(dependencyVersion);
      }
    }

    const implicitlyPreferredVersionByPackageName: Map<string, string> = new Map();
    // Only generate implicitly preferred versions when requested
    const useImplicitlyPreferredVersions: boolean =
      commonVersionsConfiguration.implicitlyPreferredVersions ?? true;
    if (useImplicitlyPreferredVersions) {
      for (const [dependencyName, versions] of allVersionsByPackageName) {
        // For each dependency, we're collecting the set of all version specifiers that appear across the repo.
        // If there is only one version specifier, then that's the "preferred" one.

        const alternativesForThisDependency: ReadonlySet<string> = new Set(
          allowedAlternativeVersions.get(dependencyName)
        );

        let implicitlyPreferredVersion: string | undefined = undefined;
        for (const version of versions) {
          // Versions listed in the common-versions.json's "allowedAlternativeVersions" property
          // can be safely ignored in determining the set of implicitly preferred versions.
          // (Even if it's the only version specifier anywhere in the repo, we still ignore it, because
          // otherwise the rule would be difficult to explain.)
          if (!alternativesForThisDependency.has(version)) {
            if (implicitlyPreferredVersion === undefined) {
              // There isn't a candidate for an implicitly preferred version yet. Set this value as a candidate.
              implicitlyPreferredVersion = version;
            } else {
              // There was already another version that was a candidate. Clear that out and break.
              // This dependency does not have an implicitly preferred version because there are at least
              // two candidates.
              implicitlyPreferredVersion = undefined;
              break;
            }
          }
        }

        if (implicitlyPreferredVersion !== undefined) {
          implicitlyPreferredVersionByPackageName.set(dependencyName, implicitlyPreferredVersion);
        }
      }
    }

    return {
      commonVersionsConfiguration,
      implicitlyPreferredVersionByPackageName,
      allVersionsByPackageName
    };
  }
}
