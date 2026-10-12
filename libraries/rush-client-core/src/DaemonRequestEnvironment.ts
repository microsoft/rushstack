// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DAEMON_RUNTIME_FOLDER_PROTOCOL_MINOR,
  type IDaemonProtocolVersion,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

// Before protocol 0.12, a daemon listened in XDG_RUNTIME_DIR or else in os.tmpdir(), which reads TMPDIR, then
// TMP, then TEMP. It restarted when a request's XDG_RUNTIME_DIR or TMPDIR differed from its own, and its
// successor listened in the folder that the request named.
const RUNTIME_FOLDER_VARIABLES: readonly string[] = ['XDG_RUNTIME_DIR', 'TMPDIR', 'TMP', 'TEMP'];

/**
 * Returns the request to send to a daemon that negotiated `peer`.
 *
 * @remarks
 * A daemon older than protocol 0.12 would restart into a folder that current clients never look in when a
 * request names another runtime folder, and every later client of the checkout would then wait for a daemon it
 * cannot find. On POSIX, its requests leave those variables out, so that it serves them with its own values.
 * Windows is unchanged: its pipe name does not depend on them, and its builds need `TMP` and `TEMP`.
 */
export function adaptDaemonRequestToPeer(
  request: IDaemonRequestEnvelope,
  peer: IDaemonProtocolVersion,
  platform: NodeJS.Platform
): IDaemonRequestEnvelope {
  if (platform === 'win32' || peer.minor >= DAEMON_RUNTIME_FOLDER_PROTOCOL_MINOR) return request;
  const environment: Record<string, string> = { ...request.environment };
  for (const name of RUNTIME_FOLDER_VARIABLES) delete environment[name];
  return { ...request, environment };
}
