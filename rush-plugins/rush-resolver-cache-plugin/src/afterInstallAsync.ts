// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';
import * as path from 'node:path';

import type {
  RushSession,
  RushConfiguration,
  RushConfigurationProject,
  ILogger,
  LookupByPath,
  Subspace
} from '@rushstack/rush-sdk';
import type {
  ISerializedResolveContext,
  IResolverCacheFile
} from '@rushstack/webpack-workspace-resolve-plugin';

import { Async, FileSystem, PnpmShrinkwrapFile } from './externals';

const MAX_LENGTH_WITHOUT_HASH: number = 120 - 26 - 1;
const BASE32: string[] = 'abcdefghijklmnopqrstuvwxyz234567'.split('');

// https://github.com/swansontec/rfc4648.js/blob/ead9c9b4b68e5d4a529f32925da02c02984e772c/src/codec.ts#L82-L118
function createBase32Hash(input: string): string {
  const data: Buffer = createHash('md5').update(input).digest();

  const mask: 0x1f = 0x1f;
  let out: string = '';

  let bits: number = 0; // Number of bits currently in the buffer
  let buffer: number = 0; // Bits waiting to be written out, MSB first
  for (let i: number = 0; i < data.length; ++i) {
    // eslint-disable-next-line no-bitwise
    buffer = (buffer << 8) | (0xff & data[i]);
    bits += 8;

    // Write out as much as we can:
    while (bits > 5) {
      bits -= 5;
      // eslint-disable-next-line no-bitwise
      out += BASE32[mask & (buffer >> bits)];
    }
  }

  // Partial character:
  if (bits) {
    // eslint-disable-next-line no-bitwise
    out += BASE32[mask & (buffer << (5 - bits))];
  }

  return out;
}

// https://github.com/pnpm/pnpm/blob/f394cfccda7bc519ceee8c33fc9b68a0f4235532/packages/dependency-path/src/index.ts#L167-L189
function depPathToFilename(depPath: string): string {
  let filename: string = depPathToFilenameUnescaped(depPath).replace(/[\\/:*?"<>|]/g, '+');
  if (filename.includes('(')) {
    filename = filename.replace(/(\)\()|\(/g, '_').replace(/\)$/, '');
  }
  if (filename.length > 120 || (filename !== filename.toLowerCase() && !filename.startsWith('file+'))) {
    return `${filename.substring(0, MAX_LENGTH_WITHOUT_HASH)}_${createBase32Hash(filename)}`;
  }
  return filename;
}

function depPathToFilenameUnescaped(depPath: string): string {
  if (depPath.indexOf('file:') !== 0) {
    if (depPath.startsWith('/')) {
      depPath = depPath.slice(1);
    }
    return depPath;
  }
  return depPath.replace(':', '+');
}

interface IResolverContext {
  descriptionFileRoot: string;
  descriptionFileHash: string | undefined;
  name: string;
  deps: Map<string, string>;
  isProject: boolean;
  ordinal: number;
  optional?: boolean;
  files?: string[];
}

type IDependencyEntry =
  | string
  | {
      version: string;
      specifier: string;
    };

export async function afterInstallAsync(
  rushSession: RushSession,
  rushConfiguration: RushConfiguration,
  subspace: Subspace,
  logger: ILogger
): Promise<void> {
  const { terminal } = logger;
  const rushRoot: string = `${rushConfiguration.rushJsonFolder}/`;

  const lockFile: string = subspace.getCommittedShrinkwrapFilename();
  const workspaceRoot: string = subspace.getSubspaceTempFolderPath();

  /**
   *
   * @param key - The key of the dependency
   * @param specifier - The specifier in the lockfile for the dependency
   * @param context - The owning package
   * @returns The identifier for the dependency
   */
  function resolveDependencyKey(key: string, specifier: string, context: IResolverContext): string {
    if (specifier.startsWith('/')) {
      return getDescriptionFileRootFromKey(specifier);
    } else if (specifier.startsWith('link:')) {
      if (context.isProject) {
        return path.resolve(context.descriptionFileRoot, specifier.slice(5));
      } else {
        return path.resolve(workspaceRoot, specifier.slice(5));
      }
    } else if (specifier.startsWith('file:')) {
      return getDescriptionFileRootFromKey(specifier, key);
    } else {
      return getDescriptionFileRootFromKey(`/${key}@${specifier}`);
    }
  }

  function resolveDependencies(
    collection: Record<string, IDependencyEntry>,
    context: IResolverContext
  ): void {
    for (const [key, value] of Object.entries(collection)) {
      const version: string = typeof value === 'string' ? value : value.version;
      const resolved: string = resolveDependencyKey(key, version, context);

      context.deps.set(key, resolved);
    }
  }

  const pnpmStoreDir: string = `${rushConfiguration.pnpmOptions.pnpmStorePath}/v3/files/`;
  const installRoot: string = `${workspaceRoot}/node_modules/.pnpm`;

  function getDescriptionFileRootFromKey(key: string, name?: string): string {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const packageName: string = key.startsWith('file:') ? name! : key.slice(1, key.indexOf('@', 2));

    const originFolder: string = `${installRoot}/${depPathToFilename(key)}/node_modules`;
    const descriptionFileRoot: string = `${originFolder}/${packageName}`;
    return descriptionFileRoot;
  }

  terminal.writeLine(`Using pnpm-lock from: ${lockFile}`);
  terminal.writeLine(`Using pnpm store folder: ${pnpmStoreDir}`);

  const shrinkwrapFile: PnpmShrinkwrapFile | undefined = PnpmShrinkwrapFile.loadFromFile(lockFile, {
    withCaching: true
  });
  if (!shrinkwrapFile) {
    throw new Error(`Failed to load shrinkwrap file: ${lockFile}`);
  }

  const cacheFilePath: string = `${workspaceRoot}/resolver-cache.json`;

  terminal.writeLine(`Resolver cache will be written at ${cacheFilePath}`);

  const contexts: Map<string, IResolverContext> = new Map();
  const missingOptionalDependencies: Set<string> = new Set();

  const projectByImporterPath: LookupByPath<RushConfigurationProject> =
    rushConfiguration.getProjectLookupForRoot(workspaceRoot);

  // Acquiring the libc version is a bit more obnoxious than platform and arch,
  // but all of them are ultimately on the same object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { platform, arch, glibcVersionRuntime } = (process.report?.getReport() as any)?.header ?? process;
  const libc: string = glibcVersionRuntime ? 'glibc' : 'musl';

  // Enumerate external dependencies first, to simplify looping over them for store data
  for (const [key, pack] of shrinkwrapFile.packages) {
    let name: string | undefined = pack.name;
    const descriptionFileRoot: string = getDescriptionFileRootFromKey(key, name);

    // Skip optional dependencies that are incompatible with the current environment
    if (pack.optional) {
      if (pack.os && !pack.os.some((value) => value.toLowerCase() === platform)) {
        missingOptionalDependencies.add(descriptionFileRoot);
        continue;
      }
      if (pack.cpu && !pack.cpu.some((value) => value.toLowerCase() === arch)) {
        missingOptionalDependencies.add(descriptionFileRoot);
        continue;
      }
      if (pack.libc && !pack.libc.some((value) => value.toLowerCase() === libc)) {
        missingOptionalDependencies.add(descriptionFileRoot);
        continue;
      }
    }

    const integrity: string | undefined = pack.resolution?.integrity;

    if (!name && key.startsWith('/')) {
      const versionIndex: number = key.indexOf('@', 2);
      name = key.slice(1, versionIndex);
    }

    if (!name) {
      throw new Error(`Missing name for ${key}`);
    }

    const context: IResolverContext = {
      descriptionFileRoot,
      descriptionFileHash: integrity,
      isProject: false,
      name,
      deps: new Map(),
      ordinal: contexts.size,
      optional: pack.optional
    };

    contexts.set(descriptionFileRoot, context);

    if (pack.dependencies) {
      resolveDependencies(pack.dependencies, context);
    }
    if (pack.optionalDependencies) {
      resolveDependencies(pack.optionalDependencies, context);
    }
  }

  // For external packages, update the contexts with data from the pnpm store
  // This gives us the list of nested package.json files, as well as the actual package name
  // We could also cache package.json contents, but that proves to be inefficient.
  await Async.forEachAsync(
    contexts.values(),
    async (context: IResolverContext) => {
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
          // eslint-disable-next-line require-atomic-updates
          context.files = filteredFiles.map((x) => x.slice(0, -13));
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
    },
    {
      concurrency: 20
    }
  );

  // Add the data for workspace projects
  for (const [importerPath, importer] of shrinkwrapFile.importers) {
    // Ignore the root project. This plugin assumes you don't have one.
    // A non-empty root project results in global dependency hoisting, and that's bad for strictness.
    if (importerPath === '.') {
      continue;
    }

    const project: RushConfigurationProject | undefined = projectByImporterPath.findChildPath(importerPath);
    if (!project) {
      throw new Error(`Missing project for importer ${importerPath}`);
    }

    const context: IResolverContext = {
      descriptionFileRoot: project.projectFolder,
      descriptionFileHash: undefined, // Not needed anymore
      name: project.packageJson.name,
      isProject: true,
      deps: new Map(),
      ordinal: contexts.size
    };

    contexts.set(project.projectFolder, context);

    if (importer.dependencies) {
      resolveDependencies(importer.dependencies, context);
    }
    if (importer.devDependencies) {
      resolveDependencies(importer.devDependencies, context);
    }
    if (importer.optionalDependencies) {
      resolveDependencies(importer.optionalDependencies, context);
    }
  }

  // Convert the intermediate representation to the final cache file
  const serializedContexts: ISerializedResolveContext[] = Array.from(
    contexts,
    ([descriptionFileRoot, context]: [string, IResolverContext]): ISerializedResolveContext => {
      const deps: ISerializedResolveContext['deps'] = {};
      for (const [key, contextRoot] of context.deps) {
        if (missingOptionalDependencies.has(contextRoot)) {
          continue;
        }

        const resolutionContext: IResolverContext | undefined = contexts.get(contextRoot);
        if (!resolutionContext) {
          throw new Error(`Missing context for ${contextRoot}!`);
        }
        deps[key] = resolutionContext.ordinal;
      }

      if (!context.name) {
        throw new Error(`Missing name for ${descriptionFileRoot}`);
      }

      const serializedContext: ISerializedResolveContext = {
        name: context.name,
        root: descriptionFileRoot.slice(rushRoot.length),
        dirInfoFiles: context.files,
        deps
      };

      return serializedContext;
    }
  );

  const cacheFile: IResolverCacheFile = {
    contexts: serializedContexts
  };

  const serialized: string = JSON.stringify(cacheFile);

  await FileSystem.writeFileAsync(cacheFilePath, serialized, {
    ensureFolderExists: true
  });
}
