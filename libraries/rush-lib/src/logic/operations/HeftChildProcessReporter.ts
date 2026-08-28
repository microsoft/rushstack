// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as child_process from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

import { type ITerminalProvider, TerminalProviderSeverity } from '@rushstack/terminal';
import {
  allocateChildDescriptor,
  encodeNdjsonRecord,
  HeftDescriptorHost,
  REPORTER_PROTOCOL_VERSION,
  type IChildDescriptorPlan,
  type IHeftChildResult,
  type IReporterChildContext,
  type IReporterEventEnvelope,
  type IReporterHandshakeResult,
  type IRushDiagnostic
} from '@rushstack/rush-reporter';

import type { IOperationChildProcessReporter } from './OperationEventSink';

export interface IHeftChildProcessReporterOptions {
  readonly parentSessionId: string;
  readonly parentRequestId: string;
  readonly parentOperationId: string;
  readonly iterationId: number;
  readonly context: IReporterChildContext;
  readonly ingestForeignEnvelope: (envelope: IReporterEventEnvelope<unknown>) => string;
  readonly onDiagnostic: (diagnostic: IRushDiagnostic) => void;
  readonly onStructuredNegotiated: () => void;
}

/**
 * Owns the private reporter descriptors for one operation child process.
 *
 * @internal
 */
export class HeftChildProcessReporter implements IOperationChildProcessReporter {
  public readonly environment: Readonly<Record<string, string>>;
  public readonly stdio: child_process.StdioOptions;

  private readonly _plan: IChildDescriptorPlan;
  private readonly _options: IHeftChildProcessReporterOptions;
  private _hasWarningOrError: boolean = false;

  public get hasWarningOrError(): boolean {
    return this._hasWarningOrError;
  }

  public constructor(options: IHeftChildProcessReporterOptions) {
    this._options = options;
    this._plan = allocateChildDescriptor();
    this.environment = this._plan.env;
    this.stdio = ['ignore', ...this._plan.stdio.slice(1)] as child_process.StdioOptions;
  }

  public async attachAsync(
    child: child_process.ChildProcess,
    structuredOutputTerminalProvider: ITerminalProvider
  ): Promise<void> {
    const eventStream: Readable | null = child.stdio[this._plan.fdNumber] as Readable | null;
    const ackStream: Writable | null = child.stdio[this._plan.ackFdNumber] as Writable | null;
    if (!eventStream || !ackStream) {
      throw new Error('The child reporter descriptors were not created by the process launcher.');
    }
    const reporterEventStream: Readable = eventStream;
    const reporterAckStream: Writable = ackStream;
    let diagnosticEmitted: boolean = false;
    const emitDiagnostic = (diagnostic: IRushDiagnostic | undefined): void => {
      if (diagnostic !== undefined && !diagnosticEmitted) {
        diagnosticEmitted = true;
        this._options.onDiagnostic(diagnostic);
      }
    };

    await new Promise<void>((resolve, reject) => {
      let settled: boolean = false;
      let eventEnded: boolean = false;
      let acknowledgementStarted: boolean = false;
      let acknowledgementCompleted: boolean = false;
      let negotiationResult: IReporterHandshakeResult | undefined;
      let structuredNegotiationConfirmed: boolean = false;

      const cleanup = (): void => {
        reporterEventStream.off('data', onData);
        reporterEventStream.off('end', onEnd);
      };
      const complete = (): void => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
      };
      const fail = (error: Error): void => {
        if (!settled) {
          settled = true;
          cleanup();
          reporterEventStream.destroy();
          if (!reporterAckStream.destroyed) {
            reporterAckStream.destroy();
          }
          reject(error);
        }
      };
      const confirmNegotiation = (): void => {
        if (
          !structuredNegotiationConfirmed &&
          acknowledgementCompleted &&
          negotiationResult?.accepted &&
          negotiationResult.ack.acceptedCapabilities.includes('heft-child-events-v1')
        ) {
          structuredNegotiationConfirmed = true;
          this._options.onStructuredNegotiated();
        }
      };
      const maybeComplete = (): void => {
        if (eventEnded && (!acknowledgementStarted || acknowledgementCompleted)) {
          complete();
        }
      };
      function onAcknowledgementError(error: Error): void {
        fail(new Error(`The Heft reporter acknowledgement failed: ${error.message}`));
      }
      function onAcknowledgementClose(): void {
        if (acknowledgementStarted && !acknowledgementCompleted) {
          fail(new Error('The Heft reporter acknowledgement closed before it was delivered.'));
        }
        reporterAckStream.off('error', onAcknowledgementError);
      }
      function onEventClose(): void {
        if (!eventEnded && !settled) {
          fail(new Error('The Heft reporter event stream closed before it completed.'));
        }
        reporterEventStream.off('error', onEventError);
      }
      const forwardEnvelope = (envelope: IReporterEventEnvelope<unknown>): void => {
        let forwardedEnvelope: IReporterEventEnvelope<unknown> = envelope;
        if (envelope.type === 'diagnosticEmitted') {
          const payload: { severity?: unknown } = envelope.payload as { severity?: unknown };
          this._hasWarningOrError ||= payload.severity === 'warning' || payload.severity === 'error';
          if (typeof envelope.payload === 'object' && envelope.payload !== null) {
            forwardedEnvelope = {
              ...envelope,
              payload: { ...envelope.payload, iterationId: this._options.iterationId }
            };
          }
        } else if (envelope.type === 'externalOutput') {
          const payload: { stream?: unknown; text?: unknown } = envelope.payload as {
            stream?: unknown;
            text?: unknown;
          };
          if (
            (payload.stream !== 'stdout' && payload.stream !== 'stderr') ||
            typeof payload.text !== 'string'
          ) {
            throw new Error('The validated child output envelope contained an invalid payload.');
          }
          this._hasWarningOrError ||= payload.stream === 'stderr';
          structuredOutputTerminalProvider.write(
            payload.text,
            payload.stream === 'stderr' ? TerminalProviderSeverity.error : TerminalProviderSeverity.log
          );
          forwardedEnvelope = {
            ...envelope,
            payload: { ...payload, iterationId: this._options.iterationId }
          };
        }
        this._options.ingestForeignEnvelope(forwardedEnvelope);
      };

      reporterAckStream.once('error', onAcknowledgementError);
      reporterAckStream.once('close', onAcknowledgementClose);
      reporterEventStream.on('error', onEventError);
      reporterEventStream.once('close', onEventClose);

      let processor: { write(chunk: string): void; flush(): IHeftChildResult };
      try {
        const host: HeftDescriptorHost = new HeftDescriptorHost({
          parentSessionId: this._options.parentSessionId,
          parentRequestId: this._options.parentRequestId,
          parentOperationId: this._options.parentOperationId,
          supportedProtocolVersion: REPORTER_PROTOCOL_VERSION,
          context: this._options.context,
          trustedSource: {
            packageName: '@rushstack/heft',
            packageVersion: 'unknown'
          },
          trustedPrivacy: 'local-sensitive',
          forwardEnvelope,
          sendHelloAck: (ack) => {
            if (acknowledgementStarted) {
              throw new Error('The Heft reporter acknowledgement was sent more than once.');
            }
            acknowledgementStarted = true;
            if (reporterAckStream.destroyed) {
              throw new Error('The Heft reporter acknowledgement stream closed before negotiation.');
            }
            reporterAckStream.end(encodeNdjsonRecord(ack), (error?: Error | null) => {
              if (error) {
                onAcknowledgementError(error);
              } else if (!settled) {
                acknowledgementCompleted = true;
                confirmNegotiation();
                maybeComplete();
              }
            });
          },
          onNegotiation: (result) => {
            negotiationResult = result;
            if (result.accepted) {
              confirmNegotiation();
            } else {
              emitDiagnostic(result.diagnostic);
            }
          }
        });
        processor = host.createStreamProcessor();
      } catch (error) {
        fail(error instanceof Error ? error : new Error('The child reporter context was invalid.'));
        return;
      }

      function onData(chunk: string): void {
        try {
          processor.write(chunk);
        } catch (error) {
          fail(error instanceof Error ? error : new Error('The child reporter stream failed.'));
        }
      }
      function onEventError(error: Error): void {
        fail(error);
      }
      function onEnd(): void {
        try {
          const result: IHeftChildResult = processor.flush();
          emitDiagnostic(result.diagnostic);
          eventEnded = true;
          if (!acknowledgementStarted && !reporterAckStream.destroyed) {
            reporterAckStream.destroy();
          }
          maybeComplete();
        } catch (error) {
          fail(error instanceof Error ? error : new Error('The child reporter stream failed.'));
        }
      }
      reporterEventStream.setEncoding('utf8');
      reporterEventStream.on('data', onData);
      reporterEventStream.once('end', onEnd);
    });
  }
}
