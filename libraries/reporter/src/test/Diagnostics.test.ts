// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  RUSH_DIAGNOSTIC_CODE_DEFINITIONS,
  RUSH_DIAGNOSTIC_CODES,
  RUSH_DIAGNOSTIC_TEMPLATES,
  RUSH_INTERNAL_ERROR_CODE,
  ALL_RUSH_DIAGNOSTICS,
  isValidRushDiagnosticCode,
  computeEnvelopePrivacyFloor,
  getPrivacyClassificationRank,
  createRushDiagnostic,
  RushError,
  type IRushDiagnostic,
  type IRushDiagnosticCodeDefinition,
  type IRushRemediationAction,
  type RushDiagnosticCategory,
  type RushDiagnosticCode,
  type ReporterPrivacyClassification
} from '../index';
import {
  defineRushDiagnostic,
  type IRushDiagnosticEntry
} from '../diagnostics/defineRushDiagnostic';

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
    // Duplicate or malformed codes are caught here, at test time -- the
    // registry deliberately does not throw at module load, so a bad entry
    // cannot make the entire package unimportable.
    const seen: Set<string> = new Set();
    for (const entry of ALL_RUSH_DIAGNOSTICS) {
      const definition: IRushDiagnosticCodeDefinition = entry.definition;
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

  it('provides an English template for every summary, detail, and remediation key', () => {
    for (const definition of RUSH_DIAGNOSTIC_CODE_DEFINITIONS) {
      expect(typeof RUSH_DIAGNOSTIC_TEMPLATES[definition.summaryKey]).toBe('string');
      if (definition.detailKey !== undefined) {
        expect(typeof RUSH_DIAGNOSTIC_TEMPLATES[definition.detailKey]).toBe('string');
      }
      for (const action of definition.remediation ?? []) {
        expect(typeof RUSH_DIAGNOSTIC_TEMPLATES[action.descriptionKey]).toBe('string');
        if (action.promptKey !== undefined) {
          expect(typeof RUSH_DIAGNOSTIC_TEMPLATES[action.promptKey]).toBe('string');
        }
      }
    }
  });

  it('snapshots the placeholders referenced by every template', () => {
    // Templates reference `{name}` placeholders that producers must supply as
    // classified parameters. Pinning the placeholder set per template makes
    // adding or renaming a placeholder a reviewable diff.
    const placeholderPattern: RegExp = /\{([A-Za-z0-9_]+)\}/g;
    const placeholdersByKey: { [resourceKey: string]: string[] } = {};
    for (const resourceKey of Object.keys(RUSH_DIAGNOSTIC_TEMPLATES).sort()) {
      const template: string = RUSH_DIAGNOSTIC_TEMPLATES[resourceKey];
      const placeholders: string[] = [];
      let match: RegExpExecArray | null = placeholderPattern.exec(template);
      while (match !== null) {
        placeholders.push(match[1]);
        match = placeholderPattern.exec(template);
      }
      placeholdersByKey[resourceKey] = placeholders;
    }
    expect(placeholdersByKey).toMatchSnapshot();
  });

  it('registers the stable internal-error code under the internal category', () => {
    const definition: IRushDiagnosticCodeDefinition | undefined =
      RUSH_DIAGNOSTIC_CODES.get(RUSH_INTERNAL_ERROR_CODE);
    expect(definition).toBeDefined();
    expect(definition?.category).toBe('internal');
  });
});

describe('isValidRushDiagnosticCode', () => {
  it('accepts well-formed RDC_ codes', () => {
    expect(isValidRushDiagnosticCode('RDC_CONFIG_INVALID_JSON')).toBe(true);
    expect(isValidRushDiagnosticCode('RDC_A_B')).toBe(true);
    expect(isValidRushDiagnosticCode('RDC_TOOL_V2_FAILED')).toBe(true);
  });

  it('rejects malformed codes', () => {
    expect(isValidRushDiagnosticCode('rdc_config_invalid')).toBe(false); // lowercase
    expect(isValidRushDiagnosticCode('RDC_CONFIG')).toBe(false); // missing name segment
    expect(isValidRushDiagnosticCode('CONFIG_INVALID_JSON')).toBe(false); // missing RDC_ prefix
    expect(isValidRushDiagnosticCode('RDC__DOUBLE')).toBe(false); // empty segment
    expect(isValidRushDiagnosticCode('RDC_CONFIG_')).toBe(false); // trailing empty segment
    expect(isValidRushDiagnosticCode('RDC_')).toBe(false); // empty body
    expect(isValidRushDiagnosticCode('RDC_CONFIG-INVALID')).toBe(false); // invalid character
    expect(isValidRushDiagnosticCode('')).toBe(false);
  });

  it('rejects the retired RUSH_ prefix', () => {
    expect(isValidRushDiagnosticCode('RUSH_CONFIG_INVALID_JSON')).toBe(false);
  });
});

describe('defineRushDiagnostic', () => {
  it('derives resource keys from the code', () => {
    const entry: IRushDiagnosticEntry<'RDC_TEST_DERIVED'> = defineRushDiagnostic({
      code: 'RDC_TEST_DERIVED',
      category: 'internal',
      defaultSeverity: 'warning',
      summary: 'A summary mentioning {thing}.',
      detail: 'A detail.'
    });

    expect(entry.definition.code).toBe('RDC_TEST_DERIVED');
    expect(entry.definition.category).toBe('internal');
    expect(entry.definition.defaultSeverity).toBe('warning');
    expect(entry.definition.summaryKey).toBe('diagnostic.RDC_TEST_DERIVED.summary');
    expect(entry.definition.detailKey).toBe('diagnostic.RDC_TEST_DERIVED.detail');
    expect(entry.templates).toEqual({
      'diagnostic.RDC_TEST_DERIVED.summary': 'A summary mentioning {thing}.',
      'diagnostic.RDC_TEST_DERIVED.detail': 'A detail.'
    });
  });

  it('derives remediation description and prompt keys and defaults', () => {
    const entry: IRushDiagnosticEntry<'RDC_TEST_REMEDIATION'> = defineRushDiagnostic({
      code: 'RDC_TEST_REMEDIATION',
      category: 'network-auth',
      defaultSeverity: 'error',
      summary: 'Auth failed.',
      remediation: [
        {
          description: 'Fix the thing.',
          prompt: 'Follow these steps to fix the thing.',
          automatedExecutionSafety: 'unsafe'
        },
        {
          description: 'Run the fixer.',
          command: 'rush fix',
          automatedExecutionSafety: 'requires-confirmation'
        }
      ]
    });

    const actions: readonly IRushRemediationAction[] = entry.definition.remediation!;
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({
      descriptionKey: 'diagnostic.RDC_TEST_REMEDIATION.remediation.0.description',
      promptKey: 'diagnostic.RDC_TEST_REMEDIATION.remediation.0.prompt',
      command: undefined,
      documentationUrl: undefined,
      automatedExecutionSafety: 'unsafe'
    });
    expect(actions[1]).toEqual({
      descriptionKey: 'diagnostic.RDC_TEST_REMEDIATION.remediation.1.description',
      promptKey: undefined,
      command: 'rush fix',
      documentationUrl: undefined,
      automatedExecutionSafety: 'requires-confirmation'
    });
    expect(entry.templates['diagnostic.RDC_TEST_REMEDIATION.remediation.0.prompt']).toBe(
      'Follow these steps to fix the thing.'
    );
  });

  it('enforces the RDC_ naming convention at compile time', () => {
    // Each of these is a compile error via ValidateRushDiagnosticCode; the
    // runtime guard then rejects the forced call for untyped authors.
    expect(() =>
      defineRushDiagnostic({
        // @ts-expect-error - lowercase codes violate the naming convention
        code: 'rdc_lower_case',
        category: 'internal',
        defaultSeverity: 'error',
        summary: 'x'
      })
    ).toThrow(/Invalid Rush diagnostic code/);
    expect(() =>
      defineRushDiagnostic({
        // @ts-expect-error - codes without the RDC_ prefix violate the naming convention
        code: 'CONFIG_INVALID_JSON',
        category: 'internal',
        defaultSeverity: 'error',
        summary: 'x'
      })
    ).toThrow(/Invalid Rush diagnostic code/);
    expect(() =>
      defineRushDiagnostic({
        // @ts-expect-error - a single segment is not a valid code
        code: 'RDC_CONFIG',
        category: 'internal',
        defaultSeverity: 'error',
        summary: 'x'
      })
    ).toThrow(/Invalid Rush diagnostic code/);
    // The compile-time check is exactly as strict as the runtime matcher:
    // each of the following used to slip past the type while the runtime
    // rejected it.
    expect(() =>
      defineRushDiagnostic({
        // @ts-expect-error - an empty segment (doubled underscore) is not a valid code
        code: 'RDC_A_B__C',
        category: 'internal',
        defaultSeverity: 'error',
        summary: 'x'
      })
    ).toThrow(/Invalid Rush diagnostic code/);
    expect(() =>
      defineRushDiagnostic({
        // @ts-expect-error - a trailing empty segment is not a valid code
        code: 'RDC_A_B_',
        category: 'internal',
        defaultSeverity: 'error',
        summary: 'x'
      })
    ).toThrow(/Invalid Rush diagnostic code/);
    expect(() =>
      defineRushDiagnostic({
        // @ts-expect-error - a hyphen is outside the A-Z/0-9 segment character set
        code: 'RDC_CONFIG-INVALID_JSON',
        category: 'internal',
        defaultSeverity: 'error',
        summary: 'x'
      })
    ).toThrow(/Invalid Rush diagnostic code/);
  });

  it('throws at module load for untyped authors with an invalid code', () => {
    expect(() =>
      defineRushDiagnostic({
        code: 'RDC_lower_case' as unknown as 'RDC_LOWER_CASE',
        category: 'internal',
        defaultSeverity: 'error',
        summary: 'x'
      })
    ).toThrow(/Invalid Rush diagnostic code/);
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
    const diagnostic: IRushDiagnostic = createRushDiagnostic('RDC_DEPENDENCY_TOOL_FAILED');
    expect(diagnostic.code).toBe('RDC_DEPENDENCY_TOOL_FAILED');
    expect(diagnostic.category).toBe('dependency-tool');
    expect(diagnostic.severity).toBe('error');
    expect(diagnostic.summaryKey).toBe('diagnostic.RDC_DEPENDENCY_TOOL_FAILED.summary');
    expect(diagnostic.detailKey).toBe('diagnostic.RDC_DEPENDENCY_TOOL_FAILED.detail');
  });

  it('accepts only registered codes at compile time', () => {
    // @ts-expect-error - not a registered code
    const diagnostic: IRushDiagnostic = createRushDiagnostic('RDC_NOT_A_REAL_CODE');
    // ...but the forced call still degrades instead of throwing.
    expect(diagnostic.code).toBe(RUSH_INTERNAL_ERROR_CODE);
  });

  it('attaches definition-level remediation when the producer does not override it', () => {
    const diagnostic: IRushDiagnostic = createRushDiagnostic('RDC_NETWORK_AUTH_UNAUTHORIZED', {
      parameters: {
        registryUrl: { value: 'https://registry.example.com', privacy: 'public' }
      }
    });
    expect(diagnostic.remediation).toHaveLength(1);
    const action: IRushRemediationAction = diagnostic.remediation![0];
    expect(action.descriptionKey).toBe('diagnostic.RDC_NETWORK_AUTH_UNAUTHORIZED.remediation.0.description');
    expect(action.promptKey).toBe('diagnostic.RDC_NETWORK_AUTH_UNAUTHORIZED.remediation.0.prompt');
    expect(action.automatedExecutionSafety).toBe('unsafe');
    expect(typeof RUSH_DIAGNOSTIC_TEMPLATES[action.promptKey!]).toBe('string');
  });

  it('prefers per-instance remediation over the definition default', () => {
    const override: IRushRemediationAction = {
      descriptionKey: 'remediation.custom',
      automatedExecutionSafety: 'safe'
    };
    const diagnostic: IRushDiagnostic = createRushDiagnostic('RDC_NETWORK_AUTH_UNAUTHORIZED', {
      remediation: [override]
    });
    expect(diagnostic.remediation).toEqual([override]);
  });

  it('generates a unique diagnostic id when none is supplied', () => {
    const first: IRushDiagnostic = createRushDiagnostic('RDC_OPERATION_FAILED');
    const second: IRushDiagnostic = createRushDiagnostic('RDC_OPERATION_FAILED');
    expect(typeof first.diagnosticId).toBe('string');
    expect(first.diagnosticId.length).toBeGreaterThan(0);
    expect(first.diagnosticId).not.toBe(second.diagnosticId);
  });

  it('honors an explicit diagnostic id, severity, and parameters', () => {
    const diagnostic: IRushDiagnostic = createRushDiagnostic('RDC_INPUT_UNKNOWN_PROJECT', {
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

  it('degrades an unknown code forced past the type checker to the internal error', () => {
    const diagnostic: IRushDiagnostic = createRushDiagnostic('RDC_NOT_A_REAL_CODE' as RushDiagnosticCode, {
      parameters: {
        projectName: { value: 'my-project', privacy: 'public' }
      }
    });
    expect(diagnostic.code).toBe(RUSH_INTERNAL_ERROR_CODE);
    expect(diagnostic.category).toBe('internal');
    expect(diagnostic.severity).toBe('error');
    expect(diagnostic.summaryKey).toBe(`diagnostic.${RUSH_INTERNAL_ERROR_CODE}.summary`);
    // The unknown code is preserved as a public-classified parameter, merged
    // with the caller's parameters.
    expect(diagnostic.parameters?.requestedCode).toEqual({
      value: 'RDC_NOT_A_REAL_CODE',
      privacy: 'public'
    });
    expect(diagnostic.parameters?.projectName).toEqual({ value: 'my-project', privacy: 'public' });
  });

  it('honors a caller severity override when degrading an unknown code', () => {
    const diagnostic: IRushDiagnostic = createRushDiagnostic('RDC_NOT_A_REAL_CODE' as RushDiagnosticCode, {
      severity: 'warning'
    });
    expect(diagnostic.code).toBe(RUSH_INTERNAL_ERROR_CODE);
    expect(diagnostic.severity).toBe('warning');
    expect(diagnostic.parameters?.requestedCode).toEqual({
      value: 'RDC_NOT_A_REAL_CODE',
      privacy: 'public'
    });
  });
});

describe('RushError', () => {
  it('wraps a diagnostic and references its id', () => {
    const diagnostic: IRushDiagnostic = createRushDiagnostic('RDC_OPERATION_FAILED', {
      diagnosticId: 'diag_err'
    });
    const error: RushError = new RushError(diagnostic);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RushError);
    expect(error.name).toBe('RushError');
    expect(error.diagnostic).toBe(diagnostic);
    expect(error.diagnosticId).toBe('diag_err');
    expect(error.message).toBe('RDC_OPERATION_FAILED');
  });
});
