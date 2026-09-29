// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A command line that native Rush rejects as invalid. The request fails with native Rush's exit code, and the
 * client does not run the command in-process, which would only report the same error again.
 */
export class DaemonRequestUsageError extends Error {
  /** The exit code of native Rush for this command line. */
  public readonly exitCode: number;

  public constructor(message: string, exitCode: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DaemonRequestUsageError';
    this.exitCode = exitCode;
  }
}
