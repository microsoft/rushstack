// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { z } from 'zod';

import { withSchemaMeta } from '@rushstack/heft-zod-schema-plugin/lib/SchemaMetaHelpers';

const booleanFlag = (description: string): z.ZodOptional<z.ZodBoolean> =>
  z.boolean().describe(description).optional();

/**
 * The zod schema describing the structure of `experiments.json`. Use this to
 * validate raw config input. The corresponding TypeScript shape
 * {@link IExperimentsJson} is derived from this schema via `z.infer`.
 *
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/typedef
export const experimentsSchema = withSchemaMeta(
  z
    .object({
      $schema: z
        .string()
        .describe(
          'Part of the JSON Schema standard, this optional keyword declares the URL of the schema that the file conforms to. ' +
            'Editors may download the schema and use it to perform syntax highlighting.'
        )
        .optional(),

      usePnpmFrozenLockfileForRushInstall: booleanFlag(
        "By default, 'rush install' passes --no-prefer-frozen-lockfile to 'pnpm install'. " +
          "Set this option to true to pass '--frozen-lockfile' instead for faster installs."
      ),
      usePnpmPreferFrozenLockfileForRushUpdate: booleanFlag(
        "By default, 'rush update' passes --no-prefer-frozen-lockfile to 'pnpm install'. " +
          "Set this option to true to pass '--prefer-frozen-lockfile' instead to minimize shrinkwrap changes."
      ),
      usePnpmLockfileOnlyThenFrozenLockfileForRushUpdate: booleanFlag(
        "By default, 'rush update' runs as a single operation. Set this option to true to instead update the lockfile with `--lockfile-only`, then perform a `--frozen-lockfile` install. " +
          'Necessary when using the `afterAllResolved` hook in .pnpmfile.cjs.'
      ),
      omitImportersFromPreventManualShrinkwrapChanges: booleanFlag(
        "If using the 'preventManualShrinkwrapChanges' option, restricts the hash to only include the layout of " +
          'external dependencies. Used to allow links between workspace projects or the addition/removal of ' +
          'references to existing dependency versions to not cause hash changes.'
      ),
      noChmodFieldInTarHeaderNormalization: booleanFlag(
        'If true, the chmod field in temporary project tar headers will not be normalized. This normalization can help ensure consistent tarball integrity across platforms.'
      ),
      buildCacheWithAllowWarningsInSuccessfulBuild: booleanFlag(
        'If true, build caching will respect the allowWarningsInSuccessfulBuild flag and cache builds with warnings. This will not replay warnings from the cached build.'
      ),
      buildSkipWithAllowWarningsInSuccessfulBuild: booleanFlag(
        'If true, build skipping will respect the allowWarningsInSuccessfulBuild flag and skip builds with warnings. This will not replay warnings from the skipped build.'
      ),
      phasedCommands: booleanFlag(
        'THIS EXPERIMENT HAS BEEN GRADUATED TO A STANDARD FEATURE. THIS PROPERTY SHOULD BE REMOVED.'
      ),
      cleanInstallAfterNpmrcChanges: booleanFlag(
        'If true, perform a clean install after when running `rush install` or `rush update` if the `.npmrc` file has changed since the last install.'
      ),
      printEventHooksOutputToConsole: booleanFlag(
        'If true, print the outputs of shell commands defined in event hooks to the console.'
      ),
      forbidPhantomResolvableNodeModulesFolders: booleanFlag(
        'If true, Rush will not allow node_modules in the repo folder or in parent folders.'
      ),
      usePnpmSyncForInjectedDependencies: booleanFlag(
        "(UNDER DEVELOPMENT) For certain installation problems involving peer dependencies, PNPM cannot correctly satisfy versioning requirements without installing duplicate copies of a package inside the node_modules folder. This poses a problem for 'workspace:*' dependencies, as they are normally installed by making a symlink to the local project source folder. PNPM's 'injected dependencies' feature provides a model for copying the local project folder into node_modules, however copying must occur AFTER the dependency project is built and BEFORE the consuming project starts to build. The 'pnpm-sync' tool manages this operation; see its documentation for details. Enable this experiment if you want 'rush' and 'rushx' commands to resync injected dependencies by invoking 'pnpm-sync' during the build."
      ),
      generateProjectImpactGraphDuringRushUpdate: booleanFlag(
        'If set to true, Rush will generate a `project-impact-graph.yaml` file in the repository root during `rush update`.'
      ),
      useIPCScriptsInWatchMode: booleanFlag(
        'If true, when running in watch mode, Rush will check for phase scripts named `_phase:<name>:ipc` and run them instead of `_phase:<name>` if they exist. The created child process will be provided with an IPC channel and expected to persist across invocations.'
      ),
      allowCobuildWithoutCache: booleanFlag(
        'Allow cobuilds without using the build cache to store previous execution info. When setting up ' +
          'distributed builds, Rush will allow uncacheable projects to still leverage the cobuild feature. ' +
          "This is useful when you want to speed up operations that can't (or shouldn't) be cached."
      ),
      rushAlerts: booleanFlag(
        "(UNDER DEVELOPMENT) The Rush alerts feature provides a way to send announcements to engineers working in the monorepo, by printing directly in the user's shell window when they invoke Rush commands. This ensures that important notices will be seen by anyone doing active development, since people often ignore normal discussion group messages or don't know to subscribe."
      ),
      enableSubpathScan: booleanFlag(
        'By default, rush perform a full scan of the entire repository. For example, Rush runs `git status` to check for local file changes. When this toggle is enabled, Rush will only scan specific paths, significantly speeding up Git operations.'
      ),
      exemptDecoupledDependenciesBetweenSubspaces: booleanFlag(
        'Rush has a policy that normally requires Rush projects to specify `workspace:*` in package.json when depending on other projects in the workspace, unless they are explicitly declared as `decoupledLocalDependencies in rush.json. Enabling this experiment will remove that requirement for dependencies belonging to a different subspace. This is useful for large product groups who work in separate subspaces and generally prefer to consume each other\'s packages via the NPM registry.'
      ),
      omitAppleDoubleFilesFromBuildCache: booleanFlag(
        'If true, when running on macOS, Rush will omit AppleDouble files (._*) from build cache archives when a companion file exists in the same directory. AppleDouble files are automatically created by macOS to store extended attributes on filesystems that don\'t support them, and should generally not be included in the shared build cache.'
      ),
      strictChangefileValidation: booleanFlag(
        'If true, `rush change --verify` will report errors if change files reference projects that do not exist in the Rush configuration, or if change files target a project that belongs to a lockstepped version policy but is not the policy\'s main project.'
      )
    })
    .strict(),
  {
    $schema: 'http://json-schema.org/draft-04/schema#',
    title: 'Rush experiments.json config file',
    description:
      'For use with the Rush tool, this file allows repo maintainers to enable and disable experimental Rush features.',
    releaseTag: '@beta'
  }
);

/**
 * Helper that maps over the keys of `T` to coerce TypeScript into rendering the
 * fully-expanded shape of an inferred type.
 */
type _Simplify<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;

/**
 * Raw shape of `experiments.json`, excluding the optional top-level `$schema`
 * pointer. The shape is derived from {@link experimentsSchema} via `z.infer` to
 * keep the schema and the type from drifting; per-property documentation is
 * carried by the schema's `.describe()` annotations.
 *
 * @beta
 */
export type IExperimentsJson = _Simplify<Omit<z.infer<typeof experimentsSchema>, '$schema'>>;

// Default export so the heft-zod-schema-plugin emits this as
// `experiments.schema.json` (rather than `experiments.experimentsSchema.schema.json`
// when configured with `exportName: "*"`).
export default experimentsSchema;
