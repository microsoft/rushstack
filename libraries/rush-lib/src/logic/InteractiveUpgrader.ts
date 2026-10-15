// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { NpmCheck, type INpmCheckState, type INpmCheckPackageSummary } from '@rushstack/npm-check-fork';
import type { IPackageJson } from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import type { RushConfiguration } from '../api/RushConfiguration';
import { upgradeInteractive, type IDepsToUpgradeAnswers } from '../utilities/InteractiveUpgradeUI';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import { getEffectivePnpmCatalogs, type PnpmCatalogs } from './pnpm/EffectivePnpmOptions';
import { tryResolvePnpmCatalogReference, type IPnpmCatalogReference } from './pnpm/PnpmCatalogReference';

type NpmCheckPackageJson = NonNullable<INpmCheckState['cwdPackageJson']>;

interface IUpgradeInteractiveDeps {
  projects: RushConfigurationProject[];
  depsToUpgrade: IDepsToUpgradeAnswers;
}

export class InteractiveUpgrader {
  readonly #rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this.#rushConfiguration = rushConfiguration;
  }

  public async upgradeAsync(): Promise<IUpgradeInteractiveDeps> {
    const rushProject: RushConfigurationProject = await this.#getUserSelectedProjectForUpgradeAsync();

    const dependenciesState: INpmCheckPackageSummary[] =
      await this.#getPackageDependenciesStatusAsync(rushProject);

    const depsToUpgrade: IDepsToUpgradeAnswers =
      await this.#getUserSelectedDependenciesToUpgradeAsync(dependenciesState);
    return { projects: [rushProject], depsToUpgrade };
  }

  async #getUserSelectedDependenciesToUpgradeAsync(
    packages: INpmCheckPackageSummary[]
  ): Promise<IDepsToUpgradeAnswers> {
    return upgradeInteractive(packages);
  }

  async #getUserSelectedProjectForUpgradeAsync(): Promise<RushConfigurationProject> {
    const projects: RushConfigurationProject[] | undefined = this.#rushConfiguration.projects;

    const { default: search } = await import('@inquirer/search');

    return await search<RushConfigurationProject>({
      message: 'Select a project you would like to upgrade',
      source: (term) => {
        const choices: { name: string; short: string; value: RushConfigurationProject }[] = projects.map(
          (project) => ({
            name: Colorize.green(project.packageName),
            short: project.packageName,
            value: project
          })
        );
        if (!term) {
          return choices;
        }
        const filter: string = term.toUpperCase();
        return choices.filter((choice) => choice.short.toUpperCase().includes(filter));
      },
      pageSize: 12
    });
  }

  async #getPackageDependenciesStatusAsync(
    rushProject: RushConfigurationProject
  ): Promise<INpmCheckPackageSummary[]> {
    const { projectFolder } = rushProject;

    const currentState: INpmCheckState = await NpmCheck({
      cwd: projectFolder,
      cwdPackageJson: this.#tryGetPackageJsonWithResolvedCatalogReferences(rushProject)
    });

    return currentState.packages ?? [];
  }

  /**
   * NpmCheck ignores dependencies whose version specifier is not a SemVer range, such as PNPM catalog
   * references (`catalog:`). If the project has catalog references, returns a copy of its package.json
   * with each reference replaced by the version from the catalog, so that those dependencies can be upgraded.
   * The upgrade updates the catalog entry instead of the reference (see PackageJsonUpdater.doRushUpgradeAsync).
   */
  #tryGetPackageJsonWithResolvedCatalogReferences(
    rushProject: RushConfigurationProject
  ): NpmCheckPackageJson | undefined {
    const catalogs: PnpmCatalogs | undefined = getEffectivePnpmCatalogs(
      rushProject.subspace,
      this.#rushConfiguration
    );
    if (!catalogs) {
      return undefined;
    }

    let hasResolvedReferences: boolean = false;
    const resolveCatalogReferences: (
      dependencies: Record<string, string> | undefined
    ) => Record<string, string> = (dependencies: Record<string, string> | undefined) => {
      const result: Record<string, string> = {};
      for (const [packageName, versionSpecifier] of Object.entries(dependencies ?? {})) {
        const catalogReference: IPnpmCatalogReference | undefined = tryResolvePnpmCatalogReference(
          packageName,
          versionSpecifier,
          catalogs
        );
        if (catalogReference?.resolvedVersion !== undefined) {
          result[packageName] = catalogReference.resolvedVersion;
          hasResolvedReferences = true;
        } else {
          result[packageName] = versionSpecifier;
        }
      }

      return result;
    };

    const packageJson: IPackageJson = rushProject.packageJson;
    const packageJsonWithResolvedReferences: NpmCheckPackageJson = {
      ...packageJson,
      dependencies: resolveCatalogReferences(packageJson.dependencies),
      devDependencies: resolveCatalogReferences(packageJson.devDependencies)
    };

    return hasResolvedReferences ? packageJsonWithResolvedReferences : undefined;
  }
}
