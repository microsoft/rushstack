// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';
import worker_threads from 'node:worker_threads';

import type { ICallFrame, ICpuProfile, INodeSummary, IProfileSummary } from './types.ts';
import type { IMessageToWorker } from './protocol.ts';

interface ILocalTimeInfo {
  self: number;
  contributors: Set<number> | undefined;
}

/**
 * Computes an identifier to use for summarizing call frames.
 * @param callFrame - The call frame to compute the ID for
 * @returns A portable string identifying the call frame
 */
function computeCallFrameId(callFrame: ICallFrame): string {
  const { url, lineNumber, columnNumber, functionName } = callFrame;
  return `${url}\0${lineNumber}\0${columnNumber}\0${functionName}`;
}

/**
 * Adds the contents of a .cpuprofile file to a summary.
 * @param filePath - The path to the .cpuprofile file to read
 * @param accumulator - The summary to add the profile to
 */
function addFileToSummary(filePath: string, accumulator: IProfileSummary): void {
  const profile: ICpuProfile = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  addProfileToSummary(profile, accumulator);
}

/**
 * Adds a CPU profile to a summary.
 * @param profile - The profile to add
 * @param accumulator - The summary to add the profile to
 * @returns
 */
function addProfileToSummary(profile: ICpuProfile, accumulator: IProfileSummary): IProfileSummary {
  const { nodes, samples, timeDeltas, startTime, endTime }: ICpuProfile = profile;

  const localTimes: ILocalTimeInfo[] = [];
  const nodeIdToIndex: Map<number, number> = new Map();

  function getIndexFromNodeId(id: number): number {
    let index: number | undefined = nodeIdToIndex.get(id);
    if (index === undefined) {
      index = nodeIdToIndex.size;
      nodeIdToIndex.set(id, index);
    }
    return index;
  }

  for (let i: number = 0; i < nodes.length; i++) {
    localTimes.push({
      self: 0,
      contributors: undefined
    });

    const { id } = nodes[i];
    // Ensure that the mapping entry has been created.
    getIndexFromNodeId(id);
  }

  const duration: number = endTime - startTime;
  let lastNodeTime: number = duration - timeDeltas[0];
  for (let i: number = 0; i < timeDeltas.length - 1; i++) {
    const sampleDuration: number = timeDeltas[i + 1];
    const localTime: ILocalTimeInfo = localTimes[getIndexFromNodeId(samples[i])];
    localTime.self += sampleDuration;
    lastNodeTime -= sampleDuration;
  }

  localTimes[getIndexFromNodeId(samples[samples.length - 1])].self += lastNodeTime;

  // Have to pick the maximum totalTime for a given frame,
  const nodesByFrame: Map<string, Set<number>> = new Map();

  for (let i: number = 0; i < nodes.length; i++) {
    const { callFrame } = nodes[i];
    const frameId: string = computeCallFrameId(callFrame);

    const nodesForFrame: Set<number> | undefined = nodesByFrame.get(frameId);
    if (nodesForFrame) {
      nodesForFrame.add(i);
    } else {
      nodesByFrame.set(frameId, new Set([i]));
    }
  }

  for (const [frameId, contributors] of nodesByFrame) {
    // To compute the total time spent in a node, we need to sum the self time of all contributors.
    // We can't simply add up total times because a frame can recurse.
    let selfTime: number = 0;
    let totalTime: number = 0;

    let selfIndex: number | undefined;
    for (const contributor of contributors) {
      if (selfIndex === undefined) {
        // The first contributor to a frame will always be itself.
        selfIndex = contributor;
      }

      const localTime: ILocalTimeInfo = localTimes[contributor];
      selfTime += localTime.self;
    }

    const queue: Set<number> = new Set(contributors);
    for (const nodeIndex of queue) {
      totalTime += localTimes[nodeIndex].self;
      const { children } = nodes[nodeIndex];
      if (children) {
        for (const childId of children) {
          const childIndex: number = getIndexFromNodeId(childId);
          queue.add(childIndex);
        }
      }
    }

    const frame: INodeSummary | undefined = accumulator.get(frameId);
    if (!frame) {
      if (selfIndex === undefined) {
        throw new Error('selfIndex should not be undefined');
      }

      const {
        callFrame: { functionName, url, lineNumber, columnNumber }
      } = nodes[selfIndex];

      accumulator.set(frameId, {
        functionName,
        url,
        lineNumber,
        columnNumber,

        selfTime,
        totalTime
      });
    } else {
      frame.selfTime += selfTime;
      frame.totalTime += totalTime;
    }
  }

  return accumulator;
}

const { parentPort } = worker_threads;
if (parentPort) {
  const messageHandler = (message: IMessageToWorker): void => {
    if (message === false) {
      // Shutdown signal.
      parentPort.removeListener('message', messageHandler);
      parentPort.close();
      return;
    }

    try {
      const summary: IProfileSummary = new Map();
      addFileToSummary(message, summary);
      parentPort.postMessage({ file: message, data: summary });
    } catch (error) {
      parentPort.postMessage({
        file: message,
        data: error.stack || error.message
      });
    }
  };

  parentPort.on('message', messageHandler);
}
