// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  PhasedCommandEngine,
  PhasedCommandEngineBusyError,
  PhasedCommandEngineConfigurationChangedError,
  type IPhasedCommandEngine,
  type IInputsSnapshot,
  type IOperationGraph,
  type Operation,
  type OperationEnabledState
} from '@microsoft/rush-lib';
import type { IDaemonPhasedOperationSelection } from '@rushstack/rush-daemon-protocol';

import {
  DaemonRequestDispatchError,
  type IDaemonRequestResolver,
  type IResolveDaemonRequestOptions,
  type ResolvedDaemonRequest
} from './DaemonRequestDispatcher';
import {
  WorkspaceEngineComponentFactory,
  WorkspaceEngineRecreationRequiredError,
  type IMapWorkspaceInvalidationsOptions,
  type IWorkspaceEngineShape,
  type IWorkspaceInvalidationReconciliation
} from './WorkspaceEngineComponentFactory';
import type { IWorkspaceSession, IWorkspaceSessionComponents } from './WorkspaceSession';
import { EngineTerminalProvider } from './EngineTerminalProvider';

/**
 * Binds the standalone host to a real native build/rebuild graph on its first request.
 *
 * @remarks
 * A host is pinned to its first command and non-selection parameters. Incompatible parameters,
 * environments, or graph inputs are rejected before scheduling; no request is retried automatically.
 * The initial supported surface excludes external plugins, .env initialization, install/watch,
 * event-hook scripts, and rushx/global commands. Use the unchanged native CLI for those surfaces.
 * @beta
 */
export class ProductionDaemonRequestResolver implements IDaemonRequestResolver {
  #binding: Promise<void> | undefined;
  #parameterIdentity: string | undefined;
  #workspaceSession: IWorkspaceSession | undefined;
  readonly #environmentIdentity: string = environmentIdentity(process.env);

  public async resolveRequestAsync(options: IResolveDaemonRequestOptions): Promise<ResolvedDaemonRequest> {
    const { envelope, workspaceSession, abortSignal } = options;
    if (!['build', 'rebuild'].includes(envelope.commandName) || envelope.commandOrigin !== 'built-in') {
      throw new DaemonRequestDispatchError(
        'unsupported',
        'The production daemon requires an explicitly identified native build/rebuild request. Ambiguous custom/rushx requests require --no-daemon.'
      );
    }
    if (
      environmentIdentity(envelope.environment) !== this.#environmentIdentity ||
      environmentIdentity(process.env) !== this.#environmentIdentity
    ) {
      throw new DaemonRequestDispatchError(
        'unsupported',
        'The request environment differs from the daemon startup environment. Restart the daemon from this environment or use --no-daemon.'
      );
    }
    const terminal: EngineTerminalProvider = new EngineTerminalProvider();
    let command: PhasedCommandEngine;
    try {
      command = await PhasedCommandEngine.parseAsync({
        argv: envelope.argv,
        cwd: envelope.cwd,
        rushConfiguration: workspaceSession.rushConfiguration,
        terminalProvider: terminal
      });
    } catch (error) {
      throw new DaemonRequestDispatchError('unsupported', terminal.describeError(error), { cause: error });
    }
    if (command.commandName !== envelope.commandName) {
      throw new DaemonRequestDispatchError(
        'invalidRequest',
        'The command name does not match the native parsed argv.'
      );
    }
    if (abortSignal.aborted)
      throw new DaemonRequestDispatchError(
        'routingFailed',
        'The request was cancelled before engine initialization.'
      );
    if (this.#binding) {
      if (
        this.#parameterIdentity !== command.parameterIdentity ||
        this.#workspaceSession !== workspaceSession
      ) {
        throw new DaemonRequestDispatchError(
          'unsupported',
          'This warm engine is bound to different command parameters. Restart the daemon or use --no-daemon.'
        );
      }
    } else {
      this.#parameterIdentity = command.parameterIdentity;
      this.#workspaceSession = workspaceSession;
      const binding: Promise<void> = this.#bindAsync(command, terminal, workspaceSession);
      this.#binding = binding;
      void binding.catch((error: unknown) => {
        if (error instanceof PhasedCommandEngineBusyError && this.#binding === binding) {
          this.#binding = undefined;
          this.#parameterIdentity = undefined;
          this.#workspaceSession = undefined;
        }
      });
    }
    await this.#binding;
    const graph: IOperationGraph | undefined = workspaceSession.operationGraph;
    const shape: IWorkspaceEngineShape | undefined = workspaceSession.engineShape;
    if (!graph || !shape) throw new Error('Native engine initialization did not bind a workspace graph.');
    let selection: ReadonlyMap<Operation, OperationEnabledState>;
    try {
      selection = await command.selectOperationsAsync(graph);
    } catch (error) {
      throw new DaemonRequestDispatchError('invalidRequest', terminal.describeError(error), { cause: error });
    }
    const operationSelection: IDaemonPhasedOperationSelection[] = [];
    for (const [operation, enabledState] of selection) {
      if (enabledState !== false) operationSelection.push({ operationId: operation.name, enabledState });
    }
    return {
      kind: 'phased',
      exactSelection: true,
      request: {
        admission: envelope.admission,
        commandName: envelope.commandName,
        commandOrigin: envelope.commandOrigin,
        engineShape: shape,
        environment: envelope.environment,
        operationSelection,
        requestId: envelope.requestId,
        terminalRequirement: envelope.terminal.terminalRequirement
      }
    };
  }

  async #bindAsync(
    command: PhasedCommandEngine,
    terminal: EngineTerminalProvider,
    session: IWorkspaceSession
  ): Promise<void> {
    if (!session.initializeEngineAsync) throw new Error('This session cannot bind a native engine.');
    await session.initializeEngineAsync(async (options) => {
      let engine: IPhasedCommandEngine;
      try {
        engine = await command.createEngineAsync();
      } catch (error) {
        if (error instanceof PhasedCommandEngineBusyError) throw error;
        throw new Error(terminal.describeError(error), { cause: error });
      }
      try {
        terminal.attach(engine.operationGraph);
        const factory: WorkspaceEngineComponentFactory = new WorkspaceEngineComponentFactory({
          createEngineComponentsAsync: async () => ({
            ...engine,
            getInputsSnapshotAsync: async () => {
              let snapshot: IInputsSnapshot | undefined;
              try {
                snapshot = await engine.getInputsSnapshotAsync();
              } catch (error) {
                if (error instanceof PhasedCommandEngineConfigurationChangedError) {
                  throw new WorkspaceEngineRecreationRequiredError();
                }
                throw error;
              }
              if (snapshot) assertCompatibleInputs(engine.inputsSnapshot, snapshot);
              return snapshot;
            }
          }),
          shape: engine,
          refreshInputsOnEveryRequest: true,
          mapInvalidationsToOperationsAsync: async (invalidationOptions) =>
            getChangedOperations(invalidationOptions)
        });
        const components: IWorkspaceSessionComponents = await factory.createAsync(options);
        return {
          ...components,
          reconcileInvalidationsAsync: async () => {
            const result: IWorkspaceInvalidationReconciliation =
              await components.reconcileInvalidationsAsync!();
            if (!engine.isIncremental) engine.operationGraph.invalidateOperations(undefined, 'rebuild');
            return result;
          }
        };
      } catch (error) {
        try {
          await engine[Symbol.asyncDispose]();
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'Failed to initialize and dispose the native engine.'
          );
        }
        throw error;
      }
    });
  }
}

function environmentIdentity(environment: Readonly<Record<string, string | undefined>>): string {
  return JSON.stringify(
    Object.entries(environment)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function getChangedOperations(options: IMapWorkspaceInvalidationsOptions): Iterable<Operation> {
  const { currentInputsSnapshot: current, nextInputsSnapshot: next, operationGraph } = options;
  assertCompatibleInputs(current, next);
  return Array.from(operationGraph.operations).filter(
    (operation) =>
      current.getOperationOwnStateHash(operation.associatedProject, operation.associatedPhase.name) !==
      next.getOperationOwnStateHash(operation.associatedProject, operation.associatedPhase.name)
  );
}

function assertCompatibleInputs(current: IInputsSnapshot, next: IInputsSnapshot): void {
  const paths: Set<string> = new Set([...current.hashes.keys(), ...next.hashes.keys()]);
  for (const filePath of paths) {
    if (isGraphDefinitionPath(filePath) && current.hashes.get(filePath) !== next.hashes.get(filePath)) {
      throw new WorkspaceEngineRecreationRequiredError();
    }
  }
}

function isGraphDefinitionPath(filePath: string): boolean {
  const normalized: string = filePath.replace(/\\/g, '/');
  return (
    /(^|\/)config\//.test(normalized) ||
    ['rush.json', 'package.json', '.gitignore', '.npmrc', '.env', 'pnpm-lock.yaml'].includes(
      path.basename(filePath)
    )
  );
}
