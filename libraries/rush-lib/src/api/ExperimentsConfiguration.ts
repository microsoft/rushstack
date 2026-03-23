// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import schemaJson from '../schemas/experiments.schema.json';

const GRADUATED_EXPERIMENTS: Set<string> = new Set(['phasedCommands']);

/**
 * This interface represents the raw experiments.json file which allows repo
 * maintainers to enable and disable experimental Rush features.
 * @beta
 */
export interface IExperimentsJson {
  /**
   * By default, 'rush install' passes --no-prefer-frozen-lockfile to 'pnpm install'.
   * Set this option to true to pass '--frozen-lockfile' instead for faster installs.
   */
  usePnpmFrozenLockfileForRushInstall?: boolean;

  /**
   * By default, 'rush update' passes --no-prefer-frozen-lockfile to 'pnpm install'.
   * Set this option to true to pass '--prefer-frozen-lockfile' instead to minimize shrinkwrap changes.
   */
  usePnpmPreferFrozenLockfileForRushUpdate?: boolean;

  /**
   * By default, 'rush update' runs as a single operation.
   * Set this option to true to instead update the lockfile with `--lockfile-only`, then perform a `--frozen-lockfile` install.
   * Necessary when using the `afterAllResolved` hook in .pnpmfile.cjs.
   */
  usePnpmLockfileOnlyThenFrozenLockfileForRushUpdate?: boolean;

  /**
   * If using the 'preventManualShrinkwrapChanges' option, restricts the hash to only include the layout of external dependencies.
   * Used to allow links between workspace projects or the addition/removal of references to existing dependency versions to not
   * cause hash changes.
   */
  omitImportersFromPreventManualShrinkwrapChanges?: boolean;

  /**
   * If true, the chmod field in temporary project tar headers will not be normalized.
   * This normalization can help ensure consistent tarball integrity across platforms.
   */
  noChmodFieldInTarHeaderNormalization?: boolean;

  /**
   * If true, build caching will respect the allowWarningsInSuccessfulBuild flag and cache builds with warnings.
   * This will not replay warnings from the cached build.
   */
  buildCacheWithAllowWarningsInSuccessfulBuild?: boolean;

  /**
   * If true, build skipping will respect the allowWarningsInSuccessfulBuild flag and skip builds with warnings.
   * This will not replay warnings from the skipped build.
   */
  buildSkipWithAllowWarningsInSuccessfulBuild?: boolean;

  /**
   * If true, perform a clean install after when running `rush install` or `rush update` if the
   * `.npmrc` file has changed since the last install.
   */
  cleanInstallAfterNpmrcChanges?: boolean;

  /**
   * If true, print the outputs of shell commands defined in event hooks to the console.
   */
  printEventHooksOutputToConsole?: boolean;

  /**
   * If true, Rush will not allow node_modules in the repo folder or in parent folders.
   */
  forbidPhantomResolvableNodeModulesFolders?: boolean;

  /**
   * (UNDER DEVELOPMENT) For certain installation problems involving peer dependencies, PNPM cannot
   * correctly satisfy versioning requirements without installing duplicate copies of a package inside the
   * node_modules folder. This poses a problem for "workspace:*" dependencies, as they are normally
   * installed by making a symlink to the local project source folder. PNPM's "injected dependencies"
   * feature provides a model for copying the local project folder into node_modules, however copying
   * must occur AFTER the dependency project is built and BEFORE the consuming project starts to build.
   * The "pnpm-sync" tool manages this operation; see its documentation for details.
   * Enable this experiment if you want "rush" and "rushx" commands to resync injected dependencies
   * by invoking "pnpm-sync" during the build.
   */
  usePnpmSyncForInjectedDependencies?: boolean;

  /**
   * If set to true, Rush will generate a `project-impact-graph.yaml` file in the repository root during `rush update`.
   */
  generateProjectImpactGraphDuringRushUpdate?: boolean;

  /**
   * If true, when running in watch mode, Rush will check for phase scripts named `_phase:<name>:ipc` and run them instead
   * of `_phase:<name>` if they exist. The created child process will be provided with an IPC channel and expected to persist
   * across invocations.
   */
  useIPCScriptsInWatchMode?: boolean;

  /**
   * (UNDER DEVELOPMENT) The Rush alerts feature provides a way to send announcements to engineers
   * working in the monorepo, by printing directly in the user's shell window when they invoke Rush commands.
   * This ensures that important notices will be seen by anyone doing active development, since people often
   * ignore normal discussion group messages or don't know to subscribe.
   */
  rushAlerts?: boolean;

  /**
   * Allow cobuilds without using the build cache to store previous execution info. When setting up
   *  distributed builds, Rush will allow uncacheable projects to still leverage the cobuild feature.
   * This is useful when you want to speed up operations that can't (or shouldn't) be cached.
   */
  allowCobuildWithoutCache?: boolean;

  /**
   * By default, rush perform a full scan of the entire repository. For example, Rush runs `git status` to check for local file changes.
   * When this toggle is enabled, Rush will only scan specific paths, significantly speeding up Git operations.
   */
  enableSubpathScan?: boolean;

  /**
   * Rush has a policy that normally requires Rush projects to specify `workspace:*` in package.json when depending
   * on other projects in the workspace, unless they are explicitly declared as `decoupledLocalDependencies`
   * in rush.json.  Enabling this experiment will remove that requirement for dependencies belonging to a different
   * subspace.  This is useful for large product groups who work in separate subspaces and generally prefer to consume
   * each other's packages via the NPM registry.
   */
  exemptDecoupledDependenciesBetweenSubspaces?: boolean;

  /**
   * If true, when running on macOS, Rush will omit AppleDouble files (`._*`) from build cache archives
   * when a companion file exists in the same directory. AppleDouble files are automatically created by
   * macOS to store extended attributes on filesystems that don't support them, and should generally not
   * be included in the shared build cache.
   */
  omitAppleDoubleFilesFromBuildCache?: boolean;
}

const _EXPERIMENTS_JSON_SCHEMA: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

/**
 * Use this class to load the "common/config/rush/experiments.json" config file.
 * This file allows repo maintainers to enable and disable experimental Rush features.
 * @public
 */
export class ExperimentsConfiguration {
  /**
   * Get the experiments configuration.
   * @beta
   */
  public readonly configuration: Readonly<IExperimentsJson>;

  /**
   * @internal
   */
  public constructor(jsonFilePath: string) {
    try {
      this.configuration = JsonFile.loadAndValidate(jsonFilePath, _EXPERIMENTS_JSON_SCHEMA);
    } catch (e) {
      if (FileSystem.isNotExistError(e)) {
        this.configuration = {};
      } else {
        throw e;
      }
    }

    for (const experimentName of Object.getOwnPropertyNames(this.configuration)) {
      if (GRADUATED_EXPERIMENTS.has(experimentName)) {
        // eslint-disable-next-line no-console
        console.log(
          Colorize.yellow(
            `The experiment "${experimentName}" has graduated to a standard feature. Remove this experiment from ` +
              `"${jsonFilePath}".`
          )
        );
      }
    }
  }
}
