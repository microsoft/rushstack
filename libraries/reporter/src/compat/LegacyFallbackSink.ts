// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventSink } from '../producers/IReporterEventSink';

/**
 * A sink that safely discards structured events.
 *
 * @remarks
 * A new engine paired with an old frontend receives no reporter manager. It uses
 * this sink so it can call {@link IReporterEventSink.emit} unconditionally while
 * rendering legacy output itself. Emitted events are discarded and each call
 * returns a synthetic event id.
 *
 * @beta
 */
export class LegacyFallbackSink implements IReporterEventSink {
  private _nextId: number = 1;

  public emit(): string {
    return `discarded_${this._nextId++}`;
  }
}

/**
 * How an engine's sink was resolved.
 *
 * @beta
 */
export interface IEngineSinkResolution {
  /**
   * The sink the engine should emit into.
   */
  readonly sink: IReporterEventSink;

  /**
   * `structured` when a real sink was provided, `legacy-fallback` when the engine
   * must render legacy output because no sink was available.
   */
  readonly mode: 'structured' | 'legacy-fallback';
}

/**
 * Resolves the sink a new engine should use, falling back for an old frontend.
 *
 * @remarks
 * When the frontend provides a sink, the engine emits structured events. When it
 * does not, the engine receives a {@link LegacyFallbackSink} and renders legacy
 * output itself.
 *
 * @param providedSink - the sink handed down by the frontend, if any
 *
 * @beta
 */
export function createEngineSink(providedSink?: IReporterEventSink): IEngineSinkResolution {
  if (providedSink) {
    return { sink: providedSink, mode: 'structured' };
  }
  return { sink: new LegacyFallbackSink(), mode: 'legacy-fallback' };
}
