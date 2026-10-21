// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveExports, type PathConditions } from 'resolve-pkg-maps';

import { FileSystem, type IPackageJson } from '@rushstack/node-core-library';

const SASS_FILE_EXTENSIONS: ReadonlySet<string> = new Set(['.scss', '.sass', '.css']);

// IPackageJson does not currently cover arbitrary export conditions or nested fallback arrays.
export interface ISassPackageJson extends Omit<IPackageJson, 'exports'> {
  exports?: PathConditions;
  sass?: string;
  style?: string;
}

export interface ISassPackageExport {
  filePath: string;
  contents?: Buffer;
}

export async function resolveSassPackageExportsAsync(
  packageFolder: string,
  subpath: string,
  packageExports: PathConditions
): Promise<ISassPackageExport | undefined> {
  const subpaths: string[] = [subpath];
  // An explicit extension rules out Sass's index-file fallback.
  if (!path.posix.extname(subpath)) {
    subpaths.push(subpath ? `${subpath}/index` : 'index');
  }

  for (const candidateSubpath of subpaths) {
    const matches: Map<string, ISassPackageExport> = new Map();
    for (const candidate of getPackageExportCandidates(candidateSubpath)) {
      let targets: string[];
      try {
        targets = resolveExports(packageExports, candidate, ['sass', 'style']);
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
        ) {
          continue;
        } else {
          throw error;
        }
      }

      const isPattern: boolean =
        !!candidate && !Object.prototype.hasOwnProperty.call(packageExports, `./${candidate}`);
      for (const target of targets) {
        if (!target.startsWith('./')) {
          throw new Error(`Export "${target}" must be relative to the package root at "${packageFolder}".`);
        }

        const filePath: string = fileURLToPath(new URL(target, pathToFileURL(`${packageFolder}/`)));
        let contents: Buffer | undefined;
        if (isPattern) {
          try {
            contents = await FileSystem.readFileToBufferAsync(filePath);
          } catch (error) {
            if (FileSystem.isNotExistError(error)) {
              continue;
            } else {
              throw error;
            }
          }
        }

        matches.set(filePath, { filePath, contents });
        break;
      }
    }

    if (matches.size > 1) {
      throw new Error(
        `Ambiguous Sass exports for "${subpath || '.'}" in "${packageFolder}": ${[...matches.keys()].join(', ')}`
      );
    }

    for (const match of matches.values()) {
      if (!SASS_FILE_EXTENSIONS.has(path.extname(match.filePath))) {
        throw new Error(
          `The export for "${subpath || '.'}" in "${packageFolder}" resolved to "${match.filePath}", ` +
            'which is not a .scss, .sass, or .css file.'
        );
      }

      return match;
    }
  }

  return undefined;
}

function getPackageExportCandidates(subpath: string): string[] {
  if (!subpath) {
    return [''];
  }

  const candidates: string[] = [subpath];
  if (!SASS_FILE_EXTENSIONS.has(path.posix.extname(subpath))) {
    for (const extension of SASS_FILE_EXTENSIONS) {
      candidates.push(`${subpath}${extension}`);
    }
  }

  if (!path.posix.basename(subpath).startsWith('_')) {
    candidates.push(
      ...candidates.map((candidate) => {
        const dirname: string = path.posix.dirname(candidate);
        return `${dirname === '.' ? '' : `${dirname}/`}_${path.posix.basename(candidate)}`;
      })
    );
  }

  return candidates;
}
