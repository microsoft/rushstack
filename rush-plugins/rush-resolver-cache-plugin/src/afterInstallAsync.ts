// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  RushSession,
  RushConfiguration,
  RushConfigurationProject,
  ILogger,
  LookupByPath,
  Subspace
} from '@rushstack/rush-sdk';
import type { IResolverCacheFile } from '@rushstack/webpack-workspace-resolve-plugin';

import { Async, FileSystem, PnpmShrinkwrapFile } from './externals';
import {
  computeResolverCacheFromLockfileAsync,
  type IPlatformInfo
} from './computeResolverCacheFromLockfileAsync';
import type { IResolverContext } from './types';

/**
 * Gets information used to determine compatibility of optional dependencies.
 * @returns Information about the platform Rush is running on
 */
function getPlatformInfo(): IPlatformInfo {
  // Acquiring the libc version is a bit more obnoxious than platform and arch,
  // but all of them are ultimately on the same object.
  const {
    platform: os,
    arch: cpu,
    glibcVersionRuntime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = (process.report?.getReport() as any)?.header ?? process;
  const libc: 'glibc' | 'musl' = glibcVersionRuntime ? 'glibc' : 'musl';

  return {
    os,
    cpu,
    libc
  };
}

/**
 * Plugin entry point for after install.
 * @param rushSession - The Rush Session
 * @param rushConfiguration - The Rush Configuration
 * @param subspace - The subspace that was just installed
 * @param variant - The variant that was just installed
 * @param logger - The initialized logger
 */
export async function afterInstallAsync(
  rushSession: RushSession,
  rushConfiguration: RushConfiguration,
  subspace: Subspace,
  variant: string | undefined,
  logger: ILogger
): Promise<void> {
  const { terminal } = logger;
  const rushRoot: string = `${rushConfiguration.rushJsonFolder}/`;

  const lockFilePath: string = subspace.getCommittedShrinkwrapFilePath(variant);
  const workspaceRoot: string = subspace.getSubspaceTempFolderPath();

  const projectByImporterPath: LookupByPath<RushConfigurationProject> =
    rushConfiguration.getProjectLookupForRoot(workspaceRoot);

  const pnpmStoreDir: string = `${rushConfiguration.pnpmOptions.pnpmStorePath}/v3/files/`;

  terminal.writeLine(`Using pnpm-lock from: ${lockFilePath}`);
  terminal.writeLine(`Using pnpm store folder: ${pnpmStoreDir}`);

  const lockFile: PnpmShrinkwrapFile | undefined = PnpmShrinkwrapFile.loadFromFile(lockFilePath, {
    withCaching: true
  });
  if (!lockFile) {
    throw new Error(`Failed to load shrinkwrap file: ${lockFilePath}`);
  }

  const cacheFilePath: string = `${workspaceRoot}/resolver-cache.json`;

  terminal.writeLine(`Resolver cache will be written at ${cacheFilePath}`);

  async function afterExternalPackagesAsync(
    contexts: Map<string, IResolverContext>,
    missingOptionalDependencies: Set<string>
  ): Promise<void> {
    /**
     * Loads the index file from the pnpm store to discover nested package.json files in an external package
     * For internal packages, assumes there are no nested package.json files.
     * @param context - The context to find nested package.json files for
     * @returns A promise that resolves when the nested package.json files are found, if applicable
     */
    async function findNestedPackageJsonsForContextAsync(context: IResolverContext): Promise<void> {
      const { descriptionFileRoot, descriptionFileHash } = context;

      if (descriptionFileHash === undefined) {
        // Assume this package has no nested package json files for now.
        terminal.writeDebugLine(
          `Package at ${descriptionFileRoot} does not having a file list. Assuming no nested "package.json" files.`
        );
        return;
      }

      // Convert an integrity hash like
      // sha512-C6uiGQJ+Gt4RyHXXYt+v9f+SN1v83x68URwgxNQ98cvH8kxiuywWGP4XeNZ1paOzZ63aY3cTciCEQJNFUljlLw==
      // To its hex representation, e.g.
      // 0baba219027e1ade11c875d762dfaff5ff92375bfcdf1ebc511c20c4d43df1cbc7f24c62bb2c1618fe1778d675a5a3b367adda6377137220844093455258e52f
      const prefixIndex: number = descriptionFileHash.indexOf('-');
      const hash: string = Buffer.from(descriptionFileHash.slice(prefixIndex + 1), 'base64').toString('hex');

      // The pnpm store directory has index files of package contents at paths:
      // <store>/v3/files/<hash (0-2)>/<hash (2-)>-index.json
      // See https://github.com/pnpm/pnpm/blob/f394cfccda7bc519ceee8c33fc9b68a0f4235532/store/cafs/src/getFilePathInCafs.ts#L33
      const indexPath: string = `${pnpmStoreDir}${hash.slice(0, 2)}/${hash.slice(2)}-index.json`;

      try {
        const indexContent: string = await FileSystem.readFileAsync(indexPath);
        const { files } = JSON.parse(indexContent);

        const filteredFiles: string[] = Object.keys(files).filter((file) => file.endsWith('/package.json'));
        if (filteredFiles.length > 0) {
          const nestedPackageDirs: string[] = filteredFiles.map((x) =>
            x.slice(0, /* -'/package.json'.length */ -13)
          );

          if (nestedPackageDirs.length > 0) {
            // eslint-disable-next-line require-atomic-updates
            context.nestedPackageDirs = nestedPackageDirs;
          }
        }
      } catch (error) {
        if (!context.optional) {
          throw new Error(
            `Error reading index file for: "${context.descriptionFileRoot}" (${descriptionFileHash})`
          );
        } else {
          terminal.writeLine(`Trimming missing optional dependency at: ${descriptionFileRoot}`);
          contexts.delete(descriptionFileRoot);
          missingOptionalDependencies.add(descriptionFileRoot);
        }
      }
    }

    // For external packages, update the contexts with data from the pnpm store
    // This gives us the list of nested package.json files, as well as the actual package name
    // We could also cache package.json contents, but that proves to be inefficient.
    await Async.forEachAsync(contexts.values(), findNestedPackageJsonsForContextAsync, {
      concurrency: 20
    });
  }

  const cacheFile: IResolverCacheFile = await computeResolverCacheFromLockfileAsync({
    workspaceRoot,
    commonPrefixToTrim: rushRoot,
    platformInfo: getPlatformInfo(),
    projectByImporterPath,
    lockfile: lockFile,
    afterExternalPackagesAsync
  });

  const serialized: string = JSON.stringify(cacheFile);

  await FileSystem.writeFileAsync(cacheFilePath, serialized, {
    ensureFolderExists: true
  });
}
