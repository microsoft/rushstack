// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This is a false-positive
// eslint-disable-next-line import/no-extraneous-dependencies
import { JsonFile } from '@rushstack/node-core-library';

import type { RushSession, RushConfiguration, ITelemetryData } from '../../../index.ts';

export default class RushMockFlushTelemetryPlugin {
  public apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void {
    async function flushTelemetry(data: ReadonlyArray<ITelemetryData>): Promise<void> {
      const targetPath: string = `${rushConfiguration.commonTempFolder}/test-telemetry.json`;
      await JsonFile.saveAsync(data, targetPath, { ignoreUndefinedValues: true });
    }

    rushSession.hooks.flushTelemetry.tapPromise(RushMockFlushTelemetryPlugin.name, flushTelemetry);
  }
}
