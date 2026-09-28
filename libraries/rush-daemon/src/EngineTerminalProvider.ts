// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGraph, _IOperationGraphEventSink } from '@microsoft/rush-lib';
import { AlreadyReportedError } from '@rushstack/node-core-library';
import { TerminalProviderSeverity, type ITerminalProvider } from '@rushstack/terminal';

import { getEngineActivityOptions } from './EngineActivityOptions';
import { WorkspaceEngineRecreationRequiredError } from './WorkspaceEngineComponentFactory';

export class EngineTerminalProvider implements ITerminalProvider {
  public readonly supportsColor: boolean = false;
  public readonly eolCharacter: string = '\n';
  readonly #messages: Array<{ text: string; severity: TerminalProviderSeverity }> = [];
  #graph: (IOperationGraph & { eventSink?: _IOperationGraphEventSink }) | undefined;
  #executing: boolean = false;
  #hasReconciled: boolean = false;

  public write(text: string, severity: TerminalProviderSeverity): void {
    if (this.#executing) this.#emit(text, severity);
    else this.#messages.push({ text, severity });
  }

  /**
   * Drains buffered diagnostics into the failure description, so that they belong to the failing request
   * and are never replayed into a later request. Like the request output, the description omits verbose and
   * debug messages unless the graph runs in debug mode: loading a large workspace writes thousands of them.
   */
  public describeError(error: unknown): string {
    const lines: string[] = [];
    let hasErrorLine: boolean = false;
    for (const { text, severity } of this.#messages.splice(0)) {
      const line: string = text.replace(/\r?\n$/, '');
      if (this.#isHidden(severity) || !line.trim()) continue;
      hasErrorLine ||= severity === TerminalProviderSeverity.error;
      lines.push(line);
    }
    // An AlreadyReportedError only says "An error occurred."; the error lines written before it are the report.
    if (!(hasErrorLine && error instanceof Error && error instanceof AlreadyReportedError)) {
      lines.push(error instanceof Error ? error.message : String(error));
    }
    return lines.join('\n');
  }

  public get hasBufferedMessages(): boolean {
    return this.#messages.length > 0;
  }

  /** Discards diagnostics buffered by an earlier request before a new request starts using this terminal. */
  public discardBufferedMessages(): void {
    this.#messages.length = 0;
  }

  /**
   * Runs a warm reconcile with request-scoped diagnostics. The graph keeps the binding request's terminal, so
   * diagnostics buffered before a later request's reconcile belong to an earlier request and are discarded; the
   * binding request's own diagnostics are kept. A failure carries the diagnostics buffered while reconciling.
   */
  public async reconcileWithRequestDiagnosticsAsync<T>(reconcileAsync: () => Promise<T>): Promise<T> {
    if (this.#hasReconciled) this.discardBufferedMessages();
    this.#hasReconciled = true;
    try {
      return await reconcileAsync();
    } catch (error) {
      throw this.#attachBufferedDiagnostics(error);
    }
  }

  #attachBufferedDiagnostics(error: unknown): unknown {
    if (error instanceof WorkspaceEngineRecreationRequiredError) {
      // The replacement engine gets a fresh terminal; the stale diagnostics must not reach a later request.
      this.discardBufferedMessages();
      return error;
    }
    if (!this.hasBufferedMessages) return error;
    if (!(error instanceof Error)) return new Error(this.describeError(error), { cause: error });
    // Keep the error's identity and type, which callers use for classification.
    error.message = this.describeError(error);
    return error;
  }

  public attach(graph: IOperationGraph): void {
    if (!('eventSink' in graph))
      throw new Error('The native graph does not expose its operation event sink.');
    this.#graph = graph as IOperationGraph & { eventSink?: _IOperationGraphEventSink };
    // Snapshot diagnostics also belong to no-op requests, which never reach beforeExecuteIterationAsync.
    graph.hooks.configureIteration.tap({ name: 'DaemonEngineTerminal', stage: Infinity }, () => {
      for (const message of this.#messages.splice(0)) this.#emit(message.text, message.severity);
    });
    graph.hooks.beforeExecuteIterationAsync.tap({ name: 'DaemonEngineTerminal', stage: -Infinity }, () => {
      this.#executing = true;
      for (const message of this.#messages.splice(0)) this.#emit(message.text, message.severity);
    });
    graph.hooks.afterExecuteIterationAsync.tap(
      { name: 'DaemonEngineTerminal', stage: Infinity },
      (status) => {
        this.#executing = false;
        return status;
      }
    );
  }

  #isHidden(severity: TerminalProviderSeverity): boolean {
    return (
      !this.#graph?.debugMode &&
      (severity === TerminalProviderSeverity.verbose || severity === TerminalProviderSeverity.debug)
    );
  }

  #emit(text: string, severity: TerminalProviderSeverity): void {
    if (this.#isHidden(severity)) {
      return;
    }
    this.#graph?.eventSink?.onActivity?.(text, getEngineActivityOptions(severity));
  }
}
