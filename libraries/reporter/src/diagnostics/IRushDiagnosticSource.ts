// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Identifies the source location that a diagnostic refers to.
 *
 * @remarks
 * File paths are `local-sensitive` and never enter telemetry.
 *
 * @beta
 */
export interface IRushDiagnosticSource {
  /**
   * The file the diagnostic refers to.
   */
  readonly file?: string;

  /**
   * The 1-based line number within {@link IRushDiagnosticSource.file | file}.
   */
  readonly line?: number;

  /**
   * The 1-based column number within {@link IRushDiagnosticSource.file | file}.
   */
  readonly column?: number;

  /**
   * The name of the tool that produced the diagnostic, when applicable.
   */
  readonly toolName?: string;
}
