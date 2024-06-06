// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Lockfile, LockfileV6 } from '@pnpm/lockfile-types';
import path from 'path';
import yaml from 'js-yaml';
import { RushConfiguration } from '@microsoft/rush-lib/lib/api/RushConfiguration';
import type { Subspace } from '@microsoft/rush-lib/lib/api/Subspace';
import type { RushConfigurationProject } from '@microsoft/rush-lib/lib/api/RushConfigurationProject';
import { FileSystem } from '@rushstack/node-core-library';
import type { CommandModule } from 'yargs';
import { Colorize } from '@rushstack/terminal';
import semver from 'semver';

import { getShrinkwrapFileMajorVersion, parseDependencyPath } from '../utils/shrinkwrap';

export interface ICheckCommandOptions {
  packageSpecifier: string;
  project?: string;
}

async function checkVersionCompatibility(
  shrinkwrapFileMajorVersion: number,
  packages: Lockfile['packages'],
  dependencyPath: string,
  packageName: string,
  versionRange: { current: string | undefined },
  checkedDependencyPaths: Set<string>
): Promise<void> {
  if (packages && packages[dependencyPath] && !checkedDependencyPaths.has(dependencyPath)) {
    checkedDependencyPaths.add(dependencyPath);
    const { name, version } = parseDependencyPath(shrinkwrapFileMajorVersion, dependencyPath);
    if (!versionRange.current) {
      // If the user does not specify a version, by default only the consistency of the package versions is checked.
      versionRange.current = version;
    } else {
      if (name === packageName && !semver.satisfies(version, versionRange.current)) {
        throw new Error(`Detected inconsistent version numbers: ${version}!`);
      }
    }

    for (const [dependencyPackageName, dependencyPackageVersion] of Object.entries(
      packages[dependencyPath].dependencies ?? {}
    )) {
      await checkVersionCompatibility(
        shrinkwrapFileMajorVersion,
        packages,
        `/${dependencyPackageName}${shrinkwrapFileMajorVersion === 6 ? '@' : '/'}${dependencyPackageVersion}`,
        packageName,
        versionRange,
        checkedDependencyPaths
      );
    }
  }
}

async function searchAndValidateDependencies(
  rushConfiguration: RushConfiguration,
  checkedProjects: Set<RushConfigurationProject>,
  project: RushConfigurationProject,
  packageName: string,
  versionRange: { current: string | undefined }
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
                packageName,
                versionRange
              );
            }
          } else {
            await checkVersionCompatibility(
              shrinkwrapFileMajorVersion,
              packages,
              fullDependencyPath,
              packageName,
              versionRange,
              checkedDependencyPaths
            );
          }
        }
      }
    }
  }
}

async function performDependencyCheck(
  packageName: string,
  versionRange: { current: string | undefined },
  projectName: string | undefined
): Promise<void> {
  const rushConfiguration: RushConfiguration | undefined = RushConfiguration.tryLoadFromDefaultLocation();
  const project: RushConfigurationProject | undefined = projectName
    ? rushConfiguration?.getProjectByName(projectName)
    : rushConfiguration?.tryGetProjectForPath(process.cwd());
  if (!rushConfiguration || !project) {
    throw new Error(
      'The "lockfile-explorer check" must be executed in a folder that is under a Rush workspace folder'
    );
  }
  const checkedProjects: Set<RushConfigurationProject> = new Set<RushConfigurationProject>([project]);
  await searchAndValidateDependencies(rushConfiguration, checkedProjects, project, packageName, versionRange);
  console.log(Colorize.green('Check passed!'));
}

// Example usage: lockfile-explorer check react
// Example usage: lockfile-explorer check --project xxx react
// Example usage: lockfile-explorer check --project xxx react@18
// Example usage: lockfile-explorer check --project xxx react@18.2
// Example usage: lockfile-explorer check --project xxx react@18.2.0
export const lintCommand: CommandModule<{}, ICheckCommandOptions> = {
  command: '$0',
  describe: 'Check if the specified package has a inconsistent package versions in target project',
  builder: (yargs) => {
    return yargs
      .positional('packageSpecifier', {
        describe: 'The name of the package and version to check',
        type: 'string',
        demandOption: true
      })
      .option('project', {
        describe: 'The name of the project that should be checked',
        type: 'string'
      });
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  handler: async (argv) => {
    try {
      const [packageName, specifier] = argv.packageSpecifier.split('@');
      await performDependencyCheck(packageName, { current: specifier }, argv.project);
    } catch (error) {
      console.error(Colorize.red('ERROR: ' + error.message));
      process.exit(1);
    }
  }
};
