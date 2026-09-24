// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonRequestAdmissionOptions } from '@rushstack/rush-daemon-protocol';
import { RushXCommand, type IRushXCommandLineArguments } from '@microsoft/rush-lib';

import { parseClientAdmissionControls, type IClientAdmissionControls } from './ClientAdmissionControls';
import { isAiReporterRequested } from './outputSelection';

const neverDaemonize: ReadonlySet<string> = new Set([
  'add',
  'change',
  'check',
  'deploy',
  'init',
  'init-autoinstaller',
  'init-deploy',
  'link',
  'publish',
  'purge',
  'remove',
  'scan',
  'setup',
  'unlink',
  'update-autoinstaller',
  'version',
  'help',
  'daemon'
]);

export interface IClientRouteOptions {
  readonly argv: ReadonlyArray<string>;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly enabled: boolean;
  readonly rushx: boolean;
  readonly hasTerminal?: boolean;
  /** The repository's experiments.json `useRushReporter` opt-in. */
  readonly useRushReporter?: boolean;
}

export interface IClientRoute {
  readonly argv: ReadonlyArray<string>;
  readonly daemon: boolean;
  readonly commandName: string | undefined;
  readonly admission: IDaemonRequestAdmissionOptions | undefined;
}

/** Removes --reporter ai / --reporter=ai; the daemon renders through the client's agent output instead. */
function stripAiReporterFlag(args: ReadonlyArray<string>, aiReporter: boolean): ReadonlyArray<string> {
  if (!aiReporter) return args;
  const result: string[] = [];
  for (let i: number = 0; i < args.length; i++) {
    if (args[i] === '--reporter') {
      i++;
    } else if (!args[i].startsWith('--reporter=')) {
      result.push(args[i]);
    }
  }
  return result;
}

/** Routing never parses action parameters or relabels a custom command as a built-in. */
export function selectClientRoute(options: IClientRouteOptions): IClientRoute {
  const controls: IClientAdmissionControls = parseClientAdmissionControls(options.argv);
  const separator: number = controls.argv.indexOf('--');
  const prefix: ReadonlyArray<string> = separator < 0 ? controls.argv : controls.argv.slice(0, separator);
  const noDaemon: boolean = prefix.includes('--no-daemon');
  // An explicit AI reporter selects the client's agent output on the daemon path instead of in-process Rush.
  const aiReporter: boolean = !options.rushx && isAiReporterRequested(prefix, options.environment);
  const routedPrefix: ReadonlyArray<string> = stripAiReporterFlag(
    prefix.filter((arg) => arg !== '--no-daemon'),
    aiReporter
  );
  const argv: ReadonlyArray<string> = [
    ...routedPrefix,
    ...(separator < 0 ? [] : controls.argv.slice(separator))
  ];
  const rushxArguments: IRushXCommandLineArguments | undefined = options.rushx
    ? RushXCommand.parseArguments(argv, options.environment)
    : undefined;
  const commandName: string | undefined = rushxArguments ? rushxArguments.commandName || undefined : argv[0];
  const reporterControls: boolean =
    options.environment.RUSH_LOG_LEVEL !== undefined ||
    (!aiReporter &&
      options.environment.RUSH_REPORTER !== undefined &&
      options.environment.RUSH_REPORTER !== 'legacy') ||
    (!options.rushx &&
      routedPrefix.some((arg) =>
        ['--reporter', '--output', '--log-level'].some((name) => arg === name || arg.startsWith(`${name}=`))
      )) ||
    // The repository opted into the native reporter (experiments.json useRushReporter); only an
    // explicit AI reporter request keeps such a repository on the daemon path.
    (!options.rushx && !!options.useRushReporter && !aiReporter);
  const ci: boolean = ['CI', 'TF_BUILD', 'GITHUB_ACTIONS', 'JENKINS_URL', 'TEAMCITY_VERSION'].some((key) => {
    const value: string | undefined = options.environment[key];
    return value !== undefined && value !== '' && value !== '0' && value !== 'false';
  });
  const daemon: boolean =
    options.enabled &&
    !reporterControls &&
    !noDaemon &&
    !(options.rushx && options.hasTerminal) &&
    !!commandName &&
    !commandName.startsWith('-') &&
    (options.rushx || !neverDaemonize.has(commandName)) &&
    !(rushxArguments ? rushxArguments.help : prefix.includes('--help') || prefix.includes('-h')) &&
    (!ci || options.environment.RUSH_DAEMON === '1');
  return { argv, commandName, daemon, admission: controls.admission };
}
