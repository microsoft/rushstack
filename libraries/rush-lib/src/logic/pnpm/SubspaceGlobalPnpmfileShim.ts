// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// The "rush install" or "rush update" commands will copy this template to
// "common/temp-split/global-pnpmfile.js" so that it can implement Rush-specific features.
// It reads its input data from "common/temp/pnpmfileSettings.json". The pnpmfile is
// required directly by this shim and is called after Rush's transformations are applied.

import path from 'node:path';

// This file can use "import type", but otherwise it should only import local modules that have no runtime
// dependencies (webpack bundles those into the shim), since it will be run from the "common/temp" directory
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
import type { PnpmCatalogs } from './EffectivePnpmOptions';
import { tryGetPnpmCatalogVersion, tryParsePnpmCatalogName } from './PnpmCatalogReference';

let settings: ISubspacePnpmfileShimSettings | undefined;
let userPnpmfile: IPnpmfile | undefined;
let semver: typeof TSemver | undefined;

// The manifest fields that PNPM resolves for an installed (non-workspace) package.
const INSTALLED_PACKAGE_DEPENDENCY_FIELDS: ReadonlyArray<
  'dependencies' | 'optionalDependencies' | 'peerDependencies'
> = ['dependencies', 'optionalDependencies', 'peerDependencies'];

// Resets the internal state of the pnpmfile
export function reset(): void {
  settings = undefined;
  userPnpmfile = undefined;
  semver = undefined;
}

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
  const definedSettings: ISubspacePnpmfileShimSettings = settings!;
  // If a userPnpmfilePath is provided, we expect it to exist
  if (!userPnpmfile && definedSettings.userPnpmfilePath) {
    userPnpmfile = require(definedSettings.userPnpmfilePath);
  }
  // If a semverPath is provided, we expect it to exist
  if (!semver && definedSettings.semverPath) {
    semver = require(definedSettings.semverPath);
  }
  // Return the normalized context
  return context as IPnpmfileContext;
}

// PNPM only resolves "catalog:" references for its own workspace projects. A Rush project from another subspace
// is installed as an external package (for example, as an injected "file:" dependency), so replace its catalog
// references with the entries from the catalogs of the subspace that contains it.
// For example: "semver": "catalog:" --> "semver": "~7.5.4"
function resolveOtherSubspaceCatalogReferences(pkg: IPackageJson): void {
  if (!settings) {
    throw new Error(`splitWorkspaceGlobalPnpmfileShimSettings not initialized`);
  }

  // Never rewrite this subspace's own projects: PNPM resolves their catalog references itself, and the lockfile
  // importers record the original specifiers
  if (!Object.prototype.hasOwnProperty.call(settings.workspaceProjects, pkg.name)) {
    return;
  }

  const workspaceProject: IWorkspaceProjectInfo = settings.workspaceProjects[pkg.name];
  for (const dependencyField of INSTALLED_PACKAGE_DEPENDENCY_FIELDS) {
    const dependencies: Record<string, string> | undefined = pkg[dependencyField];
    if (!dependencies) {
      continue;
    }

    for (const [dependencyName, versionSpecifier] of Object.entries(dependencies)) {
      const catalogName: string | undefined = tryParsePnpmCatalogName(versionSpecifier);
      if (catalogName !== undefined) {
        dependencies[dependencyName] = getCatalogVersion(
          workspaceProject,
          dependencyName,
          versionSpecifier,
          catalogName
        );
      }
    }
  }
}

function getCatalogVersion(
  workspaceProject: IWorkspaceProjectInfo,
  dependencyName: string,
  versionSpecifier: string,
  catalogName: string
): string {
  const { packageName, subspaceName } = workspaceProject;
  const subspaceCatalogs: PnpmCatalogs | undefined =
    subspaceName !== undefined &&
    settings?.catalogsBySubspaceName &&
    Object.prototype.hasOwnProperty.call(settings.catalogsBySubspaceName, subspaceName)
      ? settings.catalogsBySubspaceName[subspaceName]
      : undefined;

  const catalogVersion: string | undefined = tryGetPnpmCatalogVersion(
    subspaceCatalogs,
    catalogName,
    dependencyName
  );
  if (catalogVersion !== undefined) {
    return catalogVersion;
  }

  const reference: string =
    `The "${packageName}" project from the "${subspaceName}" subspace is installed as an external ` +
    `package, and it depends on "${dependencyName}@${versionSpecifier}". Rush resolves that reference ` +
    `using the "globalCatalogs" from the pnpm-config.json of the "${subspaceName}" subspace, but`;
  if (!subspaceCatalogs) {
    throw new Error(`${reference} no PNPM catalogs were found for that subspace.`);
  } else if (!Object.prototype.hasOwnProperty.call(subspaceCatalogs, catalogName)) {
    throw new Error(`${reference} that subspace does not define a catalog named "${catalogName}".`);
  } else {
    throw new Error(
      `${reference} the "${catalogName}" catalog of that subspace does not have an entry for "${dependencyName}".`
    );
  }
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
    resolveOtherSubspaceCatalogReferences(pkg);
    rewriteRushProjectVersions(pkg.name, pkg.dependencies);
    rewriteRushProjectVersions(pkg.name, pkg.devDependencies);
    return userPnpmfile?.hooks?.readPackage ? userPnpmfile.hooks.readPackage(pkg, context) : pkg;
  },

  // Call the original pnpmfile (if it exists)
  filterLog: userPnpmfile?.hooks?.filterLog
};
