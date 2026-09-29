// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The command line is not valid for the command, for example because it names an unknown parameter.
 * Native Rush prints the message and exits with {@link PhasedCommandEngineUsageError.exitCode}.
 * No engine preparation has begun.
 * @alpha
 */
export class PhasedCommandEngineUsageError extends Error {
  /** The exit code of native Rush for this command line. */
  public readonly exitCode: number;

  // The shape of ErrorOptions, which needs lib es2022. Consumers of these typings may use an older lib.
  public constructor(message: string, exitCode: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PhasedCommandEngineUsageError';
    this.exitCode = exitCode;
  }
}
