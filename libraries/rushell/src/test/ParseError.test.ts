// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ParseError } from '../ParseError';
import { TextRange } from '../TextRange';

test('omits cause when no inner error is supplied', () => {
  const error: ParseError = new ParseError('Parse failed', TextRange.empty);

  expect(error.message).toBe('Parse failed');
  expect(error.name).toBe('Error');
  expect(error.stack).toContain('Error: Parse failed');
  expect(Object.hasOwn(error, 'cause')).toBe(false);
  expect(error.cause).toBeUndefined();
  expect(Object.getOwnPropertyDescriptor(error, 'innerError')).toEqual({
    configurable: true,
    enumerable: true,
    value: undefined,
    writable: true
  });
});

test('exposes the inner error as the standard cause and legacy alias', () => {
  const innerError: Error = new Error('Inner failure');
  const error: ParseError = new ParseError('Parse failed', TextRange.empty, innerError);

  expect(error.cause).toBe(innerError);
  expect(error.innerError).toBe(innerError);
  expect(Object.getOwnPropertyDescriptor(error, 'cause')).toEqual({
    configurable: true,
    enumerable: false,
    value: innerError,
    writable: true
  });
});
