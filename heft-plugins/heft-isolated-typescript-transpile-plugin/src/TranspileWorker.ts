// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { type MessagePort, parentPort, workerData } from 'node:worker_threads';

import { Async } from '@rushstack/node-core-library/lib/Async';
import type { Output } from '@swc/core';
import { transformFile } from '@swc/core/binding';

import type { IWorkerData, IWorkerResult, ITransformTask } from './types';

interface ISourceMap {
  version: 3;
  sources: string[];
  sourcesContent?: string[];
  sourceRoot?: string;
  names: string[];
  mappings: string;
}

if (!parentPort || !workerData) {
  throw new Error(`Expected to be run in a worker!`);
}

const definedParentPort: MessagePort = parentPort;

const { buildFolderPath, concurrency }: IWorkerData = workerData;

definedParentPort.on('message', handleMessageAsync);

async function handleMessageAsync(message: ITransformTask[] | false): Promise<void> {
  if (!message) {
    definedParentPort.off('message', handleMessageAsync);
    return;
  }

  const groupStart: number = performance.now();
  const tasks: ITransformTask[] = message;

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
      const { srcFilePath, relativeSrcFilePath, options, jsFilePath, mapFilePath } = task;

      let result: Output | undefined;

      const start: number = performance.now();

      try {
        result = await transformFile(srcFilePath, true, options);
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
          code += `\n//#sourceMappingUrl=./${basename(mapFilePath)}`;
          const parsedMap: ISourceMap = JSON.parse(map);
          parsedMap.sources[0] = relativeSrcFilePath;
          map = JSON.stringify(parsedMap);
          writeFileSync(`${buildFolderPath}${mapFilePath}`, map, 'utf8');
        }

        writeFileSync(`${buildFolderPath}${jsFilePath}`, code, 'utf8');
      }
    },
    {
      concurrency
    }
  );
  const groupEnd: number = performance.now();

  const result: IWorkerResult = {
    errors,
    timings,
    durationMs: groupEnd - groupStart
  };

  definedParentPort.postMessage(result);
}
