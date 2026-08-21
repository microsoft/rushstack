// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter, IReporterContext } from './IReporter';

/**
 * Combines several reporters that share a single destination into one reporter.
 *
 * @remarks
 * Exclusive destination ownership means two reporters cannot both own, for
 * example, `stdout`. When sharing is genuinely required, wrap the reporters in a
 * multiplexer and register the multiplexer as the single owner of that
 * destination. The multiplexer fans every lifecycle call out to its children in
 * registration order.
 *
 * @beta
 */
export class ReporterMultiplexer implements IReporter {
  /**
   * A stable, unique name for this multiplexer.
   */
  public readonly name: string;

  private readonly _reporters: readonly IReporter[];

  public constructor(name: string, reporters: readonly IReporter[]) {
    this.name = name;
    this._reporters = [...reporters];
  }

  public async initializeAsync(context: IReporterContext): Promise<void> {
    for (const reporter of this._reporters) {
      await reporter.initializeAsync(context);
    }
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    for (const reporter of this._reporters) {
      reporter.report(event);
    }
  }

  public async flushAsync(): Promise<void> {
    for (const reporter of this._reporters) {
      await reporter.flushAsync();
    }
  }

  public async closeAsync(): Promise<void> {
    for (const reporter of this._reporters) {
      await reporter.closeAsync();
    }
  }
}
