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

const END_TOKEN: string = '/package.json":';
const SUBPACKAGE_CACHE_FILE_VERSION: 1 = 1;

interface INestedPackageJsonCache {
  subPackagesByIntegrity: [string, string[] | boolean][];
  version: number;
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

  const pnpmStoreDir: string = `${rushConfiguration.pnpmOptions.pnpmStorePath}/v3/files/`;

  terminal.writeLine(`Using pnpm-lock from: ${lockFilePath}`);
  terminal.writeLine(`Using pnpm store folder: ${pnpmStoreDir}`);

  const lockFile: PnpmShrinkwrapFile | undefined = PnpmShrinkwrapFile.loadFromFile(lockFilePath, {
    withCaching: true
  });
  if (!lockFile) {
    throw new Error(`Failed to load shrinkwrap file: ${lockFilePath}`);
  }

  const workspaceRoot: string = subspace.getSubspaceTempFolderPath();

  const projectByImporterPath: LookupByPath<RushConfigurationProject> =
    rushConfiguration.getProjectLookupForRoot(workspaceRoot);

  const cacheFilePath: string = `${workspaceRoot}/resolver-cache.json`;
  const subPackageCacheFilePath: string = `${workspaceRoot}/subpackage-entry-cache.json`;

  terminal.writeLine(`Resolver cache will be written at ${cacheFilePath}`);

  let oldSubPackagesByIntegrity: Map<string, string[] | boolean> | undefined;
  const subPackagesByIntegrity: Map<string, string[] | boolean> = new Map();
  try {
    const cacheContent: string = await FileSystem.readFileAsync(subPackageCacheFilePath);
    const cacheJson: INestedPackageJsonCache = JSON.parse(cacheContent);
    if (cacheJson.version !== SUBPACKAGE_CACHE_FILE_VERSION) {
      terminal.writeLine(
        `Expected subpackage cache version ${SUBPACKAGE_CACHE_FILE_VERSION}, got ${cacheJson.version}`
      );
    } else {
      oldSubPackagesByIntegrity = new Map(cacheJson.subPackagesByIntegrity);
      terminal.writeLine(`Loaded subpackage cache from ${subPackageCacheFilePath}`);
    }
  } catch (err) {
    // Ignore
  }

  async function afterExternalPackagesAsync(
    contexts: Map<string, IResolverContext>,
    missingOptionalDependencies: Set<string>
  ): Promise<void> {
    /**
     * Loads the index file from the pnpm store to discover nested package.json files in an external package
     * For internal packages, assumes there are no nested package.json files.
     * @param context - The context to find nested package.json files for
     * @returns A promise that resolves to the nested package.json paths, false if the package fails to load, or true if the package has no nested package.json files.
     */
    async function tryFindNestedPackageJsonsForContextAsync(
      context: IResolverContext
    ): Promise<string[] | boolean> {
      const { descriptionFileRoot, descriptionFileHash } = context;

      if (descriptionFileHash === undefined) {
        // Assume this package has no nested package json files for now.
        terminal.writeDebugLine(
          `Package at ${descriptionFileRoot} does not have a file list. Assuming no nested "package.json" files.`
        );
        return true;
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
        let endIndex: number = indexContent.lastIndexOf(END_TOKEN);
        if (endIndex > 0) {
          const nestedPackageDirs: string[] = [];
          do {
            const startIndex: number = indexContent.lastIndexOf('"', endIndex);
            if (startIndex < 0) {
              throw new Error(
                `Malformed index file at ${indexPath}: missing starting quote for nested package.json path`
              );
            }
            const nestedPath: string = indexContent.slice(startIndex + 1, endIndex);
            nestedPackageDirs.push(nestedPath);
            endIndex = indexContent.lastIndexOf(END_TOKEN, startIndex - 1);
          } while (endIndex > 0);
          return nestedPackageDirs;
        }
        return true;
      } catch (error) {
        if (!context.optional) {
          throw new Error(
            `Error reading index file for: "${context.descriptionFileRoot}" (${descriptionFileHash}): ${error.toString()}`
          );
        }
        return false;
      }
    }
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
          `Package at ${descriptionFileRoot} does not have a file list. Assuming no nested "package.json" files.`
        );
        return;
      }

      let result: string[] | boolean | undefined =
        oldSubPackagesByIntegrity?.get(descriptionFileHash) ??
        subPackagesByIntegrity.get(descriptionFileHash);
      if (result === undefined) {
        result = await tryFindNestedPackageJsonsForContextAsync(context);
      }
      subPackagesByIntegrity.set(descriptionFileHash, result);
      if (result === true) {
        // Default case. Do nothing.
      } else if (result === false) {
        terminal.writeLine(`Trimming missing optional dependency at: ${descriptionFileRoot}`);
        contexts.delete(descriptionFileRoot);
        missingOptionalDependencies.add(descriptionFileRoot);
      } else {
        terminal.writeDebugLine(
          `Nested "package.json" files found for package at ${descriptionFileRoot}: ${result.join(', ')}`
        );
        // Clone this array to ensure that mutations don't affect the subpackage cache.
        // eslint-disable-next-line require-atomic-updates
        context.nestedPackageDirs = [...result];
      }
    }

    // For external packages, update the contexts with data from the pnpm store
    // This gives us the list of nested package.json files, as well as the actual package name
    // We could also cache package.json contents, but that proves to be inefficient.
    await Async.forEachAsync(contexts.values(), findNestedPackageJsonsForContextAsync, {
      concurrency: 20
    });
  }

  // Serialize this before `computeResolverCacheFromLockfileAsync` because bundledDependencies get removed
  // from the `nestedPackageDirs` array. We clone above for safety, but this is making doubly sure.
  const newSubPackageCache: INestedPackageJsonCache = {
    version: SUBPACKAGE_CACHE_FILE_VERSION,
    subPackagesByIntegrity: Array.from(subPackagesByIntegrity)
  };
  const serializedSubpackageCache: string = JSON.stringify(newSubPackageCache);
  const writeSubPackageCachePromise: Promise<void> = FileSystem.writeFileAsync(
    subPackageCacheFilePath,
    serializedSubpackageCache,
    {
      ensureFolderExists: true
    }
  );

  const cacheFile: IResolverCacheFile = await computeResolverCacheFromLockfileAsync({
    workspaceRoot,
    commonPrefixToTrim: rushRoot,
    platformInfo: getPlatformInfo(),
    projectByImporterPath,
    lockfile: lockFile,
    afterExternalPackagesAsync
  });

  const serialized: string = JSON.stringify(cacheFile);

  await Promise.all([
    FileSystem.writeFileAsync(cacheFilePath, serialized, {
      ensureFolderExists: true
    }),
    writeSubPackageCachePromise
  ]);

  terminal.writeLine(`Resolver cache written.`);
}
