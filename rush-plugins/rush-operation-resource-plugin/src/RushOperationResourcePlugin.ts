import type {
  IRushPlugin,
  IPhasedCommand,
  RushSession,
  RushConfiguration,
  ILogger,
  IOperationRunnerContext,
  IOperationExecutionResult,
  OperationStatus,
  Operation
} from '@rushstack/rush-sdk';
import { Stopwatch } from '@rushstack/rush-sdk/lib/utilities/Stopwatch';
import * as fs from 'fs';

export interface IRushOperationResourcePluginOptions {
  resourceConstraints?: IResourceConstraintConfig[];
  resourcePools?: IResourcePoolConfig[];
}

export interface IResourceConstraintConfig {
  appliesTo: {
    operationName?: string;
    phaseName?: string;
    packageName?: string;
    tagName?: string;
  };
  resourcePool: {
    poolName: string;
    envVarName?: string;
  };
}

export interface IResourcePoolConfig {
  poolName: string;
  resources?: string[];
  resourceCount?: number;
}

export interface IResourcePool {
  poolName: string;
  resources: string[];
}

export const RESOURCE_POOL_POLL_INTERVAL_MS = 500;
export const PLUGIN_NAME: string = 'RushOperationResourcePlugin';

export class RushOperationResourcePlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  private readonly _options: IRushOperationResourcePluginOptions;
  private readonly _checkedOutResources: Map<Operation, string>;
  private readonly _resourcePools: Map<string, IResourcePool>;

  public constructor(options: IRushOperationResourcePluginOptions) {
    this._options = options;
    this._checkedOutResources = new Map();
    this._resourcePools = new Map();
  }

  public apply(rushSession: RushSession, rushContext: RushConfiguration): void {
    const logger: ILogger = rushSession.getLogger(this.pluginName);

    this._validateOptions();

    rushSession.hooks.runAnyPhasedCommand.tapPromise(
      this.pluginName,
      async (command: IPhasedCommand): Promise<void> => {
        command.hooks.beforeExecuteOperation.tapPromise(
          this.pluginName,
          async (
            runnerContext: IOperationRunnerContext & IOperationExecutionResult
          ): Promise<OperationStatus | undefined> => {
            const constraint: IResourceConstraintConfig | undefined = this._getConstraintsForOperation(
              runnerContext.operation
            );

            if (constraint) {
              if (constraint.resourcePool) {
                const pool: IResourcePool = this._resourcePools.get(constraint.resourcePool.poolName)!;

                // Wait to obtain a resource from the resource pool for this constraint
                const resource: string = await this._obtainResource(pool, runnerContext.operation);

                // Pass this resource to the underlying operation using the specified
                // environment variable
                if (constraint.resourcePool.envVarName) {
                  const runner: any = runnerContext.operation.runner;
                  if (!runner.environment) {
                    runner.environment = {};
                  }
                  runner.environment[constraint.resourcePool.envVarName] = resource;
                }

                // Reset the stopwatch start time to account for the time spent waiting
                (runnerContext.stopwatch as Stopwatch).reset().start();

                // In "rush --debug" mode, log every time we assign a resource
                logger.terminal.writeVerboseLine(
                  `[${this.pluginName}] ${runnerContext.operation.associatedProject?.packageName} (${runnerContext.operation.associatedPhase?.name}) Assigned ${constraint.resourcePool.envVarName}=${resource} from pool ${pool.poolName}.`
                );
              }
            }

            return;
          }
        );

        command.hooks.afterExecuteOperation.tapPromise(
          this.pluginName,
          async (runnerContext: IOperationRunnerContext & IOperationExecutionResult): Promise<void> => {
            const constraint: IResourceConstraintConfig | undefined = this._getConstraintsForOperation(
              runnerContext.operation
            );

            if (constraint) {
              if (constraint.resourcePool) {
                const pool: IResourcePool = this._resourcePools.get(constraint.resourcePool.poolName)!;
                this._releaseResource(pool, runnerContext.operation);
              }
            }

            return;
          }
        );
      }
    );
  }

  private async _obtainResource(pool: IResourcePool, operation: Operation): Promise<string> {
    for (;;) {
      if (pool.resources.length > 0) {
        const resource = pool.resources.shift()!;
        this._checkedOutResources.set(operation, resource);
        return resource;
      }
      await new Promise((resolve) => setTimeout(resolve, RESOURCE_POOL_POLL_INTERVAL_MS));
    }
  }

  private _releaseResource(pool: IResourcePool, operation: Operation): void {
    const resource: string | undefined = this._checkedOutResources.get(operation);
    if (resource) {
      pool.resources.push(resource);
    } else {
      throw new Error(`Internal Error: Expected operation to have a checked out device but none was found.`);
    }
  }

  private _getConstraintsForOperation(operation: Operation): IResourceConstraintConfig | undefined {
    return this._options?.resourceConstraints?.find((constraint) => {
      if (constraint.appliesTo) {
        if (constraint.appliesTo.operationName && constraint.appliesTo.operationName !== operation.name) {
          return false;
        }
        if (
          constraint.appliesTo.phaseName &&
          constraint.appliesTo.phaseName !== operation.associatedPhase?.name
        ) {
          return false;
        }
        if (
          constraint.appliesTo.packageName &&
          constraint.appliesTo.packageName !== operation.associatedProject?.packageName
        ) {
          return false;
        }
        if (
          constraint.appliesTo.tagName &&
          !operation.associatedProject?.tags.has(constraint.appliesTo.tagName)
        ) {
          return false;
        }
      }
      return true;
    });
  }

  private _validateOptions(): void {
    for (const pool of this._options.resourcePools || []) {
      const resources = pool.resources || this._generateResources(pool.poolName, pool.resourceCount || 0);
      if (resources.length < 1) {
        throw new Error(
          `While initializing ${this.pluginName}, encountered resourcePool ${pool.poolName} with no defined resources.`
        );
      }
      if (this._resourcePools.get(pool.poolName)) {
        throw new Error(
          `While initializing ${this.pluginName}, encountered duplicate resourcePool ${pool.poolName}.`
        );
      }
      this._resourcePools.set(pool.poolName, {
        poolName: pool.poolName,
        resources
      });
    }

    for (const constraint of this._options.resourceConstraints || []) {
      if (constraint.resourcePool?.poolName && !this._resourcePools.get(constraint.resourcePool.poolName)) {
        throw new Error(
          `While initializing ${this.pluginName}, encountered resourceConstraint with undefined resourcePool ${constraint.resourcePool.poolName}.`
        );
      }
    }
  }

  private _generateResources(poolName: string, number: number): string[] {
    const resources: string[] = [];
    for (let i = 0; i < number; i++) {
      resources.push(`${poolName}-${i}`);
    }
    return resources;
  }
}

export default RushOperationResourcePlugin;
