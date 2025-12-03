// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

import type { Output } from '@swc/core';
import { transformFile } from '@swc/core/binding';

import { Async } from '@rushstack/node-core-library/lib/Async';

import type { IWorkerResult, ITransformTask, ITransformModulesRequestMessage } from './types';

interface ISourceMap {
  version: 3;
  sources: string[];
  sourcesContent?: string[];
  sourceRoot?: string;
  names: string[];
  mappings: string;
}

const [buildFolderPath, concurrency] = process.argv.slice(-2);

if (!buildFolderPath) {
  throw new Error(`buildFolderPath argument not provided to child_process`);
}

const handleMessageAsync = async (message: ITransformModulesRequestMessage | false): Promise<void> => {
  if (!message) {
    process.off('message', handleMessageAsync);
    return;
  }

  const groupStart: number = performance.now();
  const { tasks, options } = message;

  const optionsBuffers: Buffer[] = options.map((option) => Buffer.from(option));

  const timings: [string, number][] = [];
  const errors: [string, string][] = [];

  const createdFolders: Set<string> = new Set();

  function createFolder(folderPath: string): void {
    if (!createdFolders.has(folderPath)) {
      mkdirSync(`${buildFolderPath}/${folderPath}`, { recursive: true });
      createdFolders.add(folderPath);
      let slashIndex: number = folderPath.lastIndexOf('/');
      while (slashIndex >= 0) {
        folderPath = folderPath.slice(0, slashIndex);
        createdFolders.add(folderPath);
        slashIndex = folderPath.lastIndexOf('/');
      }
    }
  }

  await Async.forEachAsync(
    tasks,
    async (task: ITransformTask) => {
      const { srcFilePath, relativeSrcFilePath, optionsIndex, jsFilePath, mapFilePath } = task;

      let result: Output | undefined;

      const start: number = performance.now();

      try {
        result = await transformFile(srcFilePath, true, optionsBuffers[optionsIndex]);
      } catch (error) {
        errors.push([jsFilePath, error.stack ?? error.toString()]);
        return;
      } finally {
        const end: number = performance.now();
        timings.push([jsFilePath, end - start]);
      }

      if (result) {
        createFolder(dirname(jsFilePath));

        let { code, map } = result;

        if (mapFilePath && map) {
          code += `\n//# sourceMappingURL=./${basename(mapFilePath)}`;
          const parsedMap: ISourceMap = JSON.parse(map);
          parsedMap.sources[0] = relativeSrcFilePath;
          map = JSON.stringify(parsedMap);
          writeFileSync(`${buildFolderPath}/${mapFilePath}`, map, 'utf8');
        }

        writeFileSync(`${buildFolderPath}/${jsFilePath}`, code, 'utf8');
      }
    },
    {
      concurrency: parseInt(concurrency, 10)
    }
  );
  const groupEnd: number = performance.now();

  const result: IWorkerResult = {
    errors,
    timings,
    durationMs: groupEnd - groupStart
  };

  if (!process.send) {
    throw new Error(`process.send is not available in process`);
  }
  process.send(result);
};

process.on('message', handleMessageAsync);
