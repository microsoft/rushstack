// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';
import type { CommandLineParameter } from '@rushstack/ts-command-line';

import type { IParameterJson, IPhase } from '../../api/CommandLineConfiguration';

/**
 * Associates command line parameters with their associated phases.
 * This helper is used to populate the `associatedParameters` set on each phase
 * based on the `associatedPhases` property of each parameter.
 *
 * @param customParameters - Map of parameter definitions to their CommandLineParameter instances
 * @param knownPhases - Map of phase names to IPhase objects
 */
export function associateParametersByPhase(
  customParameters: ReadonlyMap<IParameterJson, CommandLineParameter>,
  knownPhases: ReadonlyMap<string, IPhase>
): void {
  for (const [parameterJson, tsCommandLineParameter] of customParameters) {
    if (parameterJson.associatedPhases) {
      for (const phaseName of parameterJson.associatedPhases) {
        const phase: IPhase | undefined = knownPhases.get(phaseName);
        if (!phase) {
          throw new InternalError(`Could not find a phase matching ${phaseName}.`);
        }
        phase.associatedParameters.add(tsCommandLineParameter);
      }
    }
  }
}
