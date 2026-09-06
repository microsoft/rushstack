// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonFile, LockFile, Path } from '@rushstack/node-core-library';
import type { ITerminalProvider } from '@rushstack/terminal';
import type { CommandLineAction } from '@rushstack/ts-command-line';

import { RushCommandLineParser } from '../cli/RushCommandLineParser';
import { PhasedScriptAction } from '../cli/scriptActions/PhasedScriptAction';
import type { GetInputsSnapshotAsyncFn, IInputsSnapshot } from '../logic/incremental/InputsSnapshot';
import type { IOperationGraph } from '../logic/operations/IOperationGraph';
import type { Operation, OperationEnabledState } from '../logic/operations/Operation';
import type { RushSession } from '../pluginFramework/RushSession';
import type { RushConfiguration } from './RushConfiguration';
import { RushUserConfiguration } from './RushUserConfiguration';

/**
 * A native phased command graph prepared without executing an iteration.
 * @alpha
 */
export interface IPhasedCommandEngine extends AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>;
  readonly operationGraph: IOperationGraph;
  readonly rushSession: RushSession;
  readonly inputsSnapshot: IInputsSnapshot;
  readonly getInputsSnapshotAsync: GetInputsSnapshotAsyncFn;
  readonly phaseNames: ReadonlyArray<string>;
  readonly pluginNames: ReadonlyArray<string>;
  readonly isIncremental: boolean;
}

/** Options for parsing a command for a long-lived engine host. @alpha */
export interface IParsePhasedCommandOptions {
  readonly argv: ReadonlyArray<string>;
  readonly cwd: string;
  readonly rushConfiguration: RushConfiguration;
  readonly terminalProvider: ITerminalProvider;
}

/**
 * A parsed native build/rebuild command. Parsing never runs scripts or changes cwd/process.env.
 *
 * @remarks
 * The initial engine surface deliberately rejects watch/install, event-hook scripts, .env files, and
 * externally supplied plugins or inherited/rig-based project configuration. Those require request-scoped initialization and asynchronous disposal
 * contracts before they can safely run in a shared process. Native graph/cache plugins are not replaced.
 * @alpha
 */
export class PhasedCommandEngine {
  private readonly _parser: RushCommandLineParser;
  private readonly _action: PhasedScriptAction;
  private _created: boolean = false;

  public readonly parameterIdentity: string;
  public readonly commandName: string;

  private constructor(parser: RushCommandLineParser, action: PhasedScriptAction) {
    this._parser = parser;
    this._action = action;
    this.commandName = action.actionName;
    this.parameterIdentity = action.getEngineParameterIdentity();
  }

  public static async parseAsync(options: IParsePhasedCommandOptions): Promise<PhasedCommandEngine> {
    const { rushConfiguration, terminalProvider, cwd, argv } = options;
    if (!Path.isUnderOrEqual(cwd, rushConfiguration.rushJsonFolder)) {
      throw new Error('The command working directory must be inside the daemon workspace.');
    }
    if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
      throw new Error('Command help must be handled by the native CLI, not by an engine request.');
    }
    if (rushConfiguration._rushPluginsConfiguration.configuration.plugins.length > 0) {
      throw new Error('Daemon engine execution does not yet support external Rush plugins. Use --no-daemon.');
    }
    for (const folder of [rushConfiguration.rushJsonFolder, RushUserConfiguration.getRushUserFolderPath()]) {
      if (FileSystem.exists(path.join(folder, '.env'))) {
        throw new Error('Daemon engine execution does not yet support .env initialization. Use --no-daemon.');
      }
    }
    for (const project of rushConfiguration.projects) {
      const configFolder: string = path.join(project.projectFolder, 'config');
      const projectConfigFile: string = path.join(configFolder, 'rush-project.json');
      const projectConfig: { extends?: unknown } | undefined = FileSystem.exists(projectConfigFile)
        ? JsonFile.load(projectConfigFile)
        : undefined;
      if (FileSystem.exists(path.join(configFolder, 'rig.json')) || projectConfig?.extends !== undefined) {
        throw new Error(
          `Inherited or rig-based project configuration for "${project.packageName}" requires --no-daemon.`
        );
      }
    }
    const parser: RushCommandLineParser = new RushCommandLineParser({
      cwd,
      engine: { rushConfiguration, terminalProvider }
    });
    await parser.executeWithoutErrorHandlingAsync([...argv]);
    const action: CommandLineAction | undefined = parser.selectedAction;
    if (!(action instanceof PhasedScriptAction) || !['build', 'rebuild'].includes(action.actionName)) {
      throw new Error('The production daemon engine currently supports native build and rebuild only.');
    }
    action.validateEngineCommand();
    return new PhasedCommandEngine(parser, action);
  }

  /**
   * Creates the all-project graph through the native CLI preparation pipeline.
   * Holds the native Rush lock until successful disposal; hosts must stop before native mutations.
   */
  public async createEngineAsync(): Promise<IPhasedCommandEngine> {
    if (this._created) {
      throw new Error('This parsed command has already created its engine.');
    }
    this._created = true;
    const lock: LockFile | undefined = LockFile.tryAcquire(
      this._parser.rushConfiguration.commonTempFolder,
      'rush'
    );
    if (!lock) throw new Error('Another Rush command is already running in this repository.');
    try {
      await this._parser.pluginManager.tryInitializeUnassociatedPluginsAsync();
      const engine: IPhasedCommandEngine = await this._action.createEngineAsync();
      let disposePromise: Promise<void> | undefined;
      const disposeAsync: () => Promise<void> = async () => {
        await engine[Symbol.asyncDispose]();
        lock.release();
      };
      return {
        ...engine,
        [Symbol.asyncDispose]: () => (disposePromise ??= disposeAsync())
      };
    } catch (error) {
      lock.release();
      throw error;
    }
  }

  /** Resolves native project/phase selection against an existing, compatible graph. */
  public async selectOperationsAsync(
    graph: IOperationGraph
  ): Promise<ReadonlyMap<Operation, OperationEnabledState>> {
    return await this._action.selectEngineOperationsAsync(graph);
  }
}
