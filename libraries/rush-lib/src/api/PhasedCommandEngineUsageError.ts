// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The command line is not valid for a phased command, for example because it names an unknown parameter.
 * Native Rush prints the message and exits with {@link PhasedCommandEngineUsageError.exitCode}.
 * No engine preparation has begun.
 * @alpha
 */
export class PhasedCommandEngineUsageError extends Error {
  /** The exit code of native Rush for this command line. */
  public readonly exitCode: number;
  /** The usage of the command, which native Rush prints to stdout before the message, if it is known. */
  public readonly usage: string | undefined;

  // The shape of ErrorOptions, which needs lib es2022. Consumers of these typings may use an older lib.
  public constructor(message: string, exitCode: number, options?: { cause?: unknown; usage?: string }) {
    super(message, options);
    this.name = 'PhasedCommandEngineUsageError';
    this.exitCode = exitCode;
    this.usage = options?.usage;
  }
}
