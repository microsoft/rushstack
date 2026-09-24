// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS,
  validateDaemonRequestAdmissionOptions,
  type DaemonRequestAdmissionErrorCode,
  type IDaemonRequestAdmissionOptions
} from '@rushstack/rush-daemon-protocol';

export interface IClientAdmissionControls {
  readonly argv: ReadonlyArray<string>;
  readonly admission: IDaemonRequestAdmissionOptions | undefined;
}

/** Consumes only daemon admission controls before the explicit script-argument separator. */
export function parseClientAdmissionControls(argv: ReadonlyArray<string>): IClientAdmissionControls {
  const remaining: string[] = [];
  let noWait: boolean = false;
  let waitTimeoutMs: number | undefined;
  for (let index: number = 0; index < argv.length; index++) {
    const arg: string = argv[index];
    if (arg === '--') {
      remaining.push(...argv.slice(index));
      break;
    }
    if (arg === '--no-wait') {
      noWait = true;
    } else if (arg.startsWith('--no-wait=')) {
      throw new Error('--no-wait does not accept a value.');
    } else if (arg === '--wait-timeout' || arg.startsWith('--wait-timeout=')) {
      if (waitTimeoutMs !== undefined) throw new Error('--wait-timeout may be specified only once.');
      const value: string | undefined =
        arg === '--wait-timeout' ? argv[++index] : arg.slice('--wait-timeout='.length);
      if (value === undefined || !/^\d+(?:\.\d+)?$/.test(value)) {
        throw new Error('--wait-timeout requires a nonnegative decimal number of seconds.');
      }
      const seconds: number = Number(value);
      if (seconds > MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS / 1000) {
        throw new RangeError('--wait-timeout exceeds the supported timer range.');
      }
      waitTimeoutMs = Math.floor(seconds * 1000);
      validateDaemonRequestAdmissionOptions({ waitTimeoutMs });
    } else {
      remaining.push(arg);
    }
  }
  if (noWait && waitTimeoutMs !== undefined) {
    throw new Error('--no-wait and --wait-timeout cannot be combined.');
  }
  const admission: IDaemonRequestAdmissionOptions | undefined = noWait
    ? { noWait: true }
    : waitTimeoutMs === undefined
      ? undefined
      : { waitTimeoutMs };
  return { argv: remaining, admission };
}

export interface IConfiguredAdmissionOptions {
  readonly queueTimeoutSeconds: number;
  /** True when the timeout came from rush.json or RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS rather than the default. */
  readonly explicit: boolean;
}

/**
 * Converts the configured queue timeout into admission options for a request without `--no-wait`/`--wait-timeout`.
 * A timeout that comes only from the built-in default is marked so that the daemon applies it to workspace
 * admission but not to waiting behind a running compatible build.
 */
export function getConfiguredAdmission(options: IConfiguredAdmissionOptions): IDaemonRequestAdmissionOptions {
  const waitTimeoutMs: number = Math.floor(options.queueTimeoutSeconds * 1000);
  return options.explicit ? { waitTimeoutMs } : { waitTimeoutMs, waitTimeoutIsDefault: true };
}

/** Explains a daemon admission failure and how to wait longer. */
export function formatAdmissionFailure(
  code: DaemonRequestAdmissionErrorCode,
  admission: IDaemonRequestAdmissionOptions | undefined
): string {
  const prefix: string = `rush-client: daemon admission failed (${code})`;
  if (code === 'no-wait') {
    return `${prefix}: another daemon request is using this workspace and --no-wait was specified.\n`;
  }
  if (code === 'wait-timeout') {
    const seconds: string =
      admission?.waitTimeoutMs === undefined ? '' : ` after ${admission.waitTimeoutMs / 1000}s`;
    return (
      `${prefix}: timed out${seconds} waiting for another daemon request in this workspace to finish ` +
      '(a command that needs exclusive access, or a running build). ' +
      'To wait longer, use --wait-timeout <seconds> or set RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS.\n'
    );
  }
  return `${prefix}.\n`;
}
