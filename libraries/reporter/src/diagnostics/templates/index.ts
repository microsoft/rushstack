// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushDiagnosticTemplateKey } from '../RushDiagnosticCodeRegistry';
import { CONFIGURATION_DIAGNOSTIC_TEMPLATES } from './configuration';
import { INPUT_DIAGNOSTIC_TEMPLATES } from './input';
import { DEPENDENCY_TOOL_DIAGNOSTIC_TEMPLATES } from './dependencyTool';
import { ENVIRONMENT_DIAGNOSTIC_TEMPLATES } from './environment';
import { NETWORK_AUTH_DIAGNOSTIC_TEMPLATES } from './networkAuth';
import { OPERATION_DIAGNOSTIC_TEMPLATES } from './operation';
import { INTERNAL_DIAGNOSTIC_TEMPLATES } from './internal';

/**
 * The English templates for Rush diagnostics, keyed by resource key.
 *
 * @remarks
 * Placeholders of the form `{name}` are substituted with the diagnostic's
 * classified parameters at render time. Only English is provided in v1.
 *
 * Templates are authored in per-domain modules under
 * `src/diagnostics/templates/`. The `Record<RushDiagnosticTemplateKey, string>`
 * typing makes a template missing for any registered `summaryKey`/`detailKey`
 * a compile-time error.
 *
 * @beta
 */
export const RUSH_DIAGNOSTIC_TEMPLATES: Readonly<Record<RushDiagnosticTemplateKey, string>> = {
  ...CONFIGURATION_DIAGNOSTIC_TEMPLATES,
  ...INPUT_DIAGNOSTIC_TEMPLATES,
  ...DEPENDENCY_TOOL_DIAGNOSTIC_TEMPLATES,
  ...ENVIRONMENT_DIAGNOSTIC_TEMPLATES,
  ...NETWORK_AUTH_DIAGNOSTIC_TEMPLATES,
  ...OPERATION_DIAGNOSTIC_TEMPLATES,
  ...INTERNAL_DIAGNOSTIC_TEMPLATES
};
