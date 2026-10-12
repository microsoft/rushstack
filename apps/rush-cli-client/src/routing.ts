// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonRequestAdmissionOptions } from '@rushstack/rush-daemon-protocol';
import type { IRushXCommandLineArguments } from '@microsoft/rush-lib';

import { loadRushLib } from './lazyRushModules';
import { parseClientAdmissionControls, type IClientAdmissionControls } from './ClientAdmissionControls';
import { getCiEnvironmentVariable, NEVER_DAEMONIZED_COMMANDS, QUIET_FLAGS } from './earlyRouting';
import { isNativeReporterEnvironmentRequested } from './outputSelection';

export interface IClientRouteOptions {
  readonly argv: ReadonlyArray<string>;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly enabled: boolean;
  readonly rushx: boolean;
  readonly hasTerminal?: boolean;
  /** The repository's experiments.json `useRushReporter` opt-in; such requests use the native reporter. */
  readonly useRushReporter?: boolean;
}

export interface IClientRoute {
  /** The arguments of a daemon request. They leave out leading `--quiet` flags, which only native Rush uses. */
  readonly argv: ReadonlyArray<string>;
  /** The arguments for in-process Rush: all but the client's own options. */
  readonly nativeArgv: ReadonlyArray<string>;
  readonly daemon: boolean;
  readonly commandName: string | undefined;
  readonly admission: IDaemonRequestAdmissionOptions | undefined;
  /**
   * Why the command runs in-process instead of on the daemon. Absent for a daemon request, and when the
   * invocation asks for in-process Rush or native Rush explains itself: `--no-daemon`, help, or no command.
   */
  readonly inProcessReason?: string;
}

const NATIVE_REPORTER_FLAGS: ReadonlyArray<string> = ['--reporter', '--output', '--log-level'];

/** Routing never parses action parameters or relabels a custom command as a built-in. */
export function selectClientRoute(options: IClientRouteOptions): IClientRoute {
  const controls: IClientAdmissionControls = parseClientAdmissionControls(options.argv);
  const separator: number = controls.argv.indexOf('--');
  const prefix: ReadonlyArray<string> = separator < 0 ? controls.argv : controls.argv.slice(0, separator);
  const noDaemon: boolean = prefix.includes('--no-daemon');
  const nativeArgv: ReadonlyArray<string> = [
    ...prefix.filter((arg) => arg !== '--no-daemon'),
    ...(separator < 0 ? [] : controls.argv.slice(separator))
  ];
  let quietFlags: number = 0;
  while (!options.rushx && QUIET_FLAGS.has(nativeArgv[quietFlags])) quietFlags++;
  const argv: ReadonlyArray<string> = nativeArgv.slice(quietFlags);
  const rushxArguments: IRushXCommandLineArguments | undefined = options.rushx
    ? loadRushLib().RushXCommand.parseArguments(argv, options.environment)
    : undefined;
  const commandName: string | undefined =
    (rushxArguments ? rushxArguments.commandName : argv[0]) || undefined;
  const help: boolean = rushxArguments
    ? rushxArguments.help
    : prefix.includes('--help') || prefix.includes('-h') || commandName === 'help';
  const inProcessReason: string | undefined =
    noDaemon || help || commandName === undefined
      ? undefined
      : getInProcessReason(options, prefix, commandName);
  return {
    argv,
    nativeArgv,
    commandName,
    daemon: !noDaemon && !help && commandName !== undefined && inProcessReason === undefined,
    admission: controls.admission,
    ...(inProcessReason === undefined ? {} : { inProcessReason })
  };
}

function getInProcessReason(
  options: IClientRouteOptions,
  prefix: ReadonlyArray<string>,
  commandName: string
): string | undefined {
  const { environment, rushx } = options;
  const reporter: string | undefined = getNativeReporterRequest(options, prefix);
  if (reporter !== undefined) return `${reporter} selects the native reporter`;
  if (commandName.startsWith('-')) return `the daemon does not support "${commandName}"`;
  if (!rushx && NEVER_DAEMONIZED_COMMANDS.has(commandName)) return `the daemon does not run "${commandName}"`;
  if (rushx && options.hasTerminal) return 'the daemon does not run scripts in a terminal';
  if (!options.enabled) {
    return environment.RUSH_DAEMON === '0'
      ? 'RUSH_DAEMON=0 turns the daemon off'
      : 'the daemon is not enabled for this repo';
  }
  const ci: string | undefined = getCiEnvironmentVariable(environment);
  if (ci !== undefined && environment.RUSH_DAEMON !== '1') {
    return `${ci} is set, so the daemon is off unless RUSH_DAEMON=1`;
  }
  return undefined;
}

function getNativeReporterRequest(
  options: IClientRouteOptions,
  prefix: ReadonlyArray<string>
): string | undefined {
  const { environment } = options;
  if (environment.RUSH_LOG_LEVEL !== undefined) return 'RUSH_LOG_LEVEL';
  if (isNativeReporterEnvironmentRequested(environment.RUSH_REPORTER)) {
    return `RUSH_REPORTER=${environment.RUSH_REPORTER?.trim()}`;
  }
  if (options.rushx) return undefined;
  const flag: string | undefined = NATIVE_REPORTER_FLAGS.find((name) =>
    prefix.some((arg) => arg === name || arg.startsWith(`${name}=`))
  );
  if (flag !== undefined) return flag;
  return options.useRushReporter ? 'useRushReporter in experiments.json' : undefined;
}
