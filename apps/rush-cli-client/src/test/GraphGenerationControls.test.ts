// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parseGraphGenerationControls } from '../GraphGenerationControls';

describe(parseGraphGenerationControls.name, () => {
  it.each(['scope-in', 'scope-out', 'invalidate', 'pause', 'resume'])(
    'preserves explicit generation and selectors for %s',
    (verb) => {
      expect(parseGraphGenerationControls(['graph', verb, '--generation', 'old-token', '--project', 'a']))
        .toEqual({ argv: ['graph', verb, '--project', 'a'], mutation: true, generation: 'old-token' });
      expect(parseGraphGenerationControls(['graph', verb, '--generation=old-token']))
        .toEqual({ argv: ['graph', verb], mutation: true, generation: 'old-token' });
      expect(parseGraphGenerationControls(['graph', verb]))
        .toEqual({ argv: ['graph', verb], mutation: true, generation: undefined });
    }
  );

  it.each([
    ['graph', 'show', '--generation', 'token'],
    ['graph', 'status', '--generation=token'],
    ['graph', 'watch', '--generation=token'],
    ['graph', 'pause', '--generation'],
    ['graph', 'pause', '--generation='],
    ['graph', 'pause', '--generation', ' token'],
    ['graph', 'pause', '--generation', '--project'],
    ['graph', 'pause', '--generation=one', '--generation=two']
  ])('rejects malformed generation controls %j', (...argv) => {
    expect(() => parseGraphGenerationControls(argv)).toThrow('--generation');
  });
});
