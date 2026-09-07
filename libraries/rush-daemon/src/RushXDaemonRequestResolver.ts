// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { EOL } from 'node:os';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import {
  EnvironmentConfiguration,
  daemonEnvironmentVariables,
  RushConfiguration,
  RushXCommand,
  type IRushXCommandLineArguments
} from '@microsoft/rush-lib';
import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import { Terminal, TerminalProviderSeverity, type ITerminal } from '@rushstack/terminal';

import {
  DaemonRequestDispatchError,
  type IDaemonRequestResolver,
  type IResolveDaemonRequestOptions,
  type ResolvedDaemonRequest
} from './DaemonRequestDispatcher';
import { resolveGlobalCommandRequest, resolveGlobalCommandWorkingDirectory } from './GlobalCommandRequest';
import type { GlobalCommandExecutor } from './GlobalCommandRequestRouter';
import type { IGlobalCommandExecutionContext } from './GlobalCommandExecutionContext';

/**
 * Runs explicitly tagged Rushx scripts through native parsing and lifecycle preparation.
 *
 * @remarks
 * No workspace graph or Rush CLI subprocess is constructed. The global execution context owns the actual
 * package script's shell, streams and process tree. Process-global hook/configuration cases reject before input admission.
 * @beta
 */
export class RushXDaemonRequestResolver implements IDaemonRequestResolver {
  readonly #startupEnvironment: NodeJS.ProcessEnv = { ...process.env };
  readonly #requestLocalRushVariables: ReadonlySet<string> = new Set([
    ...Object.values(daemonEnvironmentVariables), 'RUSH_DAEMON_EXPERIMENTAL', 'RUSH_INVOKED_FOLDER', 'RUSH_QUIET_MODE'
  ]);

  public async resolveRequestAsync(options: IResolveDaemonRequestOptions): Promise<ResolvedDaemonRequest> {
    const { envelope, workspaceSession, abortSignal } = options;
    if (envelope.invocationKind !== 'rushx') {
      throw new DaemonRequestDispatchError('unsupported', 'This resolver requires an explicit Rushx invocation.');
    }
    if (envelope.commandOrigin !== 'custom') {
      throw new DaemonRequestDispatchError('invalidRequest', 'A Rushx script cannot claim built-in Rush origin.');
    }
    let cwd: string;
    try {
      cwd = resolveGlobalCommandRequest({
        ...envelope, terminal: { ...envelope.terminal, columns: envelope.terminal.columns }
      }, workspaceSession).cwd;
      resolveGlobalCommandWorkingDirectory(RushXCommand.getPackageFolder(cwd), workspaceSession);
    } catch (error) {
      throw new DaemonRequestDispatchError('invalidRequest', (error as Error).message, { cause: error });
    }
    const args: IRushXCommandLineArguments = RushXCommand.parseArguments(envelope.argv, envelope.environment);
    if (args.commandName !== envelope.commandName) {
      throw new DaemonRequestDispatchError('invalidRequest', 'The command name does not match native Rushx argv.');
    }
    const configuration: RushConfiguration = workspaceSession.rushConfiguration;
    let environment: NodeJS.ProcessEnv;
    try {
      const rushJsonPath: string | undefined = RushConfiguration.tryFindRushJsonLocation({
        startingFolder: cwd, showVerbose: false
      });
      if (!rushJsonPath || fs.realpathSync.native(rushJsonPath) !== fs.realpathSync.native(configuration.rushJsonFile)) {
        throw new Error('The governing Rush configuration differs from this daemon workspace.');
      }
      assertCurrentConfiguration(configuration);
      environment = RushXCommand.prepareEnvironment(cwd, envelope.environment, rushJsonPath);
      this.#validateConfigurationEnvironment(environment);
      const reason: string | undefined = RushXCommand.getInProcessReason(args, environment, configuration);
      if (reason) throw new Error(reason);
    } catch (error) {
      throw new DaemonRequestDispatchError('unsupported', (error as Error).message, { cause: error });
    }
    abortSignal.throwIfAborted();
    const executeAsync: GlobalCommandExecutor = async (context) => {
      try {
        assertCurrentConfiguration(configuration);
      } catch (error) {
        context.terminal.writeErrorLine((error as Error).message);
        throw error;
      }
      return {
        exitCode: await RushXCommand.executeAsync({
          arguments: args,
          cwd,
          environment,
          rushConfiguration: configuration,
          terminal: createRushXTerminal(context, args.isDebug),
          consoleTerminal: new Terminal({
            supportsColor: true,
            eolCharacter: '\n',
            write: (data, severity) => context.writeOutput(
              severity === TerminalProviderSeverity.error || severity === TerminalProviderSeverity.warning
                ? 'stderr' : 'stdout',
              Buffer.from(data)
            )
          }),
          launchOptions: { isManaged: true },
          abortSignal: context.abortSignal,
          spawn: (command, childArgs, spawnOptions) => {
            if (typeof spawnOptions.cwd !== 'string' || !spawnOptions.env) {
              throw new Error('Native Rushx did not supply a complete child cwd/environment.');
            }
            const child: ChildProcessWithoutNullStreams = context.spawnChild(command, childArgs, {
              cwd: spawnOptions.cwd,
              environment: spawnOptions.env,
              shell: spawnOptions.shell,
              forwardInput: envelope.terminal.acceptsStdin === true
            });
            if (!envelope.terminal.acceptsStdin) child.stdin.end();
            return child;
          }
        })
      };
    };
    return { kind: 'global', executor: executeAsync };
  }

  #validateConfigurationEnvironment(environment: NodeJS.ProcessEnv): void {
    const quiet: string | undefined = environment.RUSH_QUIET_MODE;
    if (quiet !== 'true' && quiet !== 'false') {
      EnvironmentConfiguration.parseBooleanEnvironmentVariable('RUSH_QUIET_MODE', quiet);
    }
    const names: Set<string> = new Set([...Object.keys(this.#startupEnvironment), ...Object.keys(environment)]);
    for (const name of names) {
      if (
        name.startsWith('RUSH_') &&
        !this.#requestLocalRushVariables.has(name) &&
        environment[name] !== this.#startupEnvironment[name]
      ) {
        throw new Error(`Changed ${name} requires native Rush environment initialization before Rushx execution.`);
      }
    }

  }
}

function assertCurrentConfiguration(configuration: RushConfiguration): void {
  const current: RushConfiguration['rushConfigurationJson'] = JsonFile.load(configuration.rushJsonFile);
  let experiments: unknown;
  try {
    experiments = JsonFile.load(path.join(configuration.commonRushConfigFolder, 'experiments.json'));
  } catch (error) {
    if (!FileSystem.isNotExistError(error)) throw error;
    experiments = {};
  }
  if (
    !isDeepStrictEqual({ ...current, repository: current.repository || {} }, configuration.rushConfigurationJson) ||
    !isDeepStrictEqual(experiments, configuration.experimentsConfiguration.configuration)
  ) {
    throw new Error('Rush configuration changed; a refreshed workspace is required before Rushx execution.');
  }
}

function createRushXTerminal(context: IGlobalCommandExecutionContext, debugEnabled: boolean): ITerminal {
  return new Terminal({
    supportsColor: context.terminalProperties.supportsColor,
    eolCharacter: EOL,
    write: (data, severity) => {
      switch (severity) {
        case TerminalProviderSeverity.debug:
        case TerminalProviderSeverity.verbose:
          if (debugEnabled) context.terminal.write(data);
          break;
        case TerminalProviderSeverity.warning:
        case TerminalProviderSeverity.error:
          context.terminal.writeError(data, { doNotOverrideSgrCodes: true });
          break;
        default:
          context.terminal.write(data);
          break;
      }
    }
  });
}
