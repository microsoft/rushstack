// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IScopedReporter } from '../producers/IScopedReporter';

/**
 * A minimal, presentation-free logger backed by a scoped reporter.
 *
 * @remarks
 * This replaces the terminal-coupled `ILogger`. It exposes no `terminal` or
 * terminal-provider handle; every method emits a structured message through the
 * scoped reporter and returns the assigned event id.
 *
 * @beta
 */
export interface IScopedLogger {
  /**
   * Emits an informational message.
   */
  writeLine(text: string): string;

  /**
   * Emits a debug message.
   */
  writeDebugLine(text: string): string;

  /**
   * Emits a warning message.
   */
  writeWarningLine(text: string): string;

  /**
   * Emits an error message.
   */
  writeErrorLine(text: string): string;
}

/**
 * Creates a scoped logger that forwards to a scoped reporter.
 *
 * @param reporter - the scoped reporter that receives the messages
 *
 * @beta
 */
export function createScopedLogger(reporter: IScopedReporter): IScopedLogger {
  return {
    writeLine(text: string): string {
      return reporter.emitMessage({ severity: 'info', text });
    },
    writeDebugLine(text: string): string {
      return reporter.emitMessage({ severity: 'debug', text });
    },
    writeWarningLine(text: string): string {
      return reporter.emitMessage({ severity: 'warning', text });
    },
    writeErrorLine(text: string): string {
      return reporter.emitMessage({ severity: 'error', text });
    }
  };
}
