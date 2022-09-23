// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createInterface, Interface } from 'readline';
import { OperationStatus } from '../logic/operations/OperationStatus';
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
    process.argv.slice(3),
    {
      cwd: process.argv[2],
      onStatusUpdate: (status: ITransferableOperationStatus) => {
        console.log(`[HOST]: Status change: ${status.operation.name!} => ${status.status} (${status.hash})`);
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

  let aborting: boolean = false;
  rl.on('SIGINT', () => {
    if (aborting) {
      rl.close();
      return;
    }

    // Send abort
    aborting = true;
    console.log(`Aborting`);
    workerInterface.abortAsync().then(() => {
      console.log(`Aborted.`);
      aborting = false;
    }, console.error);
  });

  rl.prompt();
  for await (const line of rl) {
    if (line === 'exit') {
      rl.close();
      await workerInterface.shutdownAsync();
    } else if (line === 'abort') {
      await workerInterface.abortAsync();
    } else {
      const targets: string[] = line.split(/[, ]/g);
      const operations: ITransferableOperation[] = [];
      for (const target of targets) {
        const [project, phase] = target.split(';');
        operations.push({ project, phase });
      }

      let toBeBuiltCount: number = 0;
      const activeGraph: ITransferableOperationStatus[] = await workerInterface.updateAsync(operations);
      for (const operation of activeGraph) {
        if (operation.status === OperationStatus.Ready) {
          toBeBuiltCount++;
        }
        console.log(`${operation.operation.name} @ ${operation.status}`);
      }
      console.log(`Build graph contains ${activeGraph.length} operations, ${toBeBuiltCount} pending`);

      rl.prompt();
    }
  }
}

if (require.main === module) {
  runAsCli().catch(console.error);
}
