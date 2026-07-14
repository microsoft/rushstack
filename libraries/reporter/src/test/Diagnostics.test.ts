// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  RUSH_DIAGNOSTIC_CODE_DEFINITIONS,
  RUSH_DIAGNOSTIC_CODES,
  RUSH_DIAGNOSTIC_TEMPLATES,
  RUSH_INTERNAL_ERROR_CODE,
  isValidRushDiagnosticCode,
  computeEnvelopePrivacyFloor,
  getPrivacyClassificationRank,
  createRushDiagnostic,
  RushError,
  type IRushDiagnostic,
  type IRushDiagnosticCodeDefinition,
  type RushDiagnosticCategory,
  type ReporterPrivacyClassification
} from '../index';

const VALID_CATEGORIES: readonly RushDiagnosticCategory[] = [
  'configuration',
  'input',
  'dependency-tool',
  'environment',
  'network-auth',
  'operation',
  'internal'
];

describe('RushDiagnosticCodeRegistry', () => {
  it('uses well-formed, unique, never-reused codes', () => {
    const seen: Set<string> = new Set();
    for (const definition of RUSH_DIAGNOSTIC_CODE_DEFINITIONS) {
      expect(isValidRushDiagnosticCode(definition.code)).toBe(true);
      expect(seen.has(definition.code)).toBe(false);
      seen.add(definition.code);
    }
    expect(seen.size).toBe(RUSH_DIAGNOSTIC_CODE_DEFINITIONS.length);
  });

  it('indexes every definition by its own code', () => {
    expect(RUSH_DIAGNOSTIC_CODES.size).toBe(RUSH_DIAGNOSTIC_CODE_DEFINITIONS.length);
    for (const definition of RUSH_DIAGNOSTIC_CODE_DEFINITIONS) {
      expect(RUSH_DIAGNOSTIC_CODES.get(definition.code)).toBe(definition);
    }
  });

  it('assigns a valid category to every definition', () => {
    for (const definition of RUSH_DIAGNOSTIC_CODE_DEFINITIONS) {
      expect(VALID_CATEGORIES).toContain(definition.category);
    }
  });

  it('provides an English template for every summary and detail key', () => {
    for (const definition of RUSH_DIAGNOSTIC_CODE_DEFINITIONS) {
      expect(typeof RUSH_DIAGNOSTIC_TEMPLATES[definition.summaryKey]).toBe('string');
      if (definition.detailKey !== undefined) {
        expect(typeof RUSH_DIAGNOSTIC_TEMPLATES[definition.detailKey]).toBe('string');
      }
    }
  });

  it('registers the stable internal-error code under the internal category', () => {
    const definition: IRushDiagnosticCodeDefinition | undefined =
      RUSH_DIAGNOSTIC_CODES.get(RUSH_INTERNAL_ERROR_CODE);
    expect(definition).toBeDefined();
    expect(definition?.category).toBe('internal');
  });

  it('rejects malformed codes', () => {
    expect(isValidRushDiagnosticCode('rush_config_invalid')).toBe(false); // lowercase
    expect(isValidRushDiagnosticCode('RUSH_CONFIG')).toBe(false); // missing name segment
    expect(isValidRushDiagnosticCode('CONFIG_INVALID_JSON')).toBe(false); // missing RUSH_ prefix
    expect(isValidRushDiagnosticCode('RUSH__DOUBLE')).toBe(false); // empty segment
  });
});

describe('DiagnosticPrivacy', () => {
  it('ranks classifications from least to most sensitive', () => {
    expect(getPrivacyClassificationRank('public')).toBe(0);
    expect(getPrivacyClassificationRank('local-sensitive')).toBe(1);
    expect(getPrivacyClassificationRank('secret')).toBe(2);
  });

  it('defaults to public when there are no fields', () => {
    expect(computeEnvelopePrivacyFloor([])).toBe('public');
  });

  it('returns the least sensitive classification as the floor', () => {
    expect(computeEnvelopePrivacyFloor(['public', 'secret'])).toBe('public');
    expect(computeEnvelopePrivacyFloor(['local-sensitive', 'secret'])).toBe('local-sensitive');
    expect(computeEnvelopePrivacyFloor(['secret', 'secret'])).toBe('secret');
  });

  it('produces a floor no more sensitive than any field', () => {
    const fields: ReporterPrivacyClassification[] = ['secret', 'local-sensitive', 'public'];
    const floor: ReporterPrivacyClassification = computeEnvelopePrivacyFloor(fields);
    for (const field of fields) {
      expect(getPrivacyClassificationRank(floor)).toBeLessThanOrEqual(getPrivacyClassificationRank(field));
    }
  });
});

describe('createRushDiagnostic', () => {
  it('derives category, severity, and template keys from the registry', () => {
    const diagnostic: IRushDiagnostic = createRushDiagnostic('RUSH_DEPENDENCY_TOOL_FAILED');
    expect(diagnostic.code).toBe('RUSH_DEPENDENCY_TOOL_FAILED');
    expect(diagnostic.category).toBe('dependency-tool');
    expect(diagnostic.severity).toBe('error');
    expect(diagnostic.summaryKey).toBe('diagnostic.RUSH_DEPENDENCY_TOOL_FAILED.summary');
    expect(diagnostic.detailKey).toBe('diagnostic.RUSH_DEPENDENCY_TOOL_FAILED.detail');
  });

  it('generates a unique diagnostic id when none is supplied', () => {
    const first: IRushDiagnostic = createRushDiagnostic('RUSH_OPERATION_FAILED');
    const second: IRushDiagnostic = createRushDiagnostic('RUSH_OPERATION_FAILED');
    expect(typeof first.diagnosticId).toBe('string');
    expect(first.diagnosticId.length).toBeGreaterThan(0);
    expect(first.diagnosticId).not.toBe(second.diagnosticId);
  });

  it('honors an explicit diagnostic id, severity, and parameters', () => {
    const diagnostic: IRushDiagnostic = createRushDiagnostic('RUSH_INPUT_UNKNOWN_PROJECT', {
      diagnosticId: 'diag_fixed',
      severity: 'warning',
      parameters: {
        projectName: { value: 'my-project', privacy: 'public' }
      }
    });
    expect(diagnostic.diagnosticId).toBe('diag_fixed');
    expect(diagnostic.severity).toBe('warning');
    expect(diagnostic.parameters?.projectName.value).toBe('my-project');
  });

  it('throws for an unknown code', () => {
    expect(() => createRushDiagnostic('RUSH_NOT_A_REAL_CODE')).toThrow(/Unknown Rush diagnostic code/);
  });
});

describe('RushError', () => {
  it('wraps a diagnostic and references its id', () => {
    const diagnostic: IRushDiagnostic = createRushDiagnostic('RUSH_OPERATION_FAILED', {
      diagnosticId: 'diag_err'
    });
    const error: RushError = new RushError(diagnostic);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RushError);
    expect(error.name).toBe('RushError');
    expect(error.diagnostic).toBe(diagnostic);
    expect(error.diagnosticId).toBe('diag_err');
    expect(error.message).toBe('RUSH_OPERATION_FAILED');
  });
});
