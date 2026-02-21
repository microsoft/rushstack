// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { OverlappingPathAnalyzer } from '../OverlappingPathAnalyzer.ts';

describe(OverlappingPathAnalyzer.name, () => {
  it("returns nothing if two single-folder paths don't overlap", () => {
    const analyzer: OverlappingPathAnalyzer<string> = new OverlappingPathAnalyzer<string>();
    expect(analyzer.addPathAndGetFirstEncounteredLabels('lib', 'a')).toBeUndefined();
    expect(analyzer.addPathAndGetFirstEncounteredLabels('dist', 'b')).toBeUndefined();
  });

  it("returns nothing if two multi-folder paths don't overlap", () => {
    const analyzer1: OverlappingPathAnalyzer<string> = new OverlappingPathAnalyzer<string>();
    expect(analyzer1.addPathAndGetFirstEncounteredLabels('lib/a', 'a')).toBeUndefined();
    expect(analyzer1.addPathAndGetFirstEncounteredLabels('lib/b', 'b')).toBeUndefined();

    const analyzer2: OverlappingPathAnalyzer<string> = new OverlappingPathAnalyzer<string>();
    expect(analyzer2.addPathAndGetFirstEncounteredLabels('lib/a/c', 'a')).toBeUndefined();
    expect(analyzer2.addPathAndGetFirstEncounteredLabels('lib/b/c', 'b')).toBeUndefined();
  });

  it('returns a label if two single-folder paths overlap', () => {
    const analyzer: OverlappingPathAnalyzer<string> = new OverlappingPathAnalyzer<string>();
    expect(analyzer.addPathAndGetFirstEncounteredLabels('lib', 'a')).toBeUndefined();
    expect(analyzer.addPathAndGetFirstEncounteredLabels('lib', 'b')).toEqual(['a']);
  });

  it('returns a label if two multi-folder paths overlap', () => {
    const analyzer1: OverlappingPathAnalyzer<string> = new OverlappingPathAnalyzer<string>();
    expect(analyzer1.addPathAndGetFirstEncounteredLabels('lib', 'a')).toBeUndefined();
    expect(analyzer1.addPathAndGetFirstEncounteredLabels('lib/a', 'b')).toEqual(['a']);
    expect(analyzer1.addPathAndGetFirstEncounteredLabels('lib/a/b', 'c')).toEqual(['a']);
    expect(analyzer1.addPathAndGetFirstEncounteredLabels('dist/a/b/c', 'd')).toBeUndefined();
    expect(analyzer1.addPathAndGetFirstEncounteredLabels('dist/a', 'e')).toEqual(['d']);
    expect(analyzer1.addPathAndGetFirstEncounteredLabels('dist/b/c/e', 'f')).toBeUndefined();
    expect(analyzer1.addPathAndGetFirstEncounteredLabels('dist/b/c/e/f', 'e')).toEqual(['f']);

    const analyzer2: OverlappingPathAnalyzer<string> = new OverlappingPathAnalyzer<string>();
    expect(analyzer2.addPathAndGetFirstEncounteredLabels('lib/a/b/c', 'a')).toBeUndefined();
    expect(analyzer2.addPathAndGetFirstEncounteredLabels('lib/a/b/d', 'b')).toBeUndefined();
    expect(analyzer2.addPathAndGetFirstEncounteredLabels('lib/a/b/e', 'c')).toBeUndefined();
    expect(analyzer2.addPathAndGetFirstEncounteredLabels('lib/a', 'd')).toEqual(['a', 'b', 'c']);
  });
});
