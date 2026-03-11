// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as stub from '../storybook-telemetry-stub';

const stubRecord: Record<string, unknown> = stub;

// Storybook 7 is out of support; hardcode the expected exports from @storybook/telemetry@~7.6.0
const OFFICIAL_V7_EXPORTS: Record<string, string> = {
  addToGlobalContext: 'function',
  computeStorybookMetadata: 'function',
  getPrecedingUpgrade: 'function',
  getStorybookMetadata: 'function',
  metaFrameworks: 'object',
  oneWayHash: 'function',
  sanitizeAddonName: 'function',
  telemetry: 'function'
};

describe('storybook-telemetry-stub (v7 compatibility)', () => {
  it('should export every name from @storybook/telemetry v7', () => {
    for (const name of Object.keys(OFFICIAL_V7_EXPORTS)) {
      expect(stub).toHaveProperty(name);
    }
  });

  it('should match runtime types of the official v7 package', () => {
    for (const [name, expectedType] of Object.entries(OFFICIAL_V7_EXPORTS)) {
      expect(typeof stubRecord[name]).toBe(expectedType);
    }
  });

  it('computeStorybookMetadata should return a non-null object', async () => {
    const result = await stub.computeStorybookMetadata();
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });

  it('getStorybookMetadata should return a non-null object', async () => {
    const result = await stub.getStorybookMetadata();
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });
});
