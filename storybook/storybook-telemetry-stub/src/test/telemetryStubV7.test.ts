// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as stub from '../index';

/**
 * Expected exports and their runtime types for \@storybook/telemetry v7.
 */
const EXPECTED_V7_EXPORTS: Record<string, string> = {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let officialExports: Record<string, any>;

  beforeAll(() => {
    // The aliased devDependency "@storybook/telemetry-7" resolves to @storybook/telemetry@7.x
    officialExports = require('@storybook/telemetry-7');
  });

  it('should export every name from @storybook/telemetry v7', () => {
    const officialNames: string[] = Object.keys(officialExports).sort();
    for (const name of officialNames) {
      expect(stub).toHaveProperty(name);
    }
  });

  it('should have matching runtime types for all v7 exports', () => {
    for (const [name, expectedType] of Object.entries(EXPECTED_V7_EXPORTS)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (stub as any)[name]).toBe(expectedType);
    }
  });

  it('should match runtime types of the official v7 package', () => {
    const officialNames: string[] = Object.keys(officialExports);
    for (const name of officialNames) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (stub as any)[name]).toBe(typeof officialExports[name]);
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
