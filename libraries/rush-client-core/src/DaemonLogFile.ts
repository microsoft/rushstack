// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

/** The workspace launcher's persistent stdout/stderr log, independent of daemon lifetime. @beta */
export function getDaemonLogFilePath(paths: IDaemonPaths): string {
  return `${paths.lockfilePath}.log`;
}
