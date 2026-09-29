// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
import * as path from 'node:path';

import { Async, FileSystem, Path } from '@rushstack/node-core-library';
import {
  computeContextHashes,
  encodeResolverCache,
  sliceResolverCache,
  type IResolverCacheSlice
} from '@rushstack/resolver-cache';

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { Subspace } from '../../api/Subspace';
import { RushConstants } from '../RushConstants';
import { buildPnpmResolverCache, type IPnpmResolverCache } from './PnpmDependencyGraph';
import type { PnpmShrinkwrapFile } from './PnpmShrinkwrapFile';

/**
 * Options for {@link updateProjectDependencyGraphFilesAsync}.
 */
export interface IUpdateProjectDependencyGraphFilesOptions {
  rushConfiguration: RushConfiguration;
  subspace: Subspace;
  shrinkwrapFile: PnpmShrinkwrapFile;
}

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(crypto.createHash('sha256').update(data).digest());
}

/**
 * Gets the fully-qualified path to the `<project>/.rush/temp/dependency-graph.bin` file for the
 * specified project.
 */
export function getProjectDependencyGraphFilePathForProject(project: RushConfigurationProject): string {
  return `${project.projectRushTempFolder}/${RushConstants.projectDependencyGraphFilename}`;
}

/**
 * Writes the scoped dependency graph file for every project in a subspace.
 *
 * @remarks
 * Each project receives only the slice of the workspace graph that is reachable from it. This is
 * stricter than a single workspace-wide file: a project's file cannot even describe a package that
 * the project is unable to resolve, so an accidental dependency cannot hide behind an unrelated
 * entry. Computing a slice is a reachability filter followed by an index remap, so all of the
 * resolution work is shared across the whole subspace.
 *
 * The per-context hashes stored in the file are purely lockfile-derived. Project file contents are
 * deliberately out of scope; Rush detects those changes through the build graph instead.
 */
export async function updateProjectDependencyGraphFilesAsync(
  options: IUpdateProjectDependencyGraphFilesOptions
): Promise<void> {
  const { rushConfiguration, subspace, shrinkwrapFile } = options;

  const projects: ReadonlyArray<RushConfigurationProject> = subspace.getProjects();
  if (projects.length === 0) {
    return;
  }

  const lockfileFolder: string = Path.convertToSlashes(subspace.getSubspaceTempFolderPath());
  const basePath: string = `${Path.convertToSlashes(rushConfiguration.rushJsonFolder)}/`;

  const importerNames: Map<string, string> = new Map();
  const importerKeyByProject: Map<RushConfigurationProject, string> = new Map();
  for (const project of projects) {
    const importerKey: string = shrinkwrapFile.getImporterKeyByPath(lockfileFolder, project.projectFolder);
    importerNames.set(importerKey, project.packageName);
    importerKeyByProject.set(project, importerKey);
  }

  const { cache, ordinalByRoot }: IPnpmResolverCache = buildPnpmResolverCache({
    shrinkwrapFile,
    lockfileFolder,
    pnpmMajorVersion: parseInt(rushConfiguration.packageManagerToolVersion, 10) || 8,
    basePath,
    importerNames
  });

  const hashes: Uint8Array[] = computeContextHashes(cache, sha256);

  await Async.forEachAsync(
    projects,
    async (project: RushConfigurationProject) => {
      const filePath: string = getProjectDependencyGraphFilePathForProject(project);
      const importerKey: string = importerKeyByProject.get(project)!;
      const projectRoot: string = path.posix.normalize(path.posix.join(lockfileFolder, importerKey));
      const ordinal: number | undefined = ordinalByRoot.get(projectRoot);

      if (ordinal === undefined) {
        // The project is not present in the lockfile, e.g. it declares no dependencies.
        await FileSystem.deleteFileAsync(filePath, { throwIfNotExists: false });
        return;
      }

      const slice: IResolverCacheSlice = sliceResolverCache(cache, [ordinal]);
      const encoded: Uint8Array = encodeResolverCache({
        cache: slice.cache,
        hashes: slice.originalOrdinals.map((originalOrdinal: number) => hashes[originalOrdinal]),
        scoped: true
      });

      await FileSystem.writeFileAsync(filePath, Buffer.from(encoded), { ensureFolderExists: true });
    },
    { concurrency: 10 }
  );
}

/**
 * Deletes the dependency graph files for every project in a subspace.
 */
export async function deleteProjectDependencyGraphFilesAsync(subspace: Subspace): Promise<void> {
  await Async.forEachAsync(
    subspace.getProjects(),
    async (project: RushConfigurationProject) => {
      await FileSystem.deleteFileAsync(getProjectDependencyGraphFilePathForProject(project), {
        throwIfNotExists: false
      });
    },
    { concurrency: 10 }
  );
}
