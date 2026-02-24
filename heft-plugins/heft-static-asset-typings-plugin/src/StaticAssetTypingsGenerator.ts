// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';

import type {
  HeftConfiguration,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions,
  IHeftTaskSession,
  IWatchedFileState
} from '@rushstack/heft';
import { TypingsGenerator } from '@rushstack/typings-generator';
import { FileSystem, Sort } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type {
  IAssetPluginOptions,
  IBinaryStaticAssetTypingsConfigurationJson,
  ITextStaticAssetTypingsConfigurationJson,
  StaticAssetConfigurationFileLoader
} from './types';

// Use explicit \n to avoid platform-dependent line endings in template literals.
const DECLARATION: string = [
  '/**',
  ' * @public',
  ' */',
  'declare const content: string;',
  'export default content;',
  ''
].join('\n');

// Include a hash of DECLARATION so the cache is invalidated if the declaration content changes.
const PLUGIN_VERSION: string = `1-${createHash('sha1').update(DECLARATION).digest('hex').slice(0, 8)}`;

/**
 * Options for constructing a static asset typings generator
 */
export interface IStaticAssetGeneratorOptions {
  /**
   * A getter for the loader for the riggable config file in the project.
   */
  tryGetConfigAsync: StaticAssetConfigurationFileLoader;

  /**
   * The path to the build folder, normalized to use forward slashes as the directory separator.
   */
  slashNormalizedBuildFolderPath: string;

  /**
   * @param relativePath - The relative path of the file to get additional output files for.
   * @returns An array of output file names.
   */
  getAdditionalOutputFiles?: (relativePath: string) => string[];

  /**
   * @param relativePath - The relative path of the file being processed.
   * @param filePath - The absolute path of the file being processed.
   * @param oldVersion - The old version of the file, if any.
   * @returns The new version of the file, if emit should occur.
   */
  getVersionAndEmitOutputFilesAsync: (
    relativePath: string,
    filePath: string,
    oldVersion: string | undefined
  ) => Promise<string | undefined>;
}

export type IRunGeneratorOptions = IHeftTaskRunHookOptions &
  Partial<Pick<IHeftTaskRunIncrementalHookOptions, 'watchGlobAsync'>>;

export interface IStaticAssetTypingsGenerator {
  /**
   * Runs this generator in incremental mode.
   *
   * @param runOptions - The task run hook options from Heft
   * @returns A promise that resolves when the generator has finished processing.
   */
  runIncrementalAsync: (runOptions: IRunGeneratorOptions) => Promise<void>;
}

interface IStaticAssetTypingsBuildInfoFile {
  fileVersions: [string, string][];
  pluginVersion: string;
}

export async function tryGetConfigFromPluginOptionsAsync(
  terminal: ITerminal,
  buildFolder: string,
  rigConfig: HeftConfiguration['rigConfig'],
  options: IAssetPluginOptions<IBinaryStaticAssetTypingsConfigurationJson>,
  type: 'binary'
): Promise<IBinaryStaticAssetTypingsConfigurationJson | undefined>;
export async function tryGetConfigFromPluginOptionsAsync(
  terminal: ITerminal,
  buildFolder: string,
  rigConfig: HeftConfiguration['rigConfig'],
  options: IAssetPluginOptions<ITextStaticAssetTypingsConfigurationJson>,
  type: 'text'
): Promise<ITextStaticAssetTypingsConfigurationJson | undefined>;
export async function tryGetConfigFromPluginOptionsAsync(
  terminal: ITerminal,
  buildFolder: string,
  rigConfig: HeftConfiguration['rigConfig'],
  options: IAssetPluginOptions<
    IBinaryStaticAssetTypingsConfigurationJson | ITextStaticAssetTypingsConfigurationJson
  >,
  type: import('./getConfigFromConfigFileAsync').FileLoaderType
): Promise<
  IBinaryStaticAssetTypingsConfigurationJson | ITextStaticAssetTypingsConfigurationJson | undefined
> {
  if (options?.configType === 'inline') {
    return options.config;
  } else {
    const { getConfigFromConfigFileAsync } = await import('./getConfigFromConfigFileAsync');
    const { configFileName } = options;
    return getConfigFromConfigFileAsync(configFileName, type, terminal, buildFolder, rigConfig);
  }
}

/**
 * Constructs a typings generator for processing static assets
 *
 * @param taskSession - The Heft task session
 * @param rigConfig - The Heft configuration
 * @param options - Options for the generator
 * @returns
 */
export async function createTypingsGeneratorAsync(
  taskSession: IHeftTaskSession,
  options: IStaticAssetGeneratorOptions
): Promise<IStaticAssetTypingsGenerator | false> {
  const { tryGetConfigAsync, slashNormalizedBuildFolderPath } = options;

  const { terminal } = taskSession.logger;

  const configuration: IBinaryStaticAssetTypingsConfigurationJson | undefined =
    await tryGetConfigAsync(terminal);

  if (!configuration) {
    return false;
  }

  const {
    generatedTsFolders = ['temp/static-asset-ts'],
    sourceFolderPath = 'src',
    fileExtensions
  } = configuration;
  const resolvedGeneratedTsFolders: string[] | undefined = generatedTsFolders.map(
    (folder) => `${slashNormalizedBuildFolderPath}/${folder}`
  );
  const [generatedTsFolder, ...secondaryGeneratedTsFolders] = resolvedGeneratedTsFolders;

  const { getAdditionalOutputFiles, getVersionAndEmitOutputFilesAsync } = options;

  const fileVersions: Map<string, string> = new Map();

  const typingsGenerator: TypingsGenerator<boolean> = new TypingsGenerator<boolean>({
    srcFolder: `${slashNormalizedBuildFolderPath}/${sourceFolderPath}`,
    generatedTsFolder: `${slashNormalizedBuildFolderPath}/${generatedTsFolder}`,
    secondaryGeneratedTsFolders,
    fileExtensions,
    terminal,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    parseAndGenerateTypings: async (
      fileContents: boolean,
      filePath: string,
      relativePath: string
    ): Promise<string | undefined> => {
      const oldFileVersion: string | undefined = fileVersions.get(relativePath);
      const fileVersion: string | undefined = await getVersionAndEmitOutputFilesAsync(
        filePath,
        relativePath,
        oldFileVersion
      );
      if (fileVersion === undefined) {
        return;
      }

      fileVersions.set(relativePath, fileVersion);
      if (oldFileVersion) {
        // Since DECLARATION is constant, no point re-emitting the declarations just because the input content changed.
        return;
      }

      return DECLARATION;
    },
    readFile: (filePath: string, relativePath: string): boolean => {
      return false;
    },
    getAdditionalOutputFiles
  });

  const cacheFilePath: string = `${taskSession.tempFolderPath}/static-assets.json`;
  try {
    const cacheFileContent: string = await FileSystem.readFileAsync(cacheFilePath);
    const oldCacheFile: IStaticAssetTypingsBuildInfoFile = JSON.parse(cacheFileContent);
    if (oldCacheFile.pluginVersion === PLUGIN_VERSION) {
      for (const [relativePath, version] of oldCacheFile.fileVersions) {
        fileVersions.set(relativePath, version);
      }
    }
  } catch (e) {
    terminal.writeVerboseLine(`Failed to read cache file: ${e}`);
  }

  return {
    async runIncrementalAsync(runOptions: IRunGeneratorOptions): Promise<void> {
      await runTypingsGeneratorIncrementalAsync(
        taskSession,
        typingsGenerator,
        cacheFilePath,
        fileVersions,
        runOptions
      );
    }
  };
}

/**
 * Invokes the specified typings generator on any files changed since the last invocation.
 * If the cache file has been deleted (e.g. via a `--clean` run), will process all files.
 *
 * @param taskSession - The Heft task session.
 * @param typingsGenerator - The typings generator to invoke.
 * @param cacheFilePath - The path to the file that will contain the last build file version metadata.
 * @param fileVersions - The map of current file versions.
 * @param heftRunOptions - The task options from Heft.
 * @returns A promise that resolves when the typings generator has finished processing.
 */
async function runTypingsGeneratorIncrementalAsync(
  taskSession: IHeftTaskSession,
  typingsGenerator: TypingsGenerator<boolean>,
  cacheFilePath: string,
  fileVersions: Map<string, string>,
  heftRunOptions: IRunGeneratorOptions
): Promise<void> {
  const { terminal } = taskSession.logger;

  const originalFileVersions: ReadonlyMap<string, string> = new Map(fileVersions);

  // If we have the incremental options, use them to determine which files to process.
  // Otherwise, process all files. The typings generator also provides the file paths
  // as relative paths from the sourceFolderPath.
  let changedRelativeFilePaths: string[] | undefined;
  const { watchGlobAsync } = heftRunOptions as IHeftTaskRunIncrementalHookOptions;
  if (watchGlobAsync) {
    changedRelativeFilePaths = [];
    const relativeFilePaths: Map<string, IWatchedFileState> = await watchGlobAsync(
      typingsGenerator.inputFileGlob,
      {
        cwd: typingsGenerator.sourceFolderPath,
        ignore: Array.from(typingsGenerator.ignoredFileGlobs),
        absolute: false
      }
    );
    for (const [relativeFilePath, { changed }] of relativeFilePaths) {
      if (changed) {
        changedRelativeFilePaths.push(relativeFilePath);
      }
    }

    if (changedRelativeFilePaths.length === 0) {
      return;
    }
  }

  terminal.writeLine('Processing static assets...');
  await typingsGenerator.generateTypingsAsync(changedRelativeFilePaths);

  if (hasChanges(fileVersions, originalFileVersions)) {
    const fileVersionsArray: [string, string][] = Array.from(fileVersions);
    Sort.sortBy(fileVersionsArray, ([relativePath]) => relativePath);

    const buildFile: IStaticAssetTypingsBuildInfoFile = {
      fileVersions: fileVersionsArray,
      pluginVersion: PLUGIN_VERSION
    };
    await FileSystem.writeFileAsync(cacheFilePath, JSON.stringify(buildFile), { ensureFolderExists: true });
  }
  terminal.writeLine('Finished processing static assets.');
}

/**
 * @internal
 * Returns true if the current map has different entries than the old map.
 */
export function hasChanges(current: ReadonlyMap<string, string>, old: ReadonlyMap<string, string>): boolean {
  if (current.size !== old.size) {
    return true;
  }

  for (const [key, value] of current) {
    if (old.get(key) !== value) {
      return true;
    }
  }

  return false;
}
