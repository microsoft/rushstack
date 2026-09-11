// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGraph, _IOperationGraphEventSink } from '@microsoft/rush-lib';
import { TerminalProviderSeverity, type ITerminalProvider } from '@rushstack/terminal';

export class EngineTerminalProvider implements ITerminalProvider {
  public readonly supportsColor: boolean = false;
  public readonly eolCharacter: string = '\n';
  readonly #messages: Array<{ text: string; severity: TerminalProviderSeverity }> = [];
  #graph: (IOperationGraph & { eventSink?: _IOperationGraphEventSink }) | undefined;
  #executing: boolean = false;

  public write(text: string, severity: TerminalProviderSeverity): void {
    if (this.#executing) this.#emit(text, severity);
    else this.#messages.push({ text, severity });
  }

  public describeError(error: unknown): string {
    return [
      ...this.#messages.map(({ text }) => text),
      error instanceof Error ? error.message : String(error)
    ].join('\n');
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

  #emit(text: string, severity: TerminalProviderSeverity): void {
    if (
      !this.#graph?.debugMode &&
      (severity === TerminalProviderSeverity.verbose || severity === TerminalProviderSeverity.debug)
    ) {
      return;
    }
    this.#graph?.eventSink?.onActivity?.(text, {
      stderr: severity === TerminalProviderSeverity.error || severity === TerminalProviderSeverity.warning
    });
  }
}
