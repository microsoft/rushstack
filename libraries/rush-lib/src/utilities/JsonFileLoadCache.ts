// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, type JsonObject } from '@rushstack/node-core-library';

import type { RushConfiguration } from '../api/RushConfiguration';

interface ICacheEntry {
  readonly text: string;
  readonly value: unknown;
}

/**
 * Memoizes what a long-lived engine host derives from each JSON configuration file, keyed by the file's text.
 *
 * @remarks
 * The host parses a command line for every request, and each parse loads the same files: command-line.json, each
 * plugin's manifest and command-line.json, and the package.json of each autoinstaller that a command names. Parsing
 * and validating them costs several times what reading them does. A load through this cache still reads the file,
 * so it sees the file as it is now, but it parses the text and derives the value again only if the text differs from
 * the text of the file's last successful load. Each load returns its own copy of the value.
 */
export class JsonFileLoadCache {
  readonly #entries: Map<string, ICacheEntry> = new Map();

  /**
   * Returns `deriveValue(JsonFile.load(filePath))`, and throws the errors that it would throw.
   *
   * @param deriveValue - Validates and transforms the file's contents. Its result must depend only on its argument
   * (and on values that never change, such as the file path), and it must not keep a reference to its result.
   */
  public load<T>(filePath: string, deriveValue: (json: JsonObject) => T): T {
    let text: string;
    let value: T;
    try {
      text = FileSystem.readFile(filePath);
      const entry: ICacheEntry | undefined = this.#entries.get(filePath);
      if (entry?.text === text) {
        return structuredClone(entry.value) as T;
      }
      value = deriveValue(JsonFile.parseString(text));
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        // JsonFile.load throws this error as it is.
        throw error;
      }
      // Load the file as a caller without this cache does, so that the error and its message are the same.
      return deriveValue(JsonFile.load(filePath));
    }
    this.#entries.set(filePath, { text, value: structuredClone(value) });
    return value;
  }
}

/**
 * Returns `deriveValue(JsonFile.load(filePath))`, through the cache if there is one.
 */
export function loadJsonFile<T>(
  cache: JsonFileLoadCache | undefined,
  filePath: string,
  deriveValue: (json: JsonObject) => T
): T {
  return cache ? cache.load(filePath, deriveValue) : deriveValue(JsonFile.load(filePath));
}

const cachesByRushConfiguration: WeakMap<RushConfiguration, JsonFileLoadCache> = new WeakMap();

/**
 * The cache that every command line which a long-lived engine host parses for one workspace configuration shares.
 */
export function getEngineJsonFileLoadCache(rushConfiguration: RushConfiguration): JsonFileLoadCache {
  let cache: JsonFileLoadCache | undefined = cachesByRushConfiguration.get(rushConfiguration);
  if (!cache) {
    cache = new JsonFileLoadCache();
    cachesByRushConfiguration.set(rushConfiguration, cache);
  }
  return cache;
}
