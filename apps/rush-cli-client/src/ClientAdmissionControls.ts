// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS,
  validateDaemonRequestAdmissionOptions,
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
      const value: string | undefined = arg === '--wait-timeout'
        ? argv[++index]
        : arg.slice('--wait-timeout='.length);
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
    : waitTimeoutMs === undefined ? undefined : { waitTimeoutMs };
  return { argv: remaining, admission };
}
