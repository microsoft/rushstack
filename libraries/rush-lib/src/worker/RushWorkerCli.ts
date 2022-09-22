// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createInterface, Interface } from 'readline';
import {
  ITransferableOperation,
  ITransferableOperationStatus,
  IPhasedCommandWorkerController
} from './RushWorker.types';
import { createPhasedCommandWorker } from './RushWorkerHost';

/**
 * Demo for orchestrating the worker from a CLI process.
 */
async function runAsCli(): Promise<void> {
  const workerInterface: IPhasedCommandWorkerController = await createPhasedCommandWorker(
    process.argv.slice(2)
  );

  const operations: ITransferableOperation[] = await workerInterface.getGraphAsync();
  const operationNames: string[] = operations
    .map(({ project, phase }) => {
      return `${project};${phase}`;
    })
    .sort();

  console.log(`Available Operations:`);
  for (const operation of operationNames) {
    console.log(` - ${operation}`);
  }

  workerInterface.onStatusUpdate = (status: ITransferableOperationStatus) => {
    console.log(`[HOST]: Status change: ${status.operation.name!} => ${status.status} (${status.hash})`);
  };

  const rl: Interface = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `Build Targets >`
  });

  rl.prompt();
  for await (const line of rl) {
    if (line === 'exit') {
      rl.close();
      await workerInterface.shutdownAsync();
    } else {
      const targets: string[] = line.split(/[, ]/g);
      const operations: ITransferableOperation[] = [];
      for (const target of targets) {
        const [project, phase] = target.split(';');
        operations.push({ project, phase });
      }

      await workerInterface.updateAsync(operations);

      rl.prompt();
    }
  }
}

if (require.main === module) {
  runAsCli().catch(console.error);
}
