// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Lockfile, LockfileV6 } from '@pnpm/lockfile-types';
import path from 'path';
import yaml from 'js-yaml';
import { RushConfiguration } from '@microsoft/rush-lib/lib/api/RushConfiguration';
import type { Subspace } from '@microsoft/rush-lib/lib/api/Subspace';
import type { RushConfigurationProject } from '@microsoft/rush-lib/lib/api/RushConfigurationProject';
import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import type { CommandModule } from 'yargs';
import { Colorize } from '@rushstack/terminal';
import semver from 'semver';

import { getShrinkwrapFileMajorVersion, parseDependencyPath } from '../utils/shrinkwrap';
import { LockfileExplorerConfig } from '../constants/common';

export interface ILintRule {
  rule: 'restrict-versions';
  project: string;
  requiredVersions: Record<string, string>;
}

export interface ILockfileLint {
  rules: ILintRule[];
}

async function checkVersionCompatibility(
  shrinkwrapFileMajorVersion: number,
  packages: Lockfile['packages'],
  dependencyPath: string,
  requiredVersions: Record<string, string>,
  checkedDependencyPaths: Set<string>
): Promise<void> {
  if (packages && packages[dependencyPath] && !checkedDependencyPaths.has(dependencyPath)) {
    checkedDependencyPaths.add(dependencyPath);
    const { name, version } = parseDependencyPath(shrinkwrapFileMajorVersion, dependencyPath);
    if (name in requiredVersions && !semver.satisfies(version, requiredVersions[name])) {
      throw new Error(`Detected inconsistent version numbers: ${version}!`);
    }

    for (const [dependencyPackageName, dependencyPackageVersion] of Object.entries(
      packages[dependencyPath].dependencies ?? {}
    )) {
      await checkVersionCompatibility(
        shrinkwrapFileMajorVersion,
        packages,
        `/${dependencyPackageName}${shrinkwrapFileMajorVersion === 6 ? '@' : '/'}${dependencyPackageVersion}`,
        requiredVersions,
        checkedDependencyPaths
      );
    }
  }
}

async function searchAndValidateDependencies(
  rushConfiguration: RushConfiguration,
  checkedProjects: Set<RushConfigurationProject>,
  project: RushConfigurationProject,
  requiredVersions: Record<string, string>
): Promise<void> {
  console.log(`Checking the project: ${project.packageName}.`);

  const projectFolder: string | undefined = project.projectFolder;
  const subspace: Subspace | undefined = project.subspace;
  if (subspace && projectFolder) {
    const shrinkwrapFilename: string = subspace.getCommittedShrinkwrapFilename();
    const pnpmLockfileText: string = await FileSystem.readFileAsync(shrinkwrapFilename);
    const doc = yaml.load(pnpmLockfileText) as Lockfile | LockfileV6;
    const { importers, lockfileVersion, packages } = doc;
    const shrinkwrapFileMajorVersion: number = getShrinkwrapFileMajorVersion(lockfileVersion);
    const checkedDependencyPaths: Set<string> = new Set<string>();
    for (const [relativePath, { dependencies }] of Object.entries(importers)) {
      if (path.resolve(projectFolder, relativePath) === projectFolder) {
        const dependenciesEntries = Object.entries(dependencies ?? {});
        for (const [dependencyName, dependencyValue] of dependenciesEntries) {
          const fullDependencyPath = `/${dependencyName}${shrinkwrapFileMajorVersion === 6 ? '@' : '/'}${
            typeof dependencyValue === 'string'
              ? dependencyValue
              : (
                  dependencyValue as {
                    version: string;
                    specifier: string;
                  }
                ).version
          }`;
          if (fullDependencyPath.includes('link:')) {
            const dependencyProject: RushConfigurationProject | undefined =
              rushConfiguration.getProjectByName(dependencyName);
            if (dependencyProject && !checkedProjects.has(dependencyProject)) {
              checkedProjects.add(project);
              await searchAndValidateDependencies(
                rushConfiguration,
                checkedProjects,
                dependencyProject,
                requiredVersions
              );
            }
          } else {
            await checkVersionCompatibility(
              shrinkwrapFileMajorVersion,
              packages,
              fullDependencyPath,
              requiredVersions,
              checkedDependencyPaths
            );
          }
        }
      }
    }
  }
}

async function performVersionRestriction(
  rushConfiguration: RushConfiguration,
  requiredVersions: Record<string, string>,
  projectName: string
): Promise<void> {
  const project: RushConfigurationProject | undefined = rushConfiguration?.getProjectByName(projectName);
  if (!project) {
    throw new Error(`Cannot found project name: ${projectName}`);
  }
  const checkedProjects: Set<RushConfigurationProject> = new Set<RushConfigurationProject>([project]);
  await searchAndValidateDependencies(rushConfiguration, checkedProjects, project, requiredVersions);
}

// Example usage: lflint
// Example usage: lockfile-lint
export const lintCommand: CommandModule = {
  command: '$0',
  describe: 'Check if the specified package has a inconsistent package versions in target project',
  // eslint-disable-next-line @typescript-eslint/naming-convention
  handler: async () => {
    try {
      const rushConfiguration: RushConfiguration | undefined = RushConfiguration.tryLoadFromDefaultLocation();
      if (!rushConfiguration) {
        throw new Error(
          'The "lockfile-explorer check" must be executed in a folder that is under a Rush workspace folder'
        );
      }
      const lintingFile: string = path.resolve(
        rushConfiguration.commonLockfileExplorerConfigFolder,
        LockfileExplorerConfig.FileName
      );
      const { rules }: ILockfileLint = JsonFile.load(lintingFile);
      for (const { requiredVersions, project, rule } of rules) {
        switch (rule) {
          case 'restrict-versions': {
            await performVersionRestriction(rushConfiguration, requiredVersions, project);
            break;
          }
          default: {
            throw new Error('Unsupported rule name: ' + rule);
          }
        }
      }
      console.log(Colorize.green('Check passed!'));
    } catch (error) {
      console.error(Colorize.red('ERROR: ' + error.message));
      process.exit(1);
    }
  }
};
