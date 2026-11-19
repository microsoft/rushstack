// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The stream a piece of rendered output belongs to.
 *
 * @beta
 */
export type DaemonRenderStream = 'stdout' | 'stderr';

/**
 * The terminal a renderer writes to.
 *
 * @remarks
 * Implemented by the CLI client with its real terminal; implemented by tests
 * with an in-memory sink. Mirrors the shape `@rushstack/reporter` reporters
 * expect so they can be hosted here unchanged after the reporter reconciliation.
 *
 * @beta
 */
export interface IDaemonRendererTerminal {
  /**
   * The terminal width in columns.
   */
  readonly columns: number;

  /**
   * Whether the terminal is an interactive TTY.
   */
  readonly isTTY: boolean;

  /**
   * Writes text to the given stream.
   */
  write(text: string, stream: DaemonRenderStream): void;
}
