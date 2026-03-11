// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as stub from '../storybook-telemetry-stub';
import * as officialExports from '@storybook/telemetry-8';

const stubRecord: Record<string, unknown> = stub;

describe('storybook-telemetry-stub (v8 compatibility)', () => {
  it('should export every name from @storybook/telemetry v8', () => {
    const officialNames: readonly (keyof typeof stub)[] = Object.keys(
      officialExports
    ) as (keyof typeof stub)[];
    for (const name of officialNames) {
      expect(stub).toHaveProperty(name);
    }
  });

  it('should match runtime types of the official v8 package', () => {
    for (const [name, value] of Object.entries(officialExports)) {
      expect(typeof stubRecord[name]).toBe(typeof value);
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
