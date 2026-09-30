// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Keep this module free of heavy imports: start.ts loads it before @microsoft/rush-lib.

import * as fs from 'node:fs';

/** Rush commands that the client always runs in-process. `daemon` runs the client's own daemon commands. */
export const NEVER_DAEMONIZED_COMMANDS: ReadonlySet<string> = new Set([
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

/**
 * Rush's global flags that only hide its startup banner, which a daemon request never prints. The client leaves
 * them out of a daemon request and keeps them for in-process Rush.
 */
export const QUIET_FLAGS: ReadonlySet<string> = new Set(['--quiet', '-q']);

/** The environment variables that mark a CI run. */
export const CI_ENVIRONMENT_VARIABLES: ReadonlyArray<string> = [
  'CI',
  'TF_BUILD',
  'GITHUB_ACTIONS',
  'JENKINS_URL',
  'TEAMCITY_VERSION'
];

/** Returns the first CI marker that is set. In CI, the daemon is off unless RUSH_DAEMON=1. */
export function getCiEnvironmentVariable(
  environment: Readonly<Record<string, string | undefined>>
): string | undefined {
  return CI_ENVIRONMENT_VARIABLES.find((name) => {
    const value: string | undefined = environment[name];
    return value !== undefined && value !== '' && value !== '0' && value !== 'false';
  });
}

/**
 * Whether the daemon is off for this invocation, as far as the client can tell before it loads
 * `@microsoft/rush-lib`: there is no rush.json, RUSH_DAEMON=0, a CI marker is set without RUSH_DAEMON=1, or
 * RUSH_DAEMON is not set and rush.json's "daemon" block does not set "enabled" to true. False when it can't tell;
 * routing then decides. A wrong guess either way is harmless: the progress line is painted after routing, or
 * painted and then erased.
 */
export function isDaemonOffBeforeRouting(
  environment: Readonly<Record<string, string | undefined>>,
  rushJsonPath: string | undefined
): boolean {
  const optIn: string | undefined = environment.RUSH_DAEMON;
  if (rushJsonPath === undefined || optIn === '0') {
    return true;
  }
  if (optIn !== '1' && getCiEnvironmentVariable(environment) !== undefined) {
    return true;
  }
  if (optIn !== undefined) {
    return false;
  }
  let contents: string;
  try {
    contents = fs.readFileSync(rushJsonPath, 'utf8');
  } catch {
    return false;
  }
  if (!/"daemon"\s*:/.test(contents)) {
    return true;
  }
  // `rush init` writes the daemon block as comments. A comment marker inside a string only makes the guess wrong.
  const uncommented: string = contents.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // The block holds no nested objects.
  const block: RegExpExecArray | null = /"daemon"\s*:\s*\{([^}]*)\}/.exec(uncommented);
  return !block || !/"enabled"\s*:\s*true\b/.test(block[1]);
}
