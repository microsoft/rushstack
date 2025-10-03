// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, Path } from '@rushstack/node-core-library';

/**
 * Information about an incremental build. This information is used to determine which files need to be rebuilt.
 * @beta
 */
export interface IIncrementalBuildInfo {
  /**
   * A string that represents the configuration inputs for the build.
   * If the configuration changes, the old build info object should be discarded.
   */
  configHash: string;

  /**
   * A map of absolute input file paths to their version strings.
   * The version string should change if the file changes.
   */
  inputFileVersions: Map<string, string>;

  /**
   * A map of absolute output file paths to the input files they were computed from.
   */
  fileDependencies?: Map<string, string[]>;
}

/**
 * Serialized version of {@link IIncrementalBuildInfo}.
 * @beta
 */
export interface ISerializedIncrementalBuildInfo {
  /**
   * A string that represents the configuration inputs for the build.
   * If the configuration changes, the old build info object should be discarded.
   */
  configHash: string;

  /**
   * A map of input files to their version strings.
   * File paths are specified relative to the folder containing the build info file.
   */
  inputFileVersions: Record<string, string>;

  /**
   * Map of output file names to the corresponding index in `Object.entries(inputFileVersions)`.
   * File paths are specified relative to the folder containing the build info file.
   */
  fileDependencies?: Record<string, number[]>;
}

/**
 * Converts an absolute path to a path relative to a base path.
 */
export const makePathRelative: (absolutePath: string, basePath: string) => string =
  process.platform === 'win32'
    ? (absolutePath: string, basePath: string) => {
        // On Windows, need to normalize slashes
        return Path.convertToSlashes(path.win32.relative(basePath, absolutePath));
      }
    : (absolutePath: string, basePath: string) => {
        // On POSIX, can preserve existing slashes
        return path.posix.relative(basePath, absolutePath);
      };

/**
 * Serializes a build info object to a portable format that can be written to disk.
 * @param state - The build info to serialize
 * @param makePathPortable - A function that converts an absolute path to a portable path. This is a separate argument to support cross-platform tests.
 * @returns The serialized build info
 * @beta
 */
export function serializeBuildInfo(
  state: IIncrementalBuildInfo,
  makePathPortable: (absolutePath: string) => string
): ISerializedIncrementalBuildInfo {
  const fileIndices: Map<string, number> = new Map();
  const inputFileVersions: Record<string, string> = {};

  for (const [absolutePath, version] of state.inputFileVersions) {
    const relativePath: string = makePathPortable(absolutePath);
    fileIndices.set(absolutePath, fileIndices.size);
    inputFileVersions[relativePath] = version;
  }

  const { fileDependencies: newFileDependencies } = state;
  let fileDependencies: Record<string, number[]> | undefined;
  if (newFileDependencies) {
    fileDependencies = {};
    for (const [absolutePath, dependencies] of newFileDependencies) {
      const relativePath: string = makePathPortable(absolutePath);
      const indices: number[] = [];
      for (const dependency of dependencies) {
        const index: number | undefined = fileIndices.get(dependency);
        if (index === undefined) {
          throw new Error(`Dependency not found: ${dependency}`);
        }
        indices.push(index);
      }

      fileDependencies[relativePath] = indices;
    }
  }

  const serializedBuildInfo: ISerializedIncrementalBuildInfo = {
    configHash: state.configHash,
    inputFileVersions,
    fileDependencies
  };

  return serializedBuildInfo;
}

/**
 * Deserializes a build info object from its portable format.
 * @param serializedBuildInfo - The build info to deserialize
 * @param makePathAbsolute - A function that converts a portable path to an absolute path. This is a separate argument to support cross-platform tests.
 * @returns The deserialized build info
 */
export function deserializeBuildInfo(
  serializedBuildInfo: ISerializedIncrementalBuildInfo,
  makePathAbsolute: (relativePath: string) => string
): IIncrementalBuildInfo {
  const inputFileVersions: Map<string, string> = new Map();
  const absolutePathByIndex: string[] = [];
  for (const [relativePath, version] of Object.entries(serializedBuildInfo.inputFileVersions)) {
    const absolutePath: string = makePathAbsolute(relativePath);
    absolutePathByIndex.push(absolutePath);
    inputFileVersions.set(absolutePath, version);
  }

  let fileDependencies: Map<string, string[]> | undefined;
  const { fileDependencies: serializedFileDependencies } = serializedBuildInfo;
  if (serializedFileDependencies) {
    fileDependencies = new Map();
    for (const [relativeOutputFile, indices] of Object.entries(serializedFileDependencies)) {
      const absoluteOutputFile: string = makePathAbsolute(relativeOutputFile);
      const dependencies: string[] = [];
      for (const index of Array.isArray(indices) ? indices : [indices]) {
        const dependencyAbsolutePath: string | undefined = absolutePathByIndex[index];
        if (dependencyAbsolutePath === undefined) {
          throw new Error(`Dependency index not found: ${index}`);
        }
        dependencies.push(dependencyAbsolutePath);
      }
      fileDependencies.set(absoluteOutputFile, dependencies);
    }
  }

  const buildInfo: IIncrementalBuildInfo = {
    configHash: serializedBuildInfo.configHash,
    inputFileVersions,
    fileDependencies
  };

  return buildInfo;
}

/**
 * Writes a build info object to disk.
 * @param state - The build info to write
 * @param filePath - The file path to write the build info to
 * @beta
 */
export async function writeBuildInfoAsync(state: IIncrementalBuildInfo, filePath: string): Promise<void> {
  const basePath: string = path.dirname(filePath);

  const serializedBuildInfo: ISerializedIncrementalBuildInfo = serializeBuildInfo(
    state,
    (absolutePath: string) => {
      return makePathRelative(absolutePath, basePath);
    }
  );

  // This file is meant only for machine reading, so don't pretty-print it.
  const stringified: string = JSON.stringify(serializedBuildInfo);

  await FileSystem.writeFileAsync(filePath, stringified, { ensureFolderExists: true });
}

/**
 * Reads a build info object from disk.
 * @param filePath - The file path to read the build info from
 * @returns The build info object, or undefined if the file does not exist or cannot be parsed
 * @beta
 */
export async function tryReadBuildInfoAsync(filePath: string): Promise<IIncrementalBuildInfo | undefined> {
  let serializedBuildInfo: ISerializedIncrementalBuildInfo | undefined;
  try {
    const fileContents: string = await FileSystem.readFileAsync(filePath);
    serializedBuildInfo = JSON.parse(fileContents) as ISerializedIncrementalBuildInfo;
  } catch (error) {
    if (FileSystem.isNotExistError(error)) {
      return;
    }
    throw error;
  }

  const basePath: string = path.dirname(filePath);

  const buildInfo: IIncrementalBuildInfo = deserializeBuildInfo(
    serializedBuildInfo,
    (relativePath: string) => {
      return path.resolve(basePath, relativePath);
    }
  );

  return buildInfo;
}
