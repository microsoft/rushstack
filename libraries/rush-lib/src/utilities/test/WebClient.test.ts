// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WebClient, WebClientHeaders } from '../WebClient';

describe(WebClient.name, () => {
  describe(WebClient.mergeHeaders.name, () => {
    it('should merge headers', () => {
      const target: WebClientHeaders = new WebClientHeaders({ header1: 'value1' });
      const source: WebClientHeaders = new WebClientHeaders({ header2: 'value2' });

      WebClient.mergeHeaders(target, source);
      expect(target.raw()).toMatchInlineSnapshot(`
Object {
  "header1": Array [
    "value1",
  ],
  "header2": Array [
    "value2",
  ],
}
`);
    });

    it('should handle an empty source', () => {
      const target: WebClientHeaders = new WebClientHeaders({ header1: 'value1' });
      const source: WebClientHeaders = new WebClientHeaders();

      WebClient.mergeHeaders(target, source);
      expect(target.raw()).toMatchInlineSnapshot(`
Object {
  "header1": Array [
    "value1",
  ],
}
`);
    });

    it('should handle an empty target', () => {
      const target: WebClientHeaders = new WebClientHeaders();
      const source: WebClientHeaders = new WebClientHeaders({ header2: 'value2' });

      WebClient.mergeHeaders(target, source);
      expect(target.raw()).toMatchInlineSnapshot(`
Object {
  "header2": Array [
    "value2",
  ],
}
`);
    });

    it('should handle both empty', () => {
      const target: WebClientHeaders = new WebClientHeaders();
      const source: WebClientHeaders = new WebClientHeaders();

      WebClient.mergeHeaders(target, source);
      expect(target.raw()).toMatchInlineSnapshot(`Object {}`);
    });

    it('should handle overwriting values', () => {
      const target: WebClientHeaders = new WebClientHeaders({ header1: 'value1' });
      const source: WebClientHeaders = new WebClientHeaders({ header1: 'value2' });

      WebClient.mergeHeaders(target, source);
      expect(target.raw()).toMatchInlineSnapshot(`
Object {
  "header1": Array [
    "value2",
  ],
}
`);
    });

    it('should handle a JS object as the source', () => {
      const target: WebClientHeaders = new WebClientHeaders({ header1: 'value1' });

      WebClient.mergeHeaders(target, { header2: 'value2' });
      expect(target.raw()).toMatchInlineSnapshot(`
Object {
  "header1": Array [
    "value1",
  ],
  "header2": Array [
    "value2",
  ],
}
`);
    });
  });
});
