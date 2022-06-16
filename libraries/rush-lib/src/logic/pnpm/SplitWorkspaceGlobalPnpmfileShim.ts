import path from 'path';

import type { IPackageJson } from '@rushstack/node-core-library';
import type {
  IPnpmfile,
  IPnpmfileContext,
  ISplitWorkspaceGlobalPnpmfileShimSettings,
  WorkspaceProjectInfo
} from './IPnpmfile';

const settings: ISplitWorkspaceGlobalPnpmfileShimSettings = require('./globalPnpmfileSettings.json');

// Rewrite rush project referenced in split workspace.
// For example: "project-a": "workspace:*" --> "project-a": "link:../../project-a"
function rewriteRushProjectVersions(
  packageName: string,
  dependencies: { [dependencyName: string]: string } | undefined
): void {
  if (!dependencies) {
    return;
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
    readPackage: (pkg: IPackageJson, _context: IPnpmfileContext) => {
      rewriteRushProjectVersions(pkg.name, pkg.dependencies);
      rewriteRushProjectVersions(pkg.name, pkg.devDependencies);
      return pkg;
    }
  }
};

export = splitWorkspaceGlobalPnpmfileShim;
