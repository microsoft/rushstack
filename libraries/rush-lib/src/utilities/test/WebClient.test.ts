// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';

import { WebClient } from '../WebClient';

describe(WebClient.name, () => {
  describe(WebClient.mergeHeaders.name, () => {
    it('should merge headers', () => {
      const target: Record<string, string> = { header1: 'value1' };
      const source: Record<string, string> = { header2: 'value2' };

      WebClient.mergeHeaders(target, source);
      expect(target).toMatchSnapshot();
    });

    it('should handle an empty source', () => {
      const target: Record<string, string> = { header1: 'value1' };
      const source: Record<string, string> = {};

      WebClient.mergeHeaders(target, source);
      expect(target).toMatchSnapshot();
    });

    it('should handle an empty target', () => {
      const target: Record<string, string> = {};
      const source: Record<string, string> = { header2: 'value2' };

      WebClient.mergeHeaders(target, source);
      expect(target).toMatchSnapshot();
    });

    it('should handle both empty', () => {
      const target: Record<string, string> = {};
      const source: Record<string, string> = {};

      WebClient.mergeHeaders(target, source);
      expect(target).toMatchSnapshot();
    });

    it('should handle overwriting values', () => {
      const target: Record<string, string> = { header1: 'value1' };
      const source: Record<string, string> = { header1: 'value2' };

      WebClient.mergeHeaders(target, source);
      expect(target).toMatchSnapshot();
    });

    it('should handle a JS object as the source', () => {
      const target: Record<string, string> = { header1: 'value1' };

      WebClient.mergeHeaders(target, { header2: 'value2' });
      expect(target).toMatchSnapshot();
    });
  });

  describe(WebClient.prototype.fetchAsync.name, () => {
    it('destroys a streamed request body if the request errors', async () => {
      const server: Server = createServer((request) => {
        request.socket.destroy();
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
      });

      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP server address');
      }

      const webClient: WebClient = new WebClient();
      const body: Readable = new Readable({
        read() {
          this.push(Buffer.alloc(64 * 1024));
        }
      });

      await expect(
        webClient.fetchAsync(`http://127.0.0.1:${address.port}`, {
          verb: 'PUT',
          body
        })
      ).rejects.toThrow();
      expect(body.destroyed).toBe(true);

      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });
  });
});
