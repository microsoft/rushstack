// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createInterface, Interface } from 'readline';
import {
  ITransferableOperation,
  ITransferableOperationStatus,
  PhasedCommandWorkerState
} from './RushWorker.types';
import { PhasedCommandWorkerController } from './RushWorkerHost';

/**
 * Demo for orchestrating the worker from a CLI process.
 */
async function runAsCli(): Promise<void> {
  const workerInterface: PhasedCommandWorkerController = new PhasedCommandWorkerController(
    process.argv.slice(3),
    {
      cwd: process.argv[2],
      onStatusUpdates: (statuses: ITransferableOperationStatus[]) => {
        for (const status of statuses) {
          console.log(
            `[HOST]: Status change: ${status.operation.name!} (${status.active ? 'active' : 'inactive'}) => ${
              status.status
            } (${status.hash})`
          );
        }
      },
      onStateChanged: (state: PhasedCommandWorkerState) => {
        console.log(`Worker state: ${state}`);
      }
    }
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

  const rl: Interface = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `> Select Build Targets> `
  });

  rl.on('SIGINT', () => {
    if (workerInterface.state === 'updating') {
      rl.close();
      return;
    }

    // Send abort
    console.log(`Aborting`);
    workerInterface.abort();
  });

  rl.prompt();
  for await (const line of rl) {
    if (line === 'exit') {
      rl.close();
      await workerInterface.shutdownAsync();
    } else if (line === 'abort') {
      workerInterface.abort();
    } else {
      const targets: string[] = line.split(/[, ]/g);
      const operations: ITransferableOperation[] = [];
      for (const target of targets) {
        const [project, phase] = target.split(';');
        operations.push({ project, phase });
      }

      workerInterface.update(operations);

      rl.prompt();
    }
  }
}

if (require.main === module) {
  runAsCli().catch(console.error);
}
