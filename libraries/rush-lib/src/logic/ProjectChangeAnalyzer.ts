// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import ignore, { type Ignore } from 'ignore';

import type { IReadonlyLookupByPath, LookupByPath } from '@rushstack/lookup-by-path';
import { Path, FileSystem, Async, AlreadyReportedError } from '@rushstack/node-core-library';
import {
  getRepoChanges,
  getRepoRoot,
  getDetailedRepoStateAsync,
  hashFilesAsync,
  type IFileDiffStatus
} from '@rushstack/package-deps-hash';
import type { ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../api/RushConfiguration';
import type { Subspace } from '../api/Subspace';
import { RushProjectConfiguration } from '../api/RushProjectConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import { BaseProjectShrinkwrapFile } from './base/BaseProjectShrinkwrapFile';
import { PnpmShrinkwrapFile } from './pnpm/PnpmShrinkwrapFile';
import { Git } from './Git';
import {
  type IInputsSnapshotProjectMetadata,
  type IInputsSnapshot,
  InputsSnapshot,
  type GetInputsSnapshotAsyncFn
} from './incremental/InputsSnapshot';

/**
 * @beta
 */
export interface IGetChangedProjectsOptions {
  targetBranchName: string;
  terminal: ITerminal;
  shouldFetch?: boolean;
  variant?: string;

  /**
   * If set to `true`, consider a project's external dependency installation layout as defined in the
   * package manager lockfile when determining if it has changed.
   */
  includeExternalDependencies: boolean;

  /**
   * If set to `true` apply the `incrementalBuildIgnoredGlobs` property in a project's `rush-project.json`
   * and exclude matched files from change detection.
   */
  enableFiltering: boolean;
}

/**
 * @internal
 */
export interface IRawRepoState {
  projectState: Map<RushConfigurationProject, Map<string, string>> | undefined;
  rootDir: string;
  rawHashes: Map<string, string>;
}

/**
 * @beta
 */
export class ProjectChangeAnalyzer {
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _git: Git;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._git = new Git(this._rushConfiguration);
  }

  /**
   * Gets a list of projects that have changed in the current state of the repo
   * when compared to the specified branch, optionally taking the shrinkwrap and settings in
   * the rush-project.json file into consideration.
   */
  public async getChangedProjectsAsync(
    options: IGetChangedProjectsOptions
  ): Promise<Set<RushConfigurationProject>> {
    const { _rushConfiguration: rushConfiguration } = this;

    const { targetBranchName, terminal, includeExternalDependencies, enableFiltering, shouldFetch, variant } =
      options;

    const gitPath: string = this._git.getGitPathOrThrow();
    const repoRoot: string = getRepoRoot(rushConfiguration.rushJsonFolder);

    // if the given targetBranchName is a commit, we assume it is the merge base
    const isTargetBranchACommit: boolean = await this._git.determineIfRefIsACommitAsync(targetBranchName);
    const mergeCommit: string = isTargetBranchACommit
      ? targetBranchName
      : await this._git.getMergeBaseAsync(targetBranchName, terminal, shouldFetch);

    const changedFiles: Map<string, IFileDiffStatus> = getRepoChanges(repoRoot, mergeCommit, gitPath);
    const lookup: LookupByPath<RushConfigurationProject> =
      rushConfiguration.getProjectLookupForRoot(repoRoot);
    const changesByProject: Map<
      RushConfigurationProject,
      Map<string, IFileDiffStatus>
    > = this.getChangesByProject(lookup, changedFiles);

    const changedProjects: Set<RushConfigurationProject> = new Set();
    if (enableFiltering) {
      // Reading rush-project.json may be problematic if, e.g. rush install has not yet occurred and rigs are in use
      await Async.forEachAsync(
        changesByProject,
        async ([project, projectChanges]) => {
          const filteredChanges: Map<string, IFileDiffStatus> = await this._filterProjectDataAsync(
            project,
            projectChanges,
            repoRoot,
            terminal
          );

          if (filteredChanges.size > 0) {
            changedProjects.add(project);
          }
        },
        { concurrency: 10 }
      );
    } else {
      for (const [project, projectChanges] of changesByProject) {
        if (projectChanges.size > 0) {
          changedProjects.add(project);
        }
      }
    }

    // External dependency changes are not allowed to be filtered, so add these after filtering
    if (includeExternalDependencies) {
      // Even though changing the installed version of a nested dependency merits a change file,
      // ignore lockfile changes for `rush change` for the moment

      const subspaces: Iterable<Subspace> = rushConfiguration.subspacesFeatureEnabled
        ? rushConfiguration.subspaces
        : [rushConfiguration.defaultSubspace];

      const variantToUse: string | undefined =
        variant ?? (await this._rushConfiguration.getCurrentlyInstalledVariantAsync());

      await Async.forEachAsync(subspaces, async (subspace: Subspace) => {
        const fullShrinkwrapPath: string = subspace.getCommittedShrinkwrapFilePath(variantToUse);

        const relativeShrinkwrapFilePath: string = Path.convertToSlashes(
          path.relative(repoRoot, fullShrinkwrapPath)
        );
        const shrinkwrapStatus: IFileDiffStatus | undefined = changedFiles.get(relativeShrinkwrapFilePath);
        const subspaceProjects: RushConfigurationProject[] = subspace.getProjects();

        if (shrinkwrapStatus) {
          if (shrinkwrapStatus.status !== 'M') {
            if (rushConfiguration.subspacesFeatureEnabled) {
              terminal.writeLine(
                `"${subspace.subspaceName}" subspace lockfile was created or deleted. Assuming all projects are affected.`
              );
            } else {
              terminal.writeLine(`Lockfile was created or deleted. Assuming all projects are affected.`);
            }
            for (const project of subspaceProjects) {
              changedProjects.add(project);
            }
            return;
          }

          if (rushConfiguration.isPnpm) {
            const currentShrinkwrap: PnpmShrinkwrapFile | undefined =
              PnpmShrinkwrapFile.loadFromFile(fullShrinkwrapPath);

            if (!currentShrinkwrap) {
              throw new Error(`Unable to obtain current shrinkwrap file.`);
            }

            const oldShrinkwrapText: string = await this._git.getBlobContentAsync({
              // <ref>:<path> syntax: https://git-scm.com/docs/gitrevisions
              blobSpec: `${mergeCommit}:${relativeShrinkwrapFilePath}`,
              repositoryRoot: repoRoot
            });
            const oldShrinkWrap: PnpmShrinkwrapFile = PnpmShrinkwrapFile.loadFromString(oldShrinkwrapText);

            for (const project of subspaceProjects) {
              if (
                currentShrinkwrap
                  .getProjectShrinkwrap(project)
                  .hasChanges(oldShrinkWrap.getProjectShrinkwrap(project))
              ) {
                changedProjects.add(project);
              }
            }
          } else {
            if (rushConfiguration.subspacesFeatureEnabled) {
              terminal.writeLine(
                `"${subspace.subspaceName}" subspace lockfile has changed and lockfile content comparison is only supported for pnpm. Assuming all projects are affected.`
              );
            } else {
              terminal.writeLine(
                `Lockfile has changed and lockfile content comparison is only supported for pnpm. Assuming all projects are affected.`
              );
            }
            subspace.getProjects().forEach((project) => changedProjects.add(project));
            return;
          }
        }
      });
    }

    return changedProjects;
  }

  protected getChangesByProject(
    lookup: LookupByPath<RushConfigurationProject>,
    changedFiles: Map<string, IFileDiffStatus>
  ): Map<RushConfigurationProject, Map<string, IFileDiffStatus>> {
    return lookup.groupByChild(changedFiles);
  }

  /**
   * Gets a snapshot of the input state of the Rush workspace that can be queried for incremental
   * build operations and use by the build cache.
   * @internal
   */
  public async _tryGetSnapshotProviderAsync(
    projectConfigurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration>,
    terminal: ITerminal,
    projectSelection?: ReadonlySet<RushConfigurationProject>
  ): Promise<GetInputsSnapshotAsyncFn | undefined> {
    try {
      const gitPath: string = this._git.getGitPathOrThrow();

      if (!this._git.isPathUnderGitWorkingTree()) {
        terminal.writeLine(
          `The Rush monorepo is not in a Git repository. Rush will proceed without incremental build support.`
        );

        return;
      }

      const rushConfiguration: RushConfiguration = this._rushConfiguration;

      // Do not use getGitInfo().root; it is the root of the *primary* worktree, not the *current* one.
      const rootDirectory: string = getRepoRoot(rushConfiguration.rushJsonFolder, gitPath);

      // Load the rush-project.json files for the whole repository
      const additionalGlobs: IAdditionalGlob[] = [];

      const projectMap: Map<RushConfigurationProject, IInputsSnapshotProjectMetadata> = new Map();

      for (const project of rushConfiguration.projects) {
        const projectConfig: RushProjectConfiguration | undefined = projectConfigurations.get(project);

        const additionalFilesByOperationName: Map<string, Set<string>> = new Map();
        const projectMetadata: IInputsSnapshotProjectMetadata = {
          projectConfig,
          additionalFilesByOperationName
        };
        projectMap.set(project, projectMetadata);

        if (projectConfig) {
          const { operationSettingsByOperationName } = projectConfig;
          for (const [operationName, { dependsOnAdditionalFiles }] of operationSettingsByOperationName) {
            if (dependsOnAdditionalFiles) {
              const additionalFilesForOperation: Set<string> = new Set();
              additionalFilesByOperationName.set(operationName, additionalFilesForOperation);
              for (const pattern of dependsOnAdditionalFiles) {
                additionalGlobs.push({
                  project,
                  operationName,
                  additionalFilesForOperation,
                  pattern
                });
              }
            }
          }
        }
      }

      // Include project shrinkwrap files as part of the computation
      const additionalRelativePathsToHash: string[] = [];
      const globalAdditionalFiles: string[] = [];
      if (rushConfiguration.isPnpm) {
        await Async.forEachAsync(rushConfiguration.projects, async (project: RushConfigurationProject) => {
          const projectShrinkwrapFilePath: string = BaseProjectShrinkwrapFile.getFilePathForProject(project);
          if (!(await FileSystem.existsAsync(projectShrinkwrapFilePath))) {
            if (rushConfiguration.subspacesFeatureEnabled) {
              return;
            }

            throw new Error(
              `A project dependency file (${projectShrinkwrapFilePath}) is missing. You may need to run ` +
                '"rush install" or "rush update".'
            );
          }

          const relativeProjectShrinkwrapFilePath: string = Path.convertToSlashes(
            path.relative(rootDirectory, projectShrinkwrapFilePath)
          );
          additionalRelativePathsToHash.push(relativeProjectShrinkwrapFilePath);
        });
      } else {
        // Add the shrinkwrap file to every project's dependencies
        const currentVariant: string | undefined =
          await this._rushConfiguration.getCurrentlyInstalledVariantAsync();

        const shrinkwrapFile: string = Path.convertToSlashes(
          path.relative(
            rootDirectory,
            rushConfiguration.defaultSubspace.getCommittedShrinkwrapFilePath(currentVariant)
          )
        );

        globalAdditionalFiles.push(shrinkwrapFile);
      }

      const lookupByPath: IReadonlyLookupByPath<RushConfigurationProject> =
        this._rushConfiguration.getProjectLookupForRoot(rootDirectory);

      let filterPath: string[] = [];

      if (
        projectSelection &&
        projectSelection.size > 0 &&
        this._rushConfiguration.experimentsConfiguration.configuration.enableSubpathScan
      ) {
        filterPath = Array.from(projectSelection, ({ projectFolder }) => projectFolder);
      }

      return async function tryGetSnapshotAsync(): Promise<IInputsSnapshot | undefined> {
        try {
          const [{ files: hashes, hasUncommittedChanges }, additionalFiles] = await Promise.all([
            getDetailedRepoStateAsync(rootDirectory, additionalRelativePathsToHash, gitPath, filterPath),
            getAdditionalFilesFromRushProjectConfigurationAsync(
              additionalGlobs,
              lookupByPath,
              rootDirectory,
              terminal
            )
          ]);

          for (const file of additionalFiles) {
            if (hashes.has(file)) {
              additionalFiles.delete(file);
            }
          }

          const additionalHashes: Map<string, string> = new Map(
            await hashFilesAsync(rootDirectory, additionalFiles, gitPath)
          );

          return new InputsSnapshot({
            additionalHashes,
            globalAdditionalFiles,
            hashes,
            hasUncommittedChanges,
            lookupByPath,
            projectMap,
            rootDir: rootDirectory
          });
        } catch (e) {
          // If getRepoState fails, don't fail the whole build. Treat this case as if we don't know anything about
          // the state of the files in the repo. This can happen if the environment doesn't have Git.
          terminal.writeWarningLine(
            `Error calculating the state of the repo. (inner error: ${
              e.stack ?? e.message ?? e
            }). Continuing without diffing files.`
          );

          return;
        }
      };
    } catch (e) {
      // If getRepoState fails, don't fail the whole build. Treat this case as if we don't know anything about
      // the state of the files in the repo. This can happen if the environment doesn't have Git.
      terminal.writeWarningLine(
        `Error calculating the state of the repo. (inner error: ${
          e.stack ?? e.message ?? e
        }). Continuing without diffing files.`
      );

      return;
    }
  }

  /**
   * @internal
   */
  public async _filterProjectDataAsync<T>(
    project: RushConfigurationProject,
    unfilteredProjectData: Map<string, T>,
    rootDir: string,
    terminal: ITerminal
  ): Promise<Map<string, T>> {
    const ignoreMatcher: Ignore | undefined = await this._getIgnoreMatcherForProjectAsync(project, terminal);
    if (!ignoreMatcher) {
      return unfilteredProjectData;
    }

    const projectKey: string = path.relative(rootDir, project.projectFolder);
    const projectKeyLength: number = projectKey.length + 1;

    // At this point, `filePath` is guaranteed to start with `projectKey`, so
    // we can safely slice off the first N characters to get the file path relative to the
    // root of the project.
    const filteredProjectData: Map<string, T> = new Map<string, T>();
    for (const [filePath, value] of unfilteredProjectData) {
      const relativePath: string = filePath.slice(projectKeyLength);
      if (!ignoreMatcher.ignores(relativePath)) {
        // Add the file path to the filtered data if it is not ignored
        filteredProjectData.set(filePath, value);
      }
    }
    return filteredProjectData;
  }

  private async _getIgnoreMatcherForProjectAsync(
    project: RushConfigurationProject,
    terminal: ITerminal
  ): Promise<Ignore | undefined> {
    const incrementalBuildIgnoredGlobs: ReadonlyArray<string> | undefined =
      await RushProjectConfiguration.tryLoadIgnoreGlobsForProjectAsync(project, terminal);

    if (incrementalBuildIgnoredGlobs && incrementalBuildIgnoredGlobs.length) {
      const ignoreMatcher: Ignore = ignore();
      ignoreMatcher.add(incrementalBuildIgnoredGlobs as string[]);
      return ignoreMatcher;
    }
  }
}

interface IAdditionalGlob {
  project: RushConfigurationProject;
  operationName: string;
  additionalFilesForOperation: Set<string>;
  pattern: string;
}

async function getAdditionalFilesFromRushProjectConfigurationAsync(
  additionalGlobs: IAdditionalGlob[],
  rootRelativeLookupByPath: IReadonlyLookupByPath<RushConfigurationProject>,
  rootDirectory: string,
  terminal: ITerminal
): Promise<Set<string>> {
  const additionalFilesFromRushProjectConfiguration: Set<string> = new Set();

  if (!additionalGlobs.length) {
    return additionalFilesFromRushProjectConfiguration;
  }

  const { default: glob } = await import('fast-glob');
  await Async.forEachAsync(additionalGlobs, async (item: IAdditionalGlob) => {
    const { project, operationName, additionalFilesForOperation, pattern } = item;
    const matches: string[] = await glob(pattern, {
      cwd: project.projectFolder,
      onlyFiles: true,
      // We want to keep path's type unchanged,
      // i.e. if the pattern was a  relative path, then matched paths should also be relative paths
      //      if the pattern was an absolute path, then matched paths should also be absolute paths
      //
      // We are doing this because these paths are going to be used to calculate operation state hashes and some users
      // might choose to depend on global files (e.g. `/etc/os-release`) and some might choose to depend on local non-project files
      // (e.g. `../path/to/workspace/file`)
      //
      // In both cases we want that path to the resource to be the same on all machines,
      // regardless of what is the current working directory.
      //
      // That being said, we want to keep `absolute` options here as false:
      absolute: false
    });

    for (const match of matches) {
      // The glob result is relative to the project folder, but we want it to be relative to the repo root
      const rootRelativeFilePath: string = Path.convertToSlashes(
        path.relative(rootDirectory, path.resolve(project.projectFolder, match))
      );

      if (rootRelativeFilePath.startsWith('../')) {
        // The target file is outside of the Git tree, use the original result of the match.
        additionalFilesFromRushProjectConfiguration.add(match);
        additionalFilesForOperation.add(match);
      } else {
        // The target file is inside of the Git tree, find out if it is in a Rush project.
        const projectMatch: RushConfigurationProject | undefined =
          rootRelativeLookupByPath.findChildPath(rootRelativeFilePath);
        if (projectMatch && projectMatch !== project) {
          terminal.writeErrorLine(
            `In project "${project.packageName}" ("${project.projectRelativeFolder}"), ` +
              `config for operation "${operationName}" specifies a glob "${pattern}" that selects a file "${rootRelativeFilePath}" in a different workspace project ` +
              `"${projectMatch.packageName}" ("${projectMatch.projectRelativeFolder}"). ` +
              `This is forbidden. The "dependsOnAdditionalFiles" property of "rush-project.json" may only be used to refer to non-workspace files, non-project files, ` +
              `or untracked files in the current project. To depend on files in another workspace project, use "devDependencies" in "package.json".`
          );
          throw new AlreadyReportedError();
        }
        additionalFilesForOperation.add(rootRelativeFilePath);
        additionalFilesFromRushProjectConfiguration.add(rootRelativeFilePath);
      }
    }
  });

  return additionalFilesFromRushProjectConfiguration;
}
