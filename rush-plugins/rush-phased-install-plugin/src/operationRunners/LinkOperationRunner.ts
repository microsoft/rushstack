// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';
import type { IOperationRunner, IOperationRunnerContext } from '@rushstack/rush-sdk';
import type { IDependencyMetadata } from '../types';
import { OperationStatus } from '../externals';

/**
 * Runner that creates the symbolic links / NTFS junctions between node_modules folders.
 */
export class LinkOperationRunner implements IOperationRunner {
  public readonly name: string;
  // Reporting timing here would be very noisy
  public readonly reportTiming: boolean = false;
  public silent: boolean = true;
  // Has side effects
  public isSkipAllowed: boolean = false;
  // Doesn't block cache writes
  public isCacheWriteAllowed: boolean = true;
  // Nothing will get logged, no point allowing warnings
  public readonly warningsAreAllowed: boolean = false;

  public readonly data: IDependencyMetadata;

  public constructor(name: string, metadata: IDependencyMetadata) {
    this.name = name;
    this.data = metadata;
    this.silent = true;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    try {
      const { originFolder } = this.data;
      await fs.promises.mkdir(originFolder, { recursive: true });
      await Promise.all(
        Array.from(this.data.deps, async ([key, { targetFolder }]) => {
          const slashIndex: number = key.indexOf('/');
          if (slashIndex >= 0) {
            // If this is a scoped package, reate the folder for the scope.
            // There may be some performance impact from the race condition on the scope folders.
            // Consider revisiting to do linking via synchronous calls in a worker thread to dedupe the folder code.
            const parent: string = `${originFolder}/${key.slice(0, slashIndex)}`;
            await fs.promises.mkdir(parent, { recursive: true });
          }
          await fs.promises.symlink(targetFolder, `${originFolder}/${key}`, 'junction');
        })
      );
      return OperationStatus.Success;
    } catch (err) {
      context.collatedWriter.terminal.writeStderrLine(
        `link "${this.data.originFolder}" failed with: ${err.toString()}`
      );
      this.silent = false;
      return OperationStatus.Failure;
    }
  }
}
