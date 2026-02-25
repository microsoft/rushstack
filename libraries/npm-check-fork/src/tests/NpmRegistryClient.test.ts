// Mock modules
jest.mock('node:https');
jest.mock('node:http');

import type * as http from 'node:http';
import type * as https from 'node:https';
import { EventEmitter } from 'node:events';
import * as zlib from 'node:zlib';

import { NpmRegistryClient, type INpmRegistryClientOptions } from '../NpmRegistryClient.ts';
import type { INpmRegistryPackageResponse } from '../interfaces/INpmCheckRegistry.ts';

describe('NpmRegistryClient', () => {
  let mockHttpsRequest: jest.Mock;
  let mockHttpRequest: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Get the mocked modules
    const httpsModule = jest.requireMock('node:https');
    const httpModule = jest.requireMock('node:http');

    mockHttpsRequest = httpsModule.request = jest.fn();
    mockHttpRequest = httpModule.request = jest.fn();
  });

  describe('constructor', () => {
    it('uses default registry URL when not provided', () => {
      const client = new NpmRegistryClient();
      expect(client).toBeDefined();
    });

    it('accepts custom options', () => {
      const options: INpmRegistryClientOptions = {
        registryUrl: 'https://custom.registry.com',
        userAgent: 'custom-agent',
        timeoutMs: 10000
      };
      const client = new NpmRegistryClient(options);
      expect(client).toBeDefined();
    });

    it('removes trailing slash from registry URL', () => {
      const options: INpmRegistryClientOptions = {
        registryUrl: 'https://registry.example.com/'
      };
      const client = new NpmRegistryClient(options);
      expect(client).toBeDefined();
    });
  });

  describe('fetchPackageMetadataAsync', () => {
    interface IMockRequest extends EventEmitter {
      destroy: jest.Mock;
      end: jest.Mock;
    }

    interface IMockResponse extends EventEmitter {
      statusCode?: number;
      statusMessage?: string;
      headers: Record<string, string>;
    }

    function createMockRequest(): {
      request: IMockRequest;
      response: IMockResponse;
    } {
      const request = new EventEmitter() as IMockRequest;
      const response = new EventEmitter() as IMockResponse;

      request.destroy = jest.fn();
      request.end = jest.fn();
      response.headers = {};

      return { request, response };
    }

    it('successfully fetches package metadata with https', async () => {
      const client = new NpmRegistryClient();
      const { request, response } = createMockRequest();

      const mockData: INpmRegistryPackageResponse = {
        name: 'test-package',
        versions: {
          '1.0.0': {
            name: 'test-package',
            version: '1.0.0'
          }
        },
        'dist-tags': { latest: '1.0.0' }
      };

      mockHttpsRequest.mockImplementation(
        (options: https.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
          // Verify request options
          expect(options.hostname).toBe('registry.npmjs.org');
          expect(options.method).toBe('GET');
          expect(options.headers).toMatchObject({
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'User-Agent': expect.stringContaining('npm-check-fork')
          });

          // Trigger callback with response
          setImmediate(() => callback(response as http.IncomingMessage));
          return request;
        }
      );

      const fetchPromise = client.fetchPackageMetadataAsync('test-package');

      // Simulate response
      response.statusCode = 200;
      response.statusMessage = 'OK';
      setImmediate(() => {
        response.emit('data', Buffer.from(JSON.stringify(mockData)));
        response.emit('end');
      });

      const result = await fetchPromise;
      expect(result.data).toEqual(mockData);
      expect(result.error).toBeUndefined();
    });

    it('builds correct URL for scoped packages', async () => {
      const client = new NpmRegistryClient();
      const { request, response } = createMockRequest();

      mockHttpsRequest.mockImplementation(
        (options: https.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
          // Verify that scoped package name is URL-encoded
          expect(options.path).toBe('/@scope%2Fpackage-name');

          setImmediate(() => callback(response as http.IncomingMessage));
          return request;
        }
      );

      const fetchPromise = client.fetchPackageMetadataAsync('@scope/package-name');

      response.statusCode = 200;
      setImmediate(() => {
        response.emit(
          'data',
          Buffer.from(JSON.stringify({ name: '@scope/package-name', versions: {}, 'dist-tags': {} }))
        );
        response.emit('end');
      });

      await fetchPromise;
    });

    it('uses custom registry URL', async () => {
      const client = new NpmRegistryClient({ registryUrl: 'https://custom.registry.com' });
      const { request, response } = createMockRequest();

      mockHttpsRequest.mockImplementation(
        (options: https.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
          expect(options.hostname).toBe('custom.registry.com');

          setImmediate(() => callback(response as http.IncomingMessage));
          return request;
        }
      );

      const fetchPromise = client.fetchPackageMetadataAsync('test-package');

      response.statusCode = 200;
      setImmediate(() => {
        response.emit('data', Buffer.from(JSON.stringify({ name: 'test', versions: {}, 'dist-tags': {} })));
        response.emit('end');
      });

      await fetchPromise;
    });

    it('uses http for http URLs', async () => {
      const client = new NpmRegistryClient({ registryUrl: 'http://custom.registry.com' });
      const { request, response } = createMockRequest();

      mockHttpRequest.mockImplementation(
        (options: http.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
          expect(options.hostname).toBe('custom.registry.com');
          expect(options.port).toBe(80);

          setImmediate(() => callback(response as http.IncomingMessage));
          return request;
        }
      );

      const fetchPromise = client.fetchPackageMetadataAsync('test-package');

      response.statusCode = 200;
      setImmediate(() => {
        response.emit('data', Buffer.from(JSON.stringify({ name: 'test', versions: {}, 'dist-tags': {} })));
        response.emit('end');
      });

      await fetchPromise;
      expect(mockHttpRequest).toHaveBeenCalled();
      expect(mockHttpsRequest).not.toHaveBeenCalled();
    });

    it('handles gzip-encoded responses', async () => {
      const client = new NpmRegistryClient();
      const { request, response } = createMockRequest();

      const mockData: INpmRegistryPackageResponse = {
        name: 'test-package',
        versions: {},
        'dist-tags': { latest: '1.0.0' }
      };

      mockHttpsRequest.mockImplementation(
        (options: https.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
          setImmediate(() => callback(response as http.IncomingMessage));
          return request;
        }
      );

      const fetchPromise = client.fetchPackageMetadataAsync('test-package');

      response.statusCode = 200;
      response.headers['content-encoding'] = 'gzip';

      setImmediate(() => {
        const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(mockData)));
        response.emit('data', compressed);
        response.emit('end');
      });

      const result = await fetchPromise;
      expect(result.data).toEqual(mockData);
      expect(result.error).toBeUndefined();
    });

    it('handles deflate-encoded responses', async () => {
      const client = new NpmRegistryClient();
      const { request, response } = createMockRequest();

      const mockData: INpmRegistryPackageResponse = {
        name: 'test-package',
        versions: {},
        'dist-tags': { latest: '1.0.0' }
      };

      mockHttpsRequest.mockImplementation(
        (options: https.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
          setImmediate(() => callback(response as http.IncomingMessage));
          return request;
        }
      );

      const fetchPromise = client.fetchPackageMetadataAsync('test-package');

      response.statusCode = 200;
      response.headers['content-encoding'] = 'deflate';

      setImmediate(() => {
        const compressed = zlib.deflateSync(Buffer.from(JSON.stringify(mockData)));
        response.emit('data', compressed);
        response.emit('end');
      });

      const result = await fetchPromise;
      expect(result.data).toEqual(mockData);
      expect(result.error).toBeUndefined();
    });

    it('handles 404 status code', async () => {
      const client = new NpmRegistryClient();
      const { request, response } = createMockRequest();

      mockHttpsRequest.mockImplementation(
        (options: https.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
          setImmediate(() => callback(response as http.IncomingMessage));
          return request;
        }
      );

      const fetchPromise = client.fetchPackageMetadataAsync('nonexistent-package');

      response.statusCode = 404;
      response.statusMessage = 'Not Found';
      setImmediate(() => {
        response.emit('data', Buffer.from('Not found'));
        response.emit('end');
      });

      const result = await fetchPromise;
      expect(result.data).toBeUndefined();
      expect(result.error).toBe('Package not found');
    });

    it('handles non-2xx status codes', async () => {
      const client = new NpmRegistryClient();
      const { request, response } = createMockRequest();

      mockHttpsRequest.mockImplementation(
        (options: https.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
          setImmediate(() => callback(response as http.IncomingMessage));
          return request;
        }
      );

      const fetchPromise = client.fetchPackageMetadataAsync('test-package');

      response.statusCode = 500;
      response.statusMessage = 'Internal Server Error';
      setImmediate(() => {
        response.emit('data', Buffer.from('Error'));
        response.emit('end');
      });

      const result = await fetchPromise;
      expect(result.data).toBeUndefined();
      expect(result.error).toBe('HTTP error 500: Internal Server Error');
    });

    it('handles network errors', async () => {
      const client = new NpmRegistryClient();
      const { request } = createMockRequest();

      mockHttpsRequest.mockImplementation(() => {
        return request;
      });

      const fetchPromise = client.fetchPackageMetadataAsync('test-package');

      setImmediate(() => {
        request.emit('error', new Error('Network connection failed'));
      });

      const result = await fetchPromise;
      expect(result.data).toBeUndefined();
      expect(result.error).toBe('Network error: Network connection failed');
    });

    it('handles response errors', async () => {
      const client = new NpmRegistryClient();
      const { request, response } = createMockRequest();

      mockHttpsRequest.mockImplementation(
        (options: https.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
          setImmediate(() => callback(response as http.IncomingMessage));
          return request;
        }
      );

      const fetchPromise = client.fetchPackageMetadataAsync('test-package');

      response.statusCode = 200;
      setImmediate(() => {
        response.emit('error', new Error('Stream error'));
      });

      const result = await fetchPromise;
      expect(result.data).toBeUndefined();
      expect(result.error).toBe('Response error: Stream error');
    });

    it('handles timeout', async () => {
      const client = new NpmRegistryClient({ timeoutMs: 1000 });
      const { request } = createMockRequest();

      mockHttpsRequest.mockImplementation(() => {
        return request;
      });

      const fetchPromise = client.fetchPackageMetadataAsync('test-package');

      setImmediate(() => {
        request.emit('timeout');
      });

      const result = await fetchPromise;
      expect(result.data).toBeUndefined();
      expect(result.error).toBe('Request timed out after 1000ms');
      expect(request.destroy).toHaveBeenCalled();
    });

    it('handles JSON parse errors', async () => {
      const client = new NpmRegistryClient();
      const { request, response } = createMockRequest();

      mockHttpsRequest.mockImplementation(
        (options: https.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
          setImmediate(() => callback(response as http.IncomingMessage));
          return request;
        }
      );

      const fetchPromise = client.fetchPackageMetadataAsync('test-package');

      response.statusCode = 200;
      setImmediate(() => {
        response.emit('data', Buffer.from('invalid json'));
        response.emit('end');
      });

      const result = await fetchPromise;
      expect(result.data).toBeUndefined();
      expect(result.error).toContain('Failed to parse response');
    });

    it('uses custom User-Agent header', async () => {
      const client = new NpmRegistryClient({ userAgent: 'custom-agent/1.0' });
      const { request, response } = createMockRequest();

      mockHttpsRequest.mockImplementation(
        (options: https.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
          expect(options.headers?.['User-Agent']).toBe('custom-agent/1.0');

          setImmediate(() => callback(response as http.IncomingMessage));
          return request;
        }
      );

      const fetchPromise = client.fetchPackageMetadataAsync('test-package');

      response.statusCode = 200;
      setImmediate(() => {
        response.emit('data', Buffer.from(JSON.stringify({ name: 'test', versions: {}, 'dist-tags': {} })));
        response.emit('end');
      });

      await fetchPromise;
    });

    it('uses custom timeout value', async () => {
      const client = new NpmRegistryClient({ timeoutMs: 5000 });
      const { request, response } = createMockRequest();

      mockHttpsRequest.mockImplementation(
        (options: https.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
          expect(options.timeout).toBe(5000);

          setImmediate(() => callback(response as http.IncomingMessage));
          return request;
        }
      );

      const fetchPromise = client.fetchPackageMetadataAsync('test-package');

      response.statusCode = 200;
      setImmediate(() => {
        response.emit('data', Buffer.from(JSON.stringify({ name: 'test', versions: {}, 'dist-tags': {} })));
        response.emit('end');
      });

      await fetchPromise;
    });
  });
});
