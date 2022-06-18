import path from 'path';

import type { IPackageJson } from '@rushstack/node-core-library';
import type {
  IPnpmfile,
  IPnpmfileContext,
  ISplitWorkspaceGlobalPnpmfileShimSettings,
  WorkspaceProjectInfo
} from './IPnpmfile';

let splitWorkspaceGlobalPnpmfileShimSettings: ISplitWorkspaceGlobalPnpmfileShimSettings | undefined;

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
  if (!splitWorkspaceGlobalPnpmfileShimSettings) {
    // Initialize the settings from file
    if (!context.splitWorkspaceGlobalPnpmfileShimSettings) {
      context.splitWorkspaceGlobalPnpmfileShimSettings = require('./globalPnpmfileSettings.json');
    }
    splitWorkspaceGlobalPnpmfileShimSettings = context.splitWorkspaceGlobalPnpmfileShimSettings!;
  } else if (!context.splitWorkspaceGlobalPnpmfileShimSettings) {
    // Reuse the already initialized settings
    context.splitWorkspaceGlobalPnpmfileShimSettings = splitWorkspaceGlobalPnpmfileShimSettings;
  }
  // Return the normalized context
  return context as IPnpmfileContext;
}

// Rewrite rush project referenced in split workspace.
// For example: "project-a": "workspace:*" --> "project-a": "link:../../project-a"
function rewriteRushProjectVersions(
  context: IPnpmfileContext,
  packageName: string,
  dependencies: { [dependencyName: string]: string } | undefined
): void {
  if (!dependencies) {
    return;
  }

  const { splitWorkspaceGlobalPnpmfileShimSettings: settings } = context;
  if (!settings) {
    throw new Error(`splitWorkspaceGlobalPnpmfileShimSettings not initialized`);
  }

  const splitWorkspaceProject: WorkspaceProjectInfo | undefined =
    settings.splitWorkspaceProjects[packageName];
  if (!splitWorkspaceProject) {
    return;
  }

  for (const dependencyName of Object.keys(dependencies)) {
    const workspaceProjectInfo: WorkspaceProjectInfo | undefined = settings.workspaceProjects[dependencyName];
    if (!workspaceProjectInfo) {
      continue;
    }

    const currentVersion: string = dependencies[dependencyName];
    if (!currentVersion.startsWith('workspace:')) {
      continue;
    }

    // FIXME: Is it necessary to check version range here?
    // const versionRange: string = currentVersion.slice('workspace:'.length);
    // if (semver && versionRange !== '*') {
    //   if (!semver.satisfies(workspaceProjectInfo.packageVersion, versionRange)) {
    //   };
    // }

    const relativePath: string = path.relative(
      splitWorkspaceProject.projectRelativeFolder,
      workspaceProjectInfo.projectRelativeFolder
    );
    const newVersion: string = 'link:' + relativePath;
    dependencies[dependencyName] = newVersion;
  }
}

const splitWorkspaceGlobalPnpmfileShim: IPnpmfile = {
  hooks: {
    readPackage: (pkg: IPackageJson, context: IPnpmfileContext) => {
      context = init(context);
      rewriteRushProjectVersions(context, pkg.name, pkg.dependencies);
      rewriteRushProjectVersions(context, pkg.name, pkg.devDependencies);
      return pkg;
    }
  }
};

export = splitWorkspaceGlobalPnpmfileShim;
