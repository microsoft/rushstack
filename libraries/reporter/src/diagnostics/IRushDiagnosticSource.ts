// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Identifies a file location that a diagnostic refers to.
 *
 * @remarks
 * File paths are `local-sensitive` and never enter telemetry.
 *
 * @beta
 */
export interface IRushFileDiagnosticSource {
  /**
   * Discriminates this source as a file location.
   */
  readonly kind: 'file';

  /**
   * The file the diagnostic refers to.
   */
  readonly file: string;

  /**
   * The 1-based line number within {@link IRushFileDiagnosticSource.file}, when known.
   */
  readonly line?: number;

  /**
   * The 1-based column number within the line, when known.
   */
  readonly column?: number;

  /**
   * The name of the tool that produced the diagnostic, when applicable.
   */
  readonly toolName?: string;
}

/**
 * Identifies a tool (without a specific file location) that a diagnostic
 * refers to.
 *
 * @beta
 */
export interface IRushToolDiagnosticSource {
  /**
   * Discriminates this source as a tool.
   */
  readonly kind: 'tool';

  /**
   * The name of the tool that produced the diagnostic.
   */
  readonly toolName: string;
}

/**
 * Identifies the source that a diagnostic refers to.
 *
 * @remarks
 * A discriminated union keyed by `kind`, so a source always carries the fields
 * that are meaningful for its kind. Additional kinds may be added in future
 * protocol minors; consumers should handle unknown kinds gracefully.
 *
 * @beta
 */
export type IRushDiagnosticSource = IRushFileDiagnosticSource | IRushToolDiagnosticSource;