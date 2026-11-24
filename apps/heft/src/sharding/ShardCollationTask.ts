// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IHeftTaskSession } from '../pluginFramework/HeftTaskSession';
import type { HeftConfiguration, HeftShardingConfiguration } from '../configuration/HeftConfiguration';
import { getShardTaskFolderPath } from './ShardIdentity';
import type {
  IShardCollationAdapter,
  IShardCollationSession,
  IShardCollationVerdict
} from './IShardCollationAdapter';
import {
  collateShardsAsync,
  createShardCollationError,
  releaseShardCollationSession
} from './ShardCollationRunner';

const HOOK_NAME: 'heft-shard-collation' = 'heft-shard-collation';

/**
 * Explicitly identifies the producing task, which may differ from the collation task.
 * @public
 */
export interface IShardCollationTaskOptions {
  /** The producer's configured phase name, not an action alias. */
  producerPhaseName: string;
  /** The producer's configured task name. */
  producerTaskName: string;
}

/**
 * Installs Heft-owned collation in the registering workload task.
 */
export class ShardCollationTask {
  #registered: boolean = false;

  public register(
    taskSession: Pick<IHeftTaskSession, 'parameters' | 'hooks' | 'logger'>,
    configuration: Pick<HeftConfiguration, 'buildFolderPath' | 'sharding'>,
    adapter: IShardCollationAdapter,
    options: IShardCollationTaskOptions
  ): void {
    if (this.#registered) {
      throw new Error('A Heft task requires exactly one collation adapter, not multiple adapters.');
    }
    if (taskSession.parameters.watch || taskSession.parameters.clean) {
      throw new Error(
        'Shard collation does not support watch mode or --clean. Clean in a separate preparation phase.'
      );
    }
    const sharding: HeftShardingConfiguration | undefined = configuration.sharding;
    if (sharding?.mode !== 'collate') {
      throw new Error('A shard collator may only be registered in Heft collation mode.');
    }
    const { producerPhaseName, producerTaskName } = options;
    getShardTaskFolderPath(sharding.shardParentFolder, producerPhaseName, producerTaskName);
    this.#registered = true;
    taskSession.hooks.run.tapPromise(HOOK_NAME, async ({ abortSignal }) => {
      let session: IShardCollationSession | undefined;
      let runnerCompleted: boolean = false;
      const errors: unknown[] = [];
      try {
        const verdict: IShardCollationVerdict = await collateShardsAsync(
          {
            buildFolderPath: configuration.buildFolderPath,
            shardParentFolderPath: sharding.shardParentFolderPath,
            shardFolderNameTemplate: sharding.shardFolderNameTemplate,
            shardCount: sharding.shardCount,
            producerPhaseName,
            producerTaskName,
            onSessionAcquired: (acquired) => {
              session = acquired;
            }
          },
          adapter,
          abortSignal
        );
        runnerCompleted = true;
        abortSignal.throwIfAborted();
        if (verdict.diagnosticCount > 0) {
          taskSession.logger.emitError(
            new Error(`Sharded run failed with ${verdict.diagnosticCount} diagnostics.`)
          );
        }
        abortSignal.throwIfAborted();
      } catch (error) {
        errors.push(error);
        // A successful runner return is still inside this task's cancellation boundary.
        if (runnerCompleted && session) {
          try {
            await session.prepareAsync();
          } catch (cleanupError) {
            errors.push(cleanupError);
            throw createShardCollationError(
              [error, cleanupError],
              'Shard collation and report cleanup both failed.'
            );
          }
        }
        throw error;
      } finally {
        if (session) releaseShardCollationSession(session, errors);
      }
    });
  }
}
