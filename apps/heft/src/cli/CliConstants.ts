// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Strings that define Heft's top-level command line. These are shared by the lean command-line implementation
 * and the full ts-command-line based implementation, which must produce identical output.
 */
export const HEFT_TOOL_FILENAME: 'heft' = 'heft';

export const HEFT_TOOL_DESCRIPTION: string = 'Heft is a pluggable build system designed for web projects.';

export const DEBUG_PARAMETER_DESCRIPTION: string =
  'Show the full call stack if an error occurs while executing the tool';

export const UNMANAGED_PARAMETER_DESCRIPTION: string =
  'Disables the Heft version selector: When Heft is invoked via the shell path, normally it' +
  " will examine the project's package.json dependencies and try to use the locally installed version" +
  ' of Heft. Specify "--unmanaged" to force the invoked version of Heft to be used. This is useful for' +
  ' example if you want to test a different version of Heft.';

export const VERBOSE_PARAMETER_DESCRIPTION: string = 'If specified, log information useful for debugging.';

export const CLEAN_ACTION_DOCUMENTATION: string =
  'Clean the project, removing temporary task folders and specified clean paths.';

/**
 * The description of the remainder parameter that ts-command-line's `ScopedCommandLineAction` defines.
 */
export const SCOPED_ACTION_REMAINDER_DESCRIPTION: string =
  'Scoped parameters.  Must be prefixed with "--", ex. "-- --scopedParameter ' +
  'foo --scopedFlag".  For more information on available scoped parameters, use "-- --help".';

export function getRunActionDocumentation(watch: boolean): string {
  return `Run a provided selection of Heft phases${watch ? ' in watch mode.' : ''}.`;
}

export function getPhaseActionSummary(phaseName: string, watch: boolean): string {
  return (
    `Runs to the ${phaseName} phase, including all transitive dependencies` +
    (watch ? ', in watch mode.' : '.')
  );
}

export function getPhaseActionDocumentation(
  phaseName: string,
  phaseDescription: string | undefined,
  watch: boolean
): string {
  return getPhaseActionSummary(phaseName, watch) + (phaseDescription ? `  ${phaseDescription}` : '');
}
