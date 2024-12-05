// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WebClient } from '../WebClient';

describe(WebClient.name, () => {
  describe(WebClient.mergeHeaders.name, () => {
    it('should merge headers', () => {
      const target: Record<string, string> = { header1: 'value1' };
      const source: Record<string, string> = { header2: 'value2' };

      WebClient.mergeHeaders(target, source);
      expect(target).toMatchInlineSnapshot(`
Object {
  "header1": "value1",
  "header2": "value2",
}
`);
    });

    it('should handle an empty source', () => {
      const target: Record<string, string> = { header1: 'value1' };
      const source: Record<string, string> = {};

      WebClient.mergeHeaders(target, source);
      expect(target).toMatchInlineSnapshot(`
Object {
  "header1": "value1",
}
`);
    });

    it('should handle an empty target', () => {
      const target: Record<string, string> = {};
      const source: Record<string, string> = { header2: 'value2' };

      WebClient.mergeHeaders(target, source);
      expect(target).toMatchInlineSnapshot(`
Object {
  "header2": "value2",
}
`);
    });

    it('should handle both empty', () => {
      const target: Record<string, string> = {};
      const source: Record<string, string> = {};

      WebClient.mergeHeaders(target, source);
      expect(target).toMatchInlineSnapshot(`Object {}`);
    });

    it('should handle overwriting values', () => {
      const target: Record<string, string> = { header1: 'value1' };
      const source: Record<string, string> = { header1: 'value2' };

      WebClient.mergeHeaders(target, source);
      expect(target).toMatchInlineSnapshot(`
Object {
  "header1": "value2",
}
`);
    });

    it('should handle a JS object as the source', () => {
      const target: Record<string, string> = { header1: 'value1' };

      WebClient.mergeHeaders(target, { header2: 'value2' });
      expect(target).toMatchInlineSnapshot(`
Object {
  "header1": "value1",
  "header2": "value2",
}
`);
    });
  });
});
