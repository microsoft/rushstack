// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  AlreadyReportedError,
  isAlreadyReportedSentinel,
  LegacyErrorBridge,
  LEGACY_ERROR_BRIDGE_REMOVAL_CRITERIA,
  RushError,
  createRushDiagnostic,
  type IReporterEventEnvelope,
  type IRushDiagnostic
} from '../index';

function diagnosticEvent(diagnostic: IRushDiagnostic): IReporterEventEnvelope<unknown> {
  return { type: 'diagnosticEmitted', payload: diagnostic } as unknown as IReporterEventEnvelope<unknown>;
}

describe('isAlreadyReportedSentinel', () => {
  it('recognizes the sentinel by type and name', () => {
    expect(isAlreadyReportedSentinel(new AlreadyReportedError())).toBe(true);
    const namedError: Error = new Error('x');
    namedError.name = 'AlreadyReportedError';
    expect(isAlreadyReportedSentinel(namedError)).toBe(true);
    expect(isAlreadyReportedSentinel(new Error('generic'))).toBe(false);
    expect(isAlreadyReportedSentinel('not an error')).toBe(false);
  });
});

describe('LegacyErrorBridge', () => {
  it('exposes the documented removal criteria', () => {
    expect(LEGACY_ERROR_BRIDGE_REMOVAL_CRITERIA).toHaveLength(3);
    expect(LEGACY_ERROR_BRIDGE_REMOVAL_CRITERIA[0]).toContain('zero first-party');
  });

  it('suppresses rendering of a legacy sentinel', () => {
    const bridge: LegacyErrorBridge = new LegacyErrorBridge();
    expect(bridge.shouldSuppressRendering(new AlreadyReportedError())).toBe(true);
    expect(bridge.shouldSuppressRendering(new Error('unrepresented'))).toBe(false);
  });

  it('suppresses a RushError whose diagnostic was already emitted', () => {
    const bridge: LegacyErrorBridge = new LegacyErrorBridge();
    const diagnostic: IRushDiagnostic = createRushDiagnostic('RUSH_OPERATION_FAILED', {
      diagnosticId: 'diag_1'
    });
    const error: RushError = new RushError(diagnostic);

    // Before the diagnostic is recorded, the failure is not yet represented.
    expect(bridge.shouldSuppressRendering(error)).toBe(false);

    bridge.ingest(diagnosticEvent(diagnostic));
    expect(bridge.shouldSuppressRendering(error)).toBe(true);
  });

  it('records emitted diagnostics directly and by ingesting events', () => {
    const bridge: LegacyErrorBridge = new LegacyErrorBridge();
    bridge.recordEmittedDiagnostic('diag_direct');
    const directError: RushError = new RushError(
      createRushDiagnostic('RUSH_OPERATION_FAILED', { diagnosticId: 'diag_direct' })
    );
    expect(bridge.shouldSuppressRendering(directError)).toBe(true);
  });

  it('correlates a legacy sentinel with an emitted diagnostic id', () => {
    const bridge: LegacyErrorBridge = new LegacyErrorBridge();
    const sentinel: Error = new Error('legacy');
    bridge.correlate(sentinel, 'diag_2');
    expect(bridge.getCorrelatedDiagnosticId(sentinel)).toBe('diag_2');

    expect(bridge.shouldSuppressRendering(sentinel)).toBe(false);
    bridge.recordEmittedDiagnostic('diag_2');
    expect(bridge.shouldSuppressRendering(sentinel)).toBe(true);
  });
});
