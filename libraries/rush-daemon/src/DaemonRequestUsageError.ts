// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** Options for {@link DaemonRequestUsageError}. */
export interface IDaemonRequestUsageErrorOptions extends ErrorOptions {
  /** The usage of the command, which native Rush prints to stdout before the message. */
  readonly usage?: string;
}

/**
 * A command line that native Rush rejects as invalid. The request fails with native Rush's exit code, and the
 * client does not run the command in-process, which would only report the same error again.
 */
export class DaemonRequestUsageError extends Error {
  /** The exit code of native Rush for this command line. */
  public readonly exitCode: number;
  /** The usage of the command, if it is known. */
  public readonly usage: string | undefined;

  public constructor(message: string, exitCode: number, options?: IDaemonRequestUsageErrorOptions) {
    super(message, options);
    this.name = 'DaemonRequestUsageError';
    this.exitCode = exitCode;
    this.usage = options?.usage;
  }
}
