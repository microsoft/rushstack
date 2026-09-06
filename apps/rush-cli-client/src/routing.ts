// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const neverDaemonize: ReadonlySet<string> = new Set([
  'add',
  'change',
  'check',
  'deploy',
  'init',
  'init-autoinstaller',
  'init-deploy',
  'install',
  'link',
  'publish',
  'purge',
  'remove',
  'scan',
  'setup',
  'unlink',
  'update',
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
}

export interface IClientRoute {
  readonly argv: ReadonlyArray<string>;
  readonly daemon: boolean;
  readonly commandName: string | undefined;
}

/** Routing never parses action parameters or relabels a custom command as a built-in. */
export function selectClientRoute(options: IClientRouteOptions): IClientRoute {
  const separator: number = options.argv.indexOf('--');
  const prefix: ReadonlyArray<string> = separator < 0 ? options.argv : options.argv.slice(0, separator);
  const noDaemon: boolean = prefix.includes('--no-daemon');
  const argv: ReadonlyArray<string> = [
    ...prefix.filter((arg) => arg !== '--no-daemon'),
    ...(separator < 0 ? [] : options.argv.slice(separator))
  ];
  const commandName: string | undefined = argv[0];
  const ci: boolean = ['CI', 'TF_BUILD', 'GITHUB_ACTIONS', 'JENKINS_URL', 'TEAMCITY_VERSION'].some((key) => {
    const value: string | undefined = options.environment[key];
    return value !== undefined && value !== '' && value !== '0' && value !== 'false';
  });
  const daemon: boolean =
    options.enabled &&
    !noDaemon &&
    !!commandName &&
    !commandName.startsWith('-') &&
    (options.rushx || !neverDaemonize.has(commandName)) &&
    !(prefix.includes('--help') || prefix.includes('-h')) &&
    (!ci || options.environment.RUSH_DAEMON === '1');
  return { argv, commandName, daemon };
}
