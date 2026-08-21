// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushDiagnosticSeverity } from '../diagnostics/IRushDiagnostic';

/**
 * A structured problem extracted from a matched output line.
 *
 * @beta
 */
export interface IProblemMatch {
  /**
   * The tool's own problem code, such as `TS1005`.
   */
  readonly code?: string;

  /**
   * The human-readable message.
   */
  readonly message: string;

  /**
   * The file the problem refers to.
   */
  readonly file?: string;

  /**
   * The 1-based line number.
   */
  readonly line?: number;

  /**
   * The 1-based column number.
   */
  readonly column?: number;
}

/**
 * A tool- and version-scoped problem matcher.
 *
 * @remarks
 * A matcher never modifies raw output or process status. It is enabled by
 * default only after high-confidence corpus tests pass.
 *
 * @beta
 */
export interface IProblemMatcher {
  /**
   * A unique matcher name.
   */
  readonly name: string;

  /**
   * The tool the matcher applies to, such as `tsc`.
   */
  readonly tool: string;

  /**
   * The severity of the produced diagnostic.
   */
  readonly severity: RushDiagnosticSeverity;

  /**
   * The per-line pattern.
   */
  readonly pattern: RegExp;

  /**
   * Whether the matcher is enabled in default runs. Requires corpus validation.
   */
  readonly enabledByDefault: boolean;

  /**
   * Returns whether the matcher applies to a tool version. When omitted, the
   * matcher applies to every version.
   */
  matchesVersion?(version: string): boolean;

  /**
   * Extracts the structured problem from a pattern match.
   */
  extract(match: RegExpMatchArray): IProblemMatch;
}
