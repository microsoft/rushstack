// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A fresh native project configuration no longer matches the engine's graph and cache policy.
 * The host must recreate the engine before executing more work.
 * @alpha
 */
export class PhasedCommandEngineConfigurationChangedError extends Error {
  public constructor() {
    super('Resolved Rush project configuration changed; recreate the phased command engine.');
    this.name = 'PhasedCommandEngineConfigurationChangedError';
  }
}
