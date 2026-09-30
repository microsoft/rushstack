// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FileSystem, JsonFile, type JsonObject } from '@rushstack/node-core-library';

import type { RushConfiguration } from '../../api/RushConfiguration';
import { getEngineJsonFileLoadCache, JsonFileLoadCache, loadJsonFile } from '../JsonFileLoadCache';

interface IExample {
  items: number[];
}

function deriveExample(json: JsonObject): IExample {
  if (!Array.isArray(json.items)) {
    throw new Error('"items" must be an array');
  }
  return { items: json.items };
}

function getError(fn: () => unknown): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected an error');
}

describe(JsonFileLoadCache.name, () => {
  let folder: string;
  let filePath: string;
  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-json-file-load-cache-'));
    filePath = path.join(folder, 'example.json');
  });
  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('derives the value once while the text is unchanged, and returns a copy for each load', () => {
    fs.writeFileSync(filePath, '{ "items": [1, 2] }');
    const cache: JsonFileLoadCache = new JsonFileLoadCache();
    const derive: jest.Mock<IExample, [JsonObject]> = jest.fn(deriveExample);

    const first: IExample = cache.load(filePath, derive);
    first.items.push(3);
    const second: IExample = cache.load(filePath, derive);
    second.items.push(4);

    expect(cache.load(filePath, derive)).toEqual({ items: [1, 2] });
    expect(second).not.toBe(first);
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it('reads the file for every load, and derives the value again when the text changes', () => {
    fs.writeFileSync(filePath, '{ "items": [1] }');
    const cache: JsonFileLoadCache = new JsonFileLoadCache();
    const derive: jest.Mock<IExample, [JsonObject]> = jest.fn(deriveExample);
    const { mtime } = fs.statSync(filePath);

    expect(cache.load(filePath, derive)).toEqual({ items: [1] });
    // The same size and modification time, which a cache keyed by file stamps could miss.
    fs.writeFileSync(filePath, '{ "items": [2] }');
    fs.utimesSync(filePath, mtime, mtime);
    expect(cache.load(filePath, derive)).toEqual({ items: [2] });
    expect(derive).toHaveBeenCalledTimes(2);
  });

  it('throws the errors that JsonFile.load and the derivation throw, and caches no failed load', () => {
    const cache: JsonFileLoadCache = new JsonFileLoadCache();

    const expectedMissingError: Error = getError(() => JsonFile.load(filePath));
    const readFileSpy: jest.SpyInstance = jest.spyOn(FileSystem, 'readFile');
    const missingError: Error = getError(() => cache.load(filePath, deriveExample));
    expect(FileSystem.isNotExistError(missingError)).toBe(true);
    expect(missingError.message).toBe(expectedMissingError.message);
    // The cache does not read a missing file twice.
    expect(readFileSpy).toHaveBeenCalledTimes(1);

    const expectedFolderError: Error = getError(() => JsonFile.load(folder));
    expect(expectedFolderError.message).toContain('Error reading');
    expect(() => cache.load(folder, deriveExample)).toThrow(expectedFolderError.message);

    fs.writeFileSync(filePath, '{ "items": [1] ');
    const expectedParseError: Error = getError(() => JsonFile.load(filePath));
    expect(expectedParseError.message).toContain('Error reading');
    expect(() => cache.load(filePath, deriveExample)).toThrow(expectedParseError.message);

    fs.writeFileSync(filePath, '{ "items": 1 }');
    for (let i: number = 0; i < 2; i++) {
      expect(() => cache.load(filePath, deriveExample)).toThrow('"items" must be an array');
    }

    fs.writeFileSync(filePath, '{ "items": [1] }');
    expect(cache.load(filePath, deriveExample)).toEqual({ items: [1] });
  });

  it('keeps an entry for each file', () => {
    const otherFilePath: string = path.join(folder, 'other.json');
    fs.writeFileSync(filePath, '{ "items": [1] }');
    fs.writeFileSync(otherFilePath, '{ "items": [2] }');
    const cache: JsonFileLoadCache = new JsonFileLoadCache();
    const derive: jest.Mock<IExample, [JsonObject]> = jest.fn(deriveExample);

    for (let i: number = 0; i < 2; i++) {
      expect(cache.load(filePath, derive)).toEqual({ items: [1] });
      expect(cache.load(otherFilePath, derive)).toEqual({ items: [2] });
    }
    expect(derive).toHaveBeenCalledTimes(2);
  });
});

describe(loadJsonFile.name, () => {
  it('loads and derives the value for every call without a cache', () => {
    const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-json-file-load-cache-'));
    try {
      const filePath: string = path.join(folder, 'example.json');
      fs.writeFileSync(filePath, '{ "items": [1] }');
      const derive: jest.Mock<IExample, [JsonObject]> = jest.fn(deriveExample);
      expect(loadJsonFile(undefined, filePath, derive)).toEqual({ items: [1] });
      expect(loadJsonFile(undefined, filePath, derive)).toEqual({ items: [1] });
      expect(derive).toHaveBeenCalledTimes(2);

      const cache: JsonFileLoadCache = new JsonFileLoadCache();
      expect(loadJsonFile(cache, filePath, derive)).toEqual({ items: [1] });
      expect(loadJsonFile(cache, filePath, derive)).toEqual({ items: [1] });
      expect(derive).toHaveBeenCalledTimes(3);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe(getEngineJsonFileLoadCache.name, () => {
  it('shares one cache for each workspace configuration', () => {
    const configuration: RushConfiguration = {} as RushConfiguration;
    const otherConfiguration: RushConfiguration = {} as RushConfiguration;
    const cache: JsonFileLoadCache = getEngineJsonFileLoadCache(configuration);
    expect(getEngineJsonFileLoadCache(configuration)).toBe(cache);
    expect(getEngineJsonFileLoadCache(otherConfiguration)).not.toBe(cache);
  });
});
