// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter, IReporterContext } from './IReporter';

/**
 * Thrown internally by {@link ReporterMultiplexer} when more than one child
 * reporter fails during the same operation. Mirrors the shape of the standard
 * `AggregateError` without depending on an ES2021+ TypeScript `lib`. Not part
 * of the public API surface; callers can still read `error.message` and, if
 * needed, the non-typed `errors` array it carries.
 */
class ReporterMultiplexerAggregateError extends Error {
  /**
   * The underlying errors, one per failing child, in registration order.
   */
  public readonly errors: readonly Error[];

  public constructor(errors: readonly Error[], message: string) {
    super(message);
    this.name = 'ReporterMultiplexerAggregateError';
    this.errors = errors;
  }
}

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
 * A {@link ReporterManager} disables an entire registered reporter the first
 * time one of its calls throws or rejects. Because a multiplexer is registered
 * as a single reporter on behalf of several children, it isolates each child
 * call so that one failing child cannot silently take the others down with it:
 *
 * - {@link ReporterMultiplexer.report} calls every child, even after one
 *   throws. A failing child is logged and skipped for that event; the
 *   remaining children still receive it. `report` only throws (so the manager
 *   disables this multiplexer) once every child has failed, since at that
 *   point the shared destination is presumed unusable.
 *
 * - {@link ReporterMultiplexer.flushAsync} and
 *   {@link ReporterMultiplexer.closeAsync} attempt every child even if some
 *   reject, then rethrow (the sole error, or a
 *   `ReporterMultiplexerAggregateError` wrapping all of them) if *any*
 *   child failed. Flush/close are terminal, caller-awaited operations, so
 *   callers should learn about any failure instead of having it silently
 *   swallowed the way a single dropped `report` call is.
 *
 * - {@link ReporterMultiplexer.initializeAsync} initializes children in
 *   registration order and stops at the first failure. It then best-effort
 *   closes the children that already initialized successfully (so they do not
 *   leak resources) before rethrowing the original error, since initialization
 *   failure is always fatal to the session.
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
    const initialized: IReporter[] = [];
    for (const reporter of this._reporters) {
      try {
        await reporter.initializeAsync(context);
        initialized.push(reporter);
      } catch (error) {
        // Best-effort rollback of the children that already initialized, so a
        // partially-initialized multiplexer does not leak their resources.
        // A rollback failure must not mask the original error.
        for (let index: number = initialized.length - 1; index >= 0; index--) {
          try {
            await initialized[index].closeAsync();
          } catch (closeError) {
            this._logChildFailure(initialized[index], 'rollback close', closeError as Error);
          }
        }
        throw error;
      }
    }
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    const errors: Error[] = [];
    for (const reporter of this._reporters) {
      try {
        reporter.report(event);
      } catch (error) {
        errors.push(error as Error);
        this._logChildFailure(reporter, 'report', error as Error);
      }
    }
    // Only escalate when every child failed; a partial failure must not
    // disable the children that are still working.
    if (this._reporters.length > 0 && errors.length === this._reporters.length) {
      throw this._toThrowable(errors);
    }
  }

  public async flushAsync(): Promise<void> {
    await this._settleAllAsync((reporter: IReporter) => reporter.flushAsync(), 'flush');
  }

  public async closeAsync(): Promise<void> {
    await this._settleAllAsync((reporter: IReporter) => reporter.closeAsync(), 'close');
  }

  private async _settleAllAsync(
    action: (reporter: IReporter) => Promise<void>,
    operationName: string
  ): Promise<void> {
    const errors: Error[] = [];
    for (const reporter of this._reporters) {
      try {
        await action(reporter);
      } catch (error) {
        errors.push(error as Error);
        this._logChildFailure(reporter, operationName, error as Error);
      }
    }
    if (errors.length > 0) {
      throw this._toThrowable(errors);
    }
  }

  private _toThrowable(errors: Error[]): Error {
    if (errors.length === 1) {
      return errors[0];
    }
    const details: string = errors.map((error: Error) => error.message).join('; ');
    const message: string = `${errors.length} of ${this._reporters.length} multiplexed reporters failed: ${details}`;
    return new ReporterMultiplexerAggregateError(errors, message);
  }

  private _logChildFailure(reporter: IReporter, operationName: string, error: Error): void {
    process.stderr.write(
      `[reporter] Reporter ${JSON.stringify(reporter.name)} inside multiplexer ` +
        `${JSON.stringify(this.name)} failed during ${operationName}: ${error.message}\n`
    );
  }
}
