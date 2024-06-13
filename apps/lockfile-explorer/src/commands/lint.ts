// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Lockfile, LockfileV6 } from '@pnpm/lockfile-types';
import path from 'path';
import yaml from 'js-yaml';
import { type RushConfigurationProject, type Subspace, RushConfiguration } from '@rushstack/rush-sdk';
import { Async, FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';
import type { CommandModule } from 'yargs';
import { Colorize } from '@rushstack/terminal';
import semver from 'semver';

import lockfileLintSchema from '../schemas/lockfile-lint.schema.json';
import {
  getShrinkwrapFileMajorVersion,
  parseDependencyPath,
  splicePackageWithVersion
} from '../utils/shrinkwrap';
import { LOCKFILE_EXPLORER_FOLDERNAME, LOCKFILE_LINT_JSON_FILENAME } from '../constants/common';
import { terminal } from '../utils/logger';

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
      throw new Error(`ERROR: Detected inconsistent version numbers in package '${name}': '${version}'!`);
    }

    for (const [dependencyPackageName, dependencyPackageVersion] of Object.entries(
      packages[dependencyPath].dependencies ?? {}
    )) {
      await checkVersionCompatibility(
        shrinkwrapFileMajorVersion,
        packages,
        splicePackageWithVersion(shrinkwrapFileMajorVersion, dependencyPackageName, dependencyPackageVersion),
        requiredVersions,
        checkedDependencyPaths
      );
    }
  }
}

async function searchAndValidateDependenciesAsync(
  rushConfiguration: RushConfiguration,
  checkedProjects: Set<RushConfigurationProject>,
  project: RushConfigurationProject,
  requiredVersions: Record<string, string>
): Promise<void> {
  terminal.writeLine(`Checking the project: ${project.packageName}.`);

  const projectFolder: string = project.projectFolder;
  const subspace: Subspace = project.subspace;
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
            await searchAndValidateDependenciesAsync(
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

async function performVersionRestrictionCheckAsync(
  rushConfiguration: RushConfiguration,
  requiredVersions: Record<string, string>,
  projectName: string
): Promise<void> {
  const project: RushConfigurationProject | undefined = rushConfiguration?.getProjectByName(projectName);
  if (!project) {
    throw new Error(`Specified project "${projectName}" does not exist in ${LOCKFILE_LINT_JSON_FILENAME}`);
  }
  const checkedProjects: Set<RushConfigurationProject> = new Set<RushConfigurationProject>([project]);
  await searchAndValidateDependenciesAsync(rushConfiguration, checkedProjects, project, requiredVersions);
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
        rushConfiguration.commonFolder,
        'config',
        LOCKFILE_EXPLORER_FOLDERNAME,
        LOCKFILE_LINT_JSON_FILENAME
      );
      const { rules }: ILockfileLint = await JsonFile.loadAndValidateAsync(
        lintingFile,
        JsonSchema.fromLoadedObject(lockfileLintSchema)
      );
      await Async.forEachAsync(
        rules,
        async ({ requiredVersions, project, rule }) => {
          switch (rule) {
            case 'restrict-versions': {
              await performVersionRestrictionCheckAsync(rushConfiguration, requiredVersions, project);
              break;
            }

            default: {
              throw new Error('Unsupported rule name: ' + rule);
            }
          }
        },
        { concurrency: 50 }
      );
      terminal.writeLine(Colorize.green('Check passed!'));
    } catch (error) {
      terminal.writeError(Colorize.red('ERROR: ' + error.message));
      process.exit(1);
    }
  }
};
