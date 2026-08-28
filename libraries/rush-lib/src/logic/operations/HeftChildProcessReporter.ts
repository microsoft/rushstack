// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as child_process from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

import {
  allocateChildDescriptor,
  encodeNdjsonRecord,
  HeftDescriptorHost,
  REPORTER_PROTOCOL_VERSION,
  type IChildDescriptorPlan,
  type IHeftChildResult,
  type IReporterChildContext,
  type IReporterEventEnvelope,
  type IRushDiagnostic
} from '@rushstack/rush-reporter';

import type { IOperationChildProcessReporter } from './OperationEventSink';

export interface IHeftChildProcessReporterOptions {
  readonly parentSessionId: string;
  readonly parentRequestId: string;
  readonly parentOperationId: string;
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

  public async attachAsync(child: child_process.ChildProcess): Promise<void> {
    const eventStream: Readable | null = child.stdio[this._plan.fdNumber] as Readable | null;
    const ackStream: Writable | null = child.stdio[this._plan.ackFdNumber] as Writable | null;
    if (!eventStream || !ackStream) {
      throw new Error('The child reporter descriptors were not created by the process launcher.');
    }

    let diagnosticEmitted: boolean = false;
    const emitDiagnostic = (diagnostic: IRushDiagnostic | undefined): void => {
      if (diagnostic !== undefined && !diagnosticEmitted) {
        diagnosticEmitted = true;
        this._options.onDiagnostic(diagnostic);
      }
    };

    const host: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: this._options.parentSessionId,
      parentRequestId: this._options.parentRequestId,
      parentOperationId: this._options.parentOperationId,
      supportedProtocolVersion: REPORTER_PROTOCOL_VERSION,
      context: this._options.context,
      forwardEnvelope: (envelope: IReporterEventEnvelope<unknown>) => {
        if (envelope.type === 'diagnosticEmitted') {
          const payload: { severity?: unknown } = envelope.payload as { severity?: unknown };
          this._hasWarningOrError ||= payload.severity === 'warning' || payload.severity === 'error';
        } else if (envelope.type === 'externalOutput') {
          const payload: { stream?: unknown } = envelope.payload as { stream?: unknown };
          this._hasWarningOrError ||= payload.stream === 'stderr';
        }
        this._options.ingestForeignEnvelope(envelope);
      },
      sendHelloAck: (ack) => {
        ackStream.end(encodeNdjsonRecord(ack));
      },
      onNegotiation: (result) => {
        if (result.accepted) {
          this._options.onStructuredNegotiated();
        } else {
          emitDiagnostic(result.diagnostic);
        }
      }
    });
    const processor: { write(chunk: string): void; flush(): IHeftChildResult } = host.createStreamProcessor();

    await new Promise<void>((resolve, reject) => {
      eventStream.setEncoding('utf8');
      eventStream.on('data', (chunk: string) => processor.write(chunk));
      eventStream.once('error', reject);
      eventStream.once('end', () => {
        const result: IHeftChildResult = processor.flush();
        emitDiagnostic(result.diagnostic);
        if (!ackStream.destroyed) {
          ackStream.end();
        }
        resolve();
      });
    });
  }
}
