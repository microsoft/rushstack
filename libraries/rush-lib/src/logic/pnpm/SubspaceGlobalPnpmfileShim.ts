// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// The "rush install" or "rush update" commands will copy this template to
// "common/temp-split/global-pnpmfile.js" so that it can implement Rush-specific features.
// It reads its input data from "common/temp/pnpmfileSettings.json". The pnpmfile is
// required directly by this shim and is called after Rush's transformations are applied.

import path from 'node:path';

// This file can use "import type" but otherwise should not reference any other modules, since it will
// be run from the "common/temp" directory
import type * as TSemver from 'semver';

import type { IPackageJson } from '@rushstack/node-core-library';

import type {
  IPnpmfile,
  IPnpmfileContext,
  IPnpmfileHooks,
  ISubspacePnpmfileShimSettings,
  IWorkspaceProjectInfo
} from './IPnpmfile';
import type { IPnpmShrinkwrapYaml } from './PnpmShrinkwrapFile';

let settings: ISubspacePnpmfileShimSettings;
let userPnpmfile: IPnpmfile | undefined;
let semver: typeof TSemver | undefined;

// Initialize all external aspects of the pnpmfile shim. When using the shim, settings
// are always expected to be available. Init must be called before running any hook that
// depends on a resource obtained from or related to the settings, and will require modules
// once so they aren't repeatedly required in the hook functions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function init(context: IPnpmfileContext | any): IPnpmfileContext {
  // Sometimes PNPM may provide us a context arg that doesn't fit spec, ex.:
  // https://github.com/pnpm/pnpm/blob/97c64bae4d14a8c8f05803f1d94075ee29c2df2f/packages/get-context/src/index.ts#L134
  // So we need to normalize the context format before we move on
  if (typeof context !== 'object' || Array.isArray(context)) {
    context = {
      log: (message: string) => {},
      originalContext: context
    } as IPnpmfileContext;
  }
  if (!settings) {
    // Initialize the settings from file
    if (!context.splitWorkspacePnpmfileShimSettings) {
      context.splitWorkspacePnpmfileShimSettings = __non_webpack_require__('./pnpmfileSettings.json');
    }
    settings = context.splitWorkspacePnpmfileShimSettings!;
  } else if (!context.splitWorkspacePnpmfileShimSettings) {
    // Reuse the already initialized settings
    context.splitWorkspacePnpmfileShimSettings = settings;
  }
  // If a userPnpmfilePath is provided, we expect it to exist
  if (!userPnpmfile && settings.userPnpmfilePath) {
    userPnpmfile = require(settings.userPnpmfilePath);
  }
  // If a semverPath is provided, we expect it to exist
  if (!semver && settings.semverPath) {
    semver = require(settings.semverPath);
  }
  // Return the normalized context
  return context as IPnpmfileContext;
}

// Rewrite rush project referenced in split workspace.
// For example: "project-a": "workspace:*" --> "project-a": "link:../../project-a"
function rewriteRushProjectVersions(
  packageName: string,
  dependencies: { [dependencyName: string]: string } | undefined
): void {
  if (!dependencies) {
    return;
  }

  if (!settings) {
    throw new Error(`splitWorkspaceGlobalPnpmfileShimSettings not initialized`);
  }

  const workspaceProject: IWorkspaceProjectInfo | undefined =
    settings.subspaceProjects[packageName] || settings.workspaceProjects[packageName];
  if (!workspaceProject) {
    return;
  }

  for (const dependencyName of Object.keys(dependencies)) {
    const currentVersion: string = dependencies[dependencyName];

    if (currentVersion.startsWith('workspace:')) {
      const workspaceProjectInfo: IWorkspaceProjectInfo | undefined =
        settings.workspaceProjects[dependencyName];
      if (workspaceProjectInfo) {
        // Case 1. "<package_name>": "workspace:*"
        let workspaceVersionProtocol: string = 'link:';

        const injectedDependenciesSet: ReadonlySet<string> = new Set(workspaceProject.injectedDependencies);
        if (injectedDependenciesSet.has(dependencyName)) {
          workspaceVersionProtocol = 'file:';
        }
        let relativePath: string = path.normalize(
          path.relative(workspaceProject.projectRelativeFolder, workspaceProjectInfo.projectRelativeFolder)
        );
        // convert path in posix style, otherwise pnpm install will fail in subspace case
        relativePath = relativePath.split(path.sep).join(path.posix.sep);
        const newVersion: string = workspaceVersionProtocol + relativePath;
        dependencies[dependencyName] = newVersion;
      } else {
        // Case 2. "<alias>": "workspace:<aliased_package_name>@<version>"
        const packageSpec: string = currentVersion.slice('workspace:'.length);
        const nameEndsAt: number =
          packageSpec[0] === '@' ? packageSpec.slice(1).indexOf('@') + 1 : packageSpec.indexOf('@');
        const aliasedPackageName: string = nameEndsAt > 0 ? packageSpec.slice(0, nameEndsAt) : packageSpec;
        // const depVersion: string = nameEndsAt > 0 ? packageSpec.slice(nameEndsAt + 1) : '';
        const aliasedWorkspaceProjectInfo: IWorkspaceProjectInfo | undefined =
          settings.workspaceProjects[aliasedPackageName];
        if (aliasedWorkspaceProjectInfo) {
          const relativePath: string = path.normalize(
            path.relative(
              workspaceProject.projectRelativeFolder,
              aliasedWorkspaceProjectInfo.projectRelativeFolder
            )
          );
          const newVersion: string = 'link:' + relativePath;
          dependencies[dependencyName] = newVersion;
        }
      }
    } else if (currentVersion.startsWith('npm:')) {
      // Case 3. "<alias>": "npm:<package_name>@<dep_version>"
      const packageSpec: string = currentVersion.slice('npm:'.length);
      const nameEndsAt: number =
        packageSpec[0] === '@' ? packageSpec.slice(1).indexOf('@') + 1 : packageSpec.indexOf('@');
      const aliasedPackageName: string = nameEndsAt > 0 ? packageSpec.slice(0, nameEndsAt) : packageSpec;
      // const depVersion: string = nameEndsAt > 0 ? packageSpec.slice(nameEndsAt + 1) : '';
      const aliasedWorkspaceProjectInfo: IWorkspaceProjectInfo | undefined =
        settings.workspaceProjects[aliasedPackageName];
      if (aliasedWorkspaceProjectInfo) {
        const relativePath: string = path.normalize(
          path.relative(
            workspaceProject.projectRelativeFolder,
            aliasedWorkspaceProjectInfo.projectRelativeFolder
          )
        );
        const newVersion: string = 'link:' + relativePath;
        dependencies[dependencyName] = newVersion;
      }
    }
  }
}

export const hooks: IPnpmfileHooks = {
  // Call the original pnpmfile (if it exists)
  afterAllResolved: (lockfile: IPnpmShrinkwrapYaml, context: IPnpmfileContext) => {
    context = init(context);
    return userPnpmfile?.hooks?.afterAllResolved
      ? userPnpmfile.hooks.afterAllResolved(lockfile, context)
      : lockfile;
  },

  // Rewrite workspace protocol to link protocol for non split workspace projects
  readPackage: (pkg: IPackageJson, context: IPnpmfileContext) => {
    context = init(context);
    rewriteRushProjectVersions(pkg.name, pkg.dependencies);
    rewriteRushProjectVersions(pkg.name, pkg.devDependencies);
    return userPnpmfile?.hooks?.readPackage ? userPnpmfile.hooks.readPackage(pkg, context) : pkg;
  },

  // Call the original pnpmfile (if it exists)
  filterLog: userPnpmfile?.hooks?.filterLog
};
