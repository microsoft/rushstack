// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import ignore, { type Ignore } from 'ignore';

import type { IReadonlyLookupByPath, LookupByPath, IPrefixMatch } from '@rushstack/lookup-by-path';
import { Path, FileSystem, Async, AlreadyReportedError, Sort } from '@rushstack/node-core-library';
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
import { DependencySpecifier, DependencySpecifierType } from './DependencySpecifier';
import type { IPnpmOptionsJson, PnpmOptionsConfiguration } from './pnpm/PnpmOptionsConfiguration';
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

  /**
   * If set to `true`, excludes projects where the only changes are:
   * - A version-only change to `package.json` (only the "version" field differs)
   * - Changes to `CHANGELOG.md` and/or `CHANGELOG.json` files
   *
   * This prevents `rush version --bump` from triggering `rush change --verify` to request change files
   * for the version bumps and changelog updates it creates.
   */
  excludeVersionOnlyChanges?: boolean;
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

    const {
      targetBranchName,
      terminal,
      includeExternalDependencies,
      enableFiltering,
      shouldFetch,
      variant,
      excludeVersionOnlyChanges
    } = options;

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

    await Async.forEachAsync(
      changesByProject,
      async ([project, projectChanges]) => {
        const filteredChanges: Map<string, IFileDiffStatus> = enableFiltering
          ? await this._filterProjectDataAsync(project, projectChanges, repoRoot, terminal)
          : projectChanges;

        // Skip if no changes
        if (filteredChanges.size === 0) {
          return;
        }

        // If excludeVersionOnlyChanges is not enabled, include the project
        if (!excludeVersionOnlyChanges) {
          changedProjects.add(project);
          return;
        }

        // Filter out package.json with version-only changes, CHANGELOG.md, and CHANGELOG.json
        for (const [filePath, diffStatus] of filteredChanges) {
          // Use lookup to find the project-relative path
          const match: IPrefixMatch<RushConfigurationProject> | undefined =
            lookup.findLongestPrefixMatch(filePath);
          if (!match) {
            // This should be unreachable as projectChanges contains files where match.value === project
            changedProjects.add(project);
            return;
          }

          const projectRelativePath: string = filePath.slice(match.index);

          // Skip CHANGELOG.md and CHANGELOG.json files at project root
          if (projectRelativePath === '/CHANGELOG.md' || projectRelativePath === '/CHANGELOG.json') {
            continue;
          }

          // Check if this is package.json at project root with version-only changes
          if (projectRelativePath === '/package.json') {
            const isVersionOnlyChange: boolean = await isVersionOnlyChangeAsync(
              diffStatus,
              repoRoot,
              this._git
            );
            if (isVersionOnlyChange) {
              continue; // Skip version-only package.json changes
            }
          }

          // Found a non-excluded change
          changedProjects.add(project);
          break;
        }
      },
      { concurrency: 10 }
    );

    // Detect per-subspace changes: catalog entries in pnpm-config.json and external dependency lockfiles
    const subspaces: Iterable<Subspace> = rushConfiguration.subspacesFeatureEnabled
      ? rushConfiguration.subspaces
      : [rushConfiguration.defaultSubspace];

    const variantToUse: string | undefined = includeExternalDependencies
      ? (variant ?? (await this._rushConfiguration.getCurrentlyInstalledVariantAsync()))
      : undefined;

    await Async.forEachAsync(subspaces, async (subspace: Subspace) => {
      const subspaceProjects: RushConfigurationProject[] = subspace.getProjects();

      // Detect changes to pnpm catalog entries in pnpm-config.json
      if (rushConfiguration.isPnpm) {
        await this._detectCatalogChangesAsync(
          subspace,
          rushConfiguration,
          changedFiles,
          mergeCommit,
          repoRoot,
          terminal,
          changedProjects
        );
      }

      // External dependency changes are not allowed to be filtered, so add these after filtering
      if (includeExternalDependencies) {
        // Even though changing the installed version of a nested dependency merits a change file,
        // ignore lockfile changes for `rush change` for the moment

        const fullShrinkwrapPath: string = subspace.getCommittedShrinkwrapFilePath(variantToUse);

        const relativeShrinkwrapFilePath: string = Path.convertToSlashes(
          path.relative(repoRoot, fullShrinkwrapPath)
        );
        const shrinkwrapStatus: IFileDiffStatus | undefined = changedFiles.get(relativeShrinkwrapFilePath);

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
            const subspaceHasNoProjects: boolean = subspaceProjects.length === 0;
            const currentShrinkwrap: PnpmShrinkwrapFile | undefined = PnpmShrinkwrapFile.loadFromFile(
              fullShrinkwrapPath,
              { subspaceHasNoProjects }
            );

            if (!currentShrinkwrap) {
              throw new Error(`Unable to obtain current shrinkwrap file.`);
            }

            const oldShrinkwrapText: string = await this._git.getBlobContentAsync({
              // <ref>:<path> syntax: https://git-scm.com/docs/gitrevisions
              blobSpec: `${mergeCommit}:${relativeShrinkwrapFilePath}`,
              repositoryRoot: repoRoot
            });
            const oldShrinkWrap: PnpmShrinkwrapFile = PnpmShrinkwrapFile.loadFromString(oldShrinkwrapText, {
              subspaceHasNoProjects
            });

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
            subspaceProjects.forEach((project) => changedProjects.add(project));
            return;
          }
        }
      }
    });

    // Sort the set by projectRelativeFolder to avoid race conditions in the results
    const sortedChangedProjects: RushConfigurationProject[] = Array.from(changedProjects);
    Sort.sortBy(sortedChangedProjects, (project) => project.projectRelativeFolder);

    return new Set(sortedChangedProjects);
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
          const [{ files: hashes, symlinks, hasUncommittedChanges }, additionalFiles] = await Promise.all([
            getDetailedRepoStateAsync(rootDirectory, additionalRelativePathsToHash, gitPath, filterPath),
            getAdditionalFilesFromRushProjectConfigurationAsync(
              additionalGlobs,
              lookupByPath,
              rootDirectory,
              terminal
            )
          ]);

          if (symlinks.size > 0) {
            terminal.writeWarningLine(
              `Warning: Detected ${symlinks.size} Git-tracked symlinks in the repository. ` +
                `These will be ignored by the change detection engine.`
            );
          }

          for (const file of additionalFiles) {
            if (hashes.has(file) || symlinks.has(file)) {
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

  /**
   * Detects changes to pnpm catalog entries in a subspace's pnpm-config.json and marks
   * affected projects as changed.
   */
  private async _detectCatalogChangesAsync(
    subspace: Subspace,
    rushConfiguration: RushConfiguration,
    changedFiles: Map<string, IFileDiffStatus>,
    mergeCommit: string,
    repoRoot: string,
    terminal: ITerminal,
    changedProjects: Set<RushConfigurationProject>
  ): Promise<void> {
    const pnpmOptions: PnpmOptionsConfiguration | undefined = subspace.getPnpmOptions();
    const currentCatalogs: Record<string, Record<string, string>> | undefined = pnpmOptions?.globalCatalogs;
    if (!currentCatalogs) {
      return;
    }

    const pnpmConfigRelativePath: string = Path.convertToSlashes(
      path.relative(repoRoot, subspace.getPnpmConfigFilePath())
    );

    if (!changedFiles.has(pnpmConfigRelativePath)) {
      return;
    }

    // Determine which specific packages changed within each catalog namespace
    // Maps catalogNamespace (e.g. "default", "react17") → Set of changed package names
    let changedCatalogPackages: Map<string, Set<string>>;
    try {
      const oldPnpmConfigText: string = await this._git.getBlobContentAsync({
        blobSpec: `${mergeCommit}:${pnpmConfigRelativePath}`,
        repositoryRoot: repoRoot
      });
      const oldPnpmConfig: IPnpmOptionsJson = JSON.parse(oldPnpmConfigText);
      const oldCatalogs: Record<string, Record<string, string>> = oldPnpmConfig.globalCatalogs ?? {};

      changedCatalogPackages = new Map<string, Set<string>>();

      // Check current catalogs for new or modified package entries
      for (const [catalogName, packages] of Object.entries(currentCatalogs)) {
        const oldPackages: Record<string, string> | undefined = oldCatalogs[catalogName];
        if (!oldPackages) {
          // Entire catalog is new — all packages in it are changed
          changedCatalogPackages.set(catalogName, new Set(Object.keys(packages)));
          continue;
        }
        const changedPkgs: Set<string> = new Set<string>();
        for (const [pkgName, version] of Object.entries(packages)) {
          if (oldPackages[pkgName] !== version) {
            changedPkgs.add(pkgName);
          }
        }
        // Check for packages that were removed from this catalog
        for (const pkgName of Object.keys(oldPackages)) {
          if (!(pkgName in packages)) {
            changedPkgs.add(pkgName);
          }
        }
        if (changedPkgs.size > 0) {
          changedCatalogPackages.set(catalogName, changedPkgs);
        }
      }

      // Check for catalogs that were entirely removed
      for (const [catalogName, oldPackages] of Object.entries(oldCatalogs)) {
        if (!(catalogName in currentCatalogs)) {
          changedCatalogPackages.set(catalogName, new Set(Object.keys(oldPackages)));
        }
      }
    } catch {
      // Old file didn't exist or was unparseable — treat all packages in all current catalogs as changed
      changedCatalogPackages = new Map<string, Set<string>>();
      for (const [catalogName, packages] of Object.entries(currentCatalogs)) {
        changedCatalogPackages.set(catalogName, new Set(Object.keys(packages)));
      }
      if (rushConfiguration.subspacesFeatureEnabled) {
        terminal.writeLine(
          `"${subspace.subspaceName}" subspace pnpm-config.json was created or unparseable. Assuming all projects are affected.`
        );
      } else {
        terminal.writeLine(
          `pnpm-config.json was created or unparseable. Assuming all projects are affected.`
        );
      }
    }

    if (changedCatalogPackages.size > 0) {
      // Check each project in the subspace to see if it depends on a changed catalog package
      const subspaceProjects: RushConfigurationProject[] = subspace.getProjects();
      for (const project of subspaceProjects) {
        const { dependencies, devDependencies, optionalDependencies } = project.packageJson;
        const allDeps: Record<string, string>[] = [
          dependencies ?? {},
          devDependencies ?? {},
          optionalDependencies ?? {}
        ];

        let isAffected: boolean = false;
        for (const deps of allDeps) {
          if (isAffected) {
            break;
          }
          for (const [depName, depVersion] of Object.entries(deps)) {
            const specifier: DependencySpecifier = DependencySpecifier.parseWithCache(depName, depVersion);
            if (specifier.specifierType === DependencySpecifierType.Catalog) {
              // versionSpecifier holds the catalog name (empty string for "catalog:")
              const catalogName: string = specifier.versionSpecifier || 'default';
              const changedPkgs: Set<string> | undefined = changedCatalogPackages.get(catalogName);
              if (changedPkgs?.has(depName)) {
                isAffected = true;
                break;
              }
            }
          }
        }

        if (isAffected) {
          changedProjects.add(project);
        }
      }
    }
  }
}

/**
 * Checks if a diff represents a version-only change to package.json.
 */
async function isVersionOnlyChangeAsync(
  diffStatus: IFileDiffStatus,
  repoRoot: string,
  git: Git
): Promise<boolean> {
  try {
    // Only check modified files, not additions or deletions
    if (diffStatus.status !== 'M') {
      return false;
    }

    // Get both versions of package.json from Git in parallel
    const [oldPackageJsonContent, currentPackageJsonContent] = await Promise.all([
      git.getBlobContentAsync({
        blobSpec: diffStatus.oldhash,
        repositoryRoot: repoRoot
      }),
      git.getBlobContentAsync({
        blobSpec: diffStatus.newhash,
        repositoryRoot: repoRoot
      })
    ]);

    return isPackageJsonVersionOnlyChange(oldPackageJsonContent, currentPackageJsonContent);
  } catch (error) {
    // If we can't read the file or parse it, assume it's not a version-only change
    return false;
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

/**
 * Compares two package.json file contents and determines if the only difference is the "version" field.
 * @param oldPackageJsonContent - The old package.json content as a string
 * @param newPackageJsonContent - The new package.json content as a string
 * @returns true if the only difference is the version field, false otherwise
 */
export function isPackageJsonVersionOnlyChange(
  oldPackageJsonContent: string,
  newPackageJsonContent: string
): boolean {
  try {
    // Parse both versions - use specific type since we only care about version field
    const oldPackageJson: { version?: string } = JSON.parse(oldPackageJsonContent);
    const newPackageJson: { version?: string } = JSON.parse(newPackageJsonContent);

    // Ensure both have a version field
    if (!oldPackageJson.version || !newPackageJson.version) {
      return false;
    }

    // Remove the version field from both (no need to clone, these are fresh objects from JSON.parse)
    oldPackageJson.version = undefined;
    newPackageJson.version = undefined;

    // Compare the objects without the version field
    return JSON.stringify(oldPackageJson) === JSON.stringify(newPackageJson);
  } catch (error) {
    // If we can't parse the JSON, assume it's not a version-only change
    return false;
  }
}
