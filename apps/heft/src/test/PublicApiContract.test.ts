// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as heftIndex from '../index';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { MetricsCollector } from '../metrics/MetricsCollector';

// These tests pin the *runtime* surface of the package entry point. The type surface is pinned by the
// API report (common/reviews/api/heft.api.md); this guards against bundling/lazy-loading changes that keep the
// types identical but change what `require('@rushstack/heft')` returns at runtime.
describe('@rushstack/heft runtime entry point', () => {
  it('exports exactly the expected runtime values', () => {
    expect(Object.keys(heftIndex).sort()).toEqual(['HeftConfiguration', '_MetricsCollector']);
    expect(typeof heftIndex.HeftConfiguration).toBe('function');
    expect(typeof heftIndex._MetricsCollector).toBe('function');
  });

  it('re-exports the same objects as the deep-importable modules (no duplicated module state)', () => {
    expect(heftIndex.HeftConfiguration).toBe(HeftConfiguration);
    expect(heftIndex._MetricsCollector).toBe(MetricsCollector);
  });

  it('keeps the static factory used by the CLI', () => {
    expect(typeof HeftConfiguration.initialize).toBe('function');
  });
});
