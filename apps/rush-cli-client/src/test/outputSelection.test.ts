// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { selectClientOutputMode } from '../outputSelection';

describe(selectClientOutputMode.name, () => {
  it.each([
    { argv: ['build'], environment: {}, mode: 'legacy' },
    { argv: ['build'], environment: { RUSHD_OUTPUT: 'agent' }, mode: 'agent' },
    { argv: ['build'], environment: { RUSHD_OUTPUT: ' AGENT ' }, mode: 'agent' },
    { argv: ['build'], environment: { COPILOT_CLI: '1' }, mode: 'agent' },
    { argv: ['build'], environment: { COPILOT_CLI: 'false' }, mode: 'legacy' },
    { argv: ['build'], environment: { COPILOT_CLI: '1', RUSHD_OUTPUT: 'legacy' }, mode: 'legacy' },
    { argv: ['build', '--reporter=ai'], environment: {}, mode: 'agent' },
    { argv: ['build', '--reporter', 'ai'], environment: {}, mode: 'agent' },
    { argv: ['build', '--reporter=ai'], environment: { RUSHD_OUTPUT: 'legacy' }, mode: 'legacy' },
    { argv: ['build'], environment: { RUSH_REPORTER: 'ai' }, mode: 'agent' },
    { argv: ['build', '--reporter=json'], environment: { RUSH_REPORTER: 'ai' }, mode: 'legacy' },
    { argv: ['build', '--', '--reporter=ai'], environment: {}, mode: 'legacy' },
    { argv: ['build'], environment: { CLAUDECODE: '1' }, mode: 'legacy' }
  ])('selects $mode for $argv with $environment', ({ argv, environment, mode }) => {
    expect(selectClientOutputMode(argv, environment)).toBe(mode);
  });
});
