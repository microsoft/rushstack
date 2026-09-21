// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester } from '@typescript-eslint/rule-tester';

import { getRuleTesterWithProject, getRuleTesterWithoutProject } from './ruleTester';
import { noPerChunkBufferToStringRule } from '../no-per-chunk-buffer-to-string';

const ruleTester: RuleTester = getRuleTesterWithoutProject();
const typedRuleTester: RuleTester = getRuleTesterWithProject();

ruleTester.run('no-per-chunk-buffer-to-string', noPerChunkBufferToStringRule, {
  invalid: [
    {
      code: [
        "stream.on('data', (chunk) => {",
        '    output += chunk.toString();',
        '});'
      ].join('\n'),
      errors: [{ messageId: 'error-per-chunk-buffer-to-string' }]
    },
    {
      code: [
        "stdout.addListener('data', function (chunk) {",
        "  chunks.push(chunk.toString('utf8'));",
        '});'
      ].join('\n'),
      errors: [{ messageId: 'error-per-chunk-buffer-to-string' }]
    },
    {
      code: [
        "stream.prependListener('data', (chunk) => {",
        '  output += chunk.toString();',
        '});'
      ].join('\n'),
      errors: [{ messageId: 'error-per-chunk-buffer-to-string' }]
    },
    {
      code: ['for (const chunk of chunks) {', '  output += chunk.toString();', '}'].join('\n'),
      errors: [{ messageId: 'error-per-chunk-buffer-to-string' }]
    },
    {
      code: 'chunks.map((chunk) => chunk.toString())',
      errors: [{ messageId: 'error-per-chunk-buffer-to-string' }]
    },
    {
      code: "chunks.reduce((text, chunk) => text + chunk.toString(), '')",
      errors: [{ messageId: 'error-per-chunk-buffer-to-string' }]
    },
    {
      code: "chunks.map((chunk) => chunk['toString']())",
      errors: [{ messageId: 'error-per-chunk-buffer-to-string' }]
    },
    {
      code: [
        "stream.on('data', (data) => {",
        '  output += data.toString();',
        '});'
      ].join('\n'),
      options: [{ chunkVariableNames: ['data'] }],
      errors: [{ messageId: 'error-per-chunk-buffer-to-string' }]
    },
    {
      code: [
        'async function readAsync() {',
        '  for await (const chunk of stream) {',
        '    output += chunk.toString();',
        '  }',
        '}'
      ].join('\n'),
      errors: [{ messageId: 'error-per-chunk-buffer-to-string' }]
    }
  ],
  valid: [
    {
      code: [
        "stream.on('data', (chunk) => {",
        '  output += decoder.decode(chunk, { stream: true });',
        '});'
      ].join('\n')
    },
    {
      code: 'items.map((item) => item.toString())'
    },
    {
      code: [
        "const buffer = Buffer.from('abc');",
        'const text = buffer.toString();'
      ].join('\n')
    },
    {
      code: [
        'function logChunk(chunk) {',
        '  console.log(chunk.toString());',
        '}'
      ].join('\n')
    },
    {
      code: [
        'const chunk = {',
        '  toString: () => "text"',
        '};',
        'const text = chunk.toString();'
      ].join('\n')
    },
    {
      code: [
        "stream.on('data', (chunk) => {",
        '  {',
        '    const chunk = {',
        '      toString: () => "text"',
        '    };',
        '    output += chunk.toString();',
        '  }',
        '});'
      ].join('\n')
    }
  ]
});

typedRuleTester.run('no-per-chunk-buffer-to-string typed', noPerChunkBufferToStringRule, {
  invalid: [
    {
      code: [
        'declare const buffers: Uint8Array[];',
        'buffers.map((data) => data.toString());'
      ].join('\n'),
      errors: [{ messageId: 'error-per-chunk-buffer-to-string' }]
    }
  ],
  valid: [
    {
      code: ['declare const items: string[];', 'items.map((chunk) => chunk.toString());'].join('\n')
    },
    {
      code: [
        'interface Buffer {',
        '  toString(encoding?: string): string;',
        '}',
        'declare const buffers: Buffer[];',
        'buffers.map((data) => data.toString());'
      ].join('\n')
    }
  ]
});
