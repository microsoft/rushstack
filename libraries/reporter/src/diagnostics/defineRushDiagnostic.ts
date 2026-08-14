// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushDiagnosticCategory } from './RushDiagnosticCategory';
import type { RushDiagnosticSeverity } from './IRushDiagnostic';
import type { IRushRemediationAction, RushRemediationSafety } from './IRushRemediationAction';
import type { IRushDiagnosticCodeDefinition } from './RushDiagnosticCodeRegistry';
import {
  isValidRushDiagnosticCode,
  RUSH_DIAGNOSTIC_CODE_PREFIX,
  type ValidateRushDiagnosticCode
} from './RushDiagnosticCode';

/**
 * The authorable content of a remediation action.
 *
 * @remarks
 * Unlike the wire DTO ({@link IRushRemediationAction}), which references
 * presentation-free resource keys, the authoring form takes the English text
 * directly. `defineRushDiagnostic` derives stable resource keys from the
 * diagnostic code, so an author never writes -- or mis-types -- a key.
 */
export interface IRushRemediationActionAuthoring {
  /**
   * The English, human-readable description of this action. `{name}`
   * placeholders are substituted with the diagnostic's classified parameters
   * at render time.
   */
  readonly description: string;

  /**
   * An optional English prompt that an agent or user can follow to resolve
   * the diagnostic when the remediation is not otherwise obvious -- for
   * example, when a user misconfigured their package authentication and the
   * corrective steps depend on their environment.
   */
  readonly prompt?: string;

  /**
   * An optional shell command that performs the remediation.
   */
  readonly command?: string;

  /**
   * An optional documentation URL describing the remediation.
   */
  readonly documentationUrl?: string;

  /**
   * Whether this action is safe to execute automatically.
   */
  readonly automatedExecutionSafety: RushRemediationSafety;
}

/**
 * The authorable content of one diagnostic: everything a maintainer supplies
 * when crafting a diagnostic, in one place.
 *
 * @remarks
 * See {@link defineRushDiagnostic} for the full authoring contract.
 */
export interface IDefineRushDiagnosticInput {
  /**
   * The root-cause category of the diagnostic.
   */
  readonly category: RushDiagnosticCategory;

  /**
   * The severity applied when a producer does not override it.
   */
  readonly defaultSeverity: RushDiagnosticSeverity;

  /**
   * The English summary template. `{name}` placeholders are substituted with
   * the diagnostic's classified parameters at render time.
   */
  readonly summary: string;

  /**
   * An optional English detailed template, for full-detail destinations.
   */
  readonly detail?: string;

  /**
   * Optional default remediation actions. `createRushDiagnostic` attaches
   * these when the producer does not supply per-instance remediation.
   */
  readonly remediation?: readonly IRushRemediationActionAuthoring[];
}

/**
 * The output of `defineRushDiagnostic`: the registry entry plus the
 * English templates it contributes, keyed by derived resource keys.
 *
 * @typeParam TCode - the literal diagnostic code
 *
 * @beta
 */
export interface IRushDiagnosticEntry<TCode extends string = string> {
  /**
   * The permanent registry entry, with resource keys derived from the code.
   */
  readonly definition: IRushDiagnosticCodeDefinition & { readonly code: TCode };

  /**
   * The English templates for this diagnostic, keyed by derived resource key.
   */
  readonly templates: { readonly [resourceKey: string]: string };
}

/**
 * Defines one Rush diagnostic: its code, classification, default severity,
 * English templates, and default remediation.
 *
 * @remarks
 * This is the medium for crafting diagnostics. Each diagnostic lives in its
 * own module under `diagnostics/codes/` and looks like:
 *
 * ```ts
 * export const rdcNetworkAuthUnauthorized: IRushDiagnosticEntry<'RDC_NETWORK_AUTH_UNAUTHORIZED'> =
 *   defineRushDiagnostic({
 *     code: 'RDC_NETWORK_AUTH_UNAUTHORIZED',
 *     category: 'network-auth',
 *     defaultSeverity: 'error',
 *     summary: 'Authentication failed for the registry {registryUrl}.',
 *     remediation: [
 *       {
 *         description: 'Verify the credentials configured for {registryUrl}.',
 *         prompt: 'Inspect the package manager auth configuration ...',
 *         automatedExecutionSafety: 'unsafe'
 *       }
 *     ]
 *   });
 * ```
 *
 * The code is checked at compile time by {@link ValidateRushDiagnosticCode}
 * (and again at module load for untyped authors). Resource keys are derived
 * from the code -- `diagnostic.<CODE>.summary`, `diagnostic.<CODE>.detail`,
 * and `diagnostic.<CODE>.remediation.<index>.<field>` -- so keys can never
 * drift from the code they belong to.
 *
 * @param input - the authorable content, with a compile-time-validated code
 *
 * @beta
 */
export function defineRushDiagnostic<TCode extends string>(
  input: IDefineRushDiagnosticInput & { readonly code: TCode & ValidateRushDiagnosticCode<TCode> }
): IRushDiagnosticEntry<TCode>;
/**
 * The fallback overload reached only when `code` violates the naming
 * convention. Its parameter type IS the guidance: the compiler reports the
 * offending literal as not assignable to this message string, so the author
 * sees the expected `RDC_<DOMAIN>_<NAME>` shape instead of `never`.
 *
 * @beta
 */
export function defineRushDiagnostic(
  input: IDefineRushDiagnosticInput & {
    readonly code: 'Invalid Rush diagnostic code: expected RDC_<DOMAIN>_<NAME> (uppercase A-Z/0-9 segments)';
  }
): never;
export function defineRushDiagnostic(
  input: IDefineRushDiagnosticInput & { readonly code: string }
): IRushDiagnosticEntry<string> {
  const code: string = input.code;
  if (!isValidRushDiagnosticCode(code)) {
    // Untyped (JavaScript) authors bypass the compile-time contract; fail the
    // module load loudly instead of registering a malformed code.
    throw new Error(
      `Invalid Rush diagnostic code "${code}": expected ${RUSH_DIAGNOSTIC_CODE_PREFIX}` +
        '<DOMAIN>_<NAME> with non-empty uppercase A-Z/0-9 segments.'
    );
  }

  const summaryKey: string = `diagnostic.${code}.summary`;
  const detailKey: string | undefined = input.detail === undefined ? undefined : `diagnostic.${code}.detail`;

  const templates: { [resourceKey: string]: string } = { [summaryKey]: input.summary };
  if (detailKey !== undefined && input.detail !== undefined) {
    templates[detailKey] = input.detail;
  }

  let remediation: IRushRemediationAction[] | undefined;
  if (input.remediation !== undefined) {
    remediation = input.remediation.map(
      (action: IRushRemediationActionAuthoring, index: number): IRushRemediationAction => {
        const descriptionKey: string = `diagnostic.${code}.remediation.${index}.description`;
        templates[descriptionKey] = action.description;
        let promptKey: string | undefined;
        if (action.prompt !== undefined) {
          promptKey = `diagnostic.${code}.remediation.${index}.prompt`;
          templates[promptKey] = action.prompt;
        }
        return {
          descriptionKey,
          promptKey,
          command: action.command,
          documentationUrl: action.documentationUrl,
          automatedExecutionSafety: action.automatedExecutionSafety
        };
      }
    );
  }

  return {
    definition: {
      code,
      category: input.category,
      defaultSeverity: input.defaultSeverity,
      summaryKey,
      detailKey,
      remediation
    },
    templates
  };
}
