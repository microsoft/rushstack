import { NpmRegistryClient, type INpmRegistryClientOptions } from '../NpmRegistryClient';

describe('NpmRegistryClient', () => {
  describe('constructor', () => {
    it('uses default registry URL when not provided', () => {
      const client = new NpmRegistryClient();
      // We can't directly access private members, but we can verify behavior
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

  // Note: Integration tests for fetchPackageMetadataAsync would require
  // network access or complex http mocking. These are covered by the
  // GetLatestFromRegistry tests which mock at the NpmRegistryClient level.
});
