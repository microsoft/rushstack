// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BlobServiceClient, type BlockBlobClient, type ContainerClient } from '@azure/storage-blob';

import { CredentialCache, type ICredentialCacheEntry } from '@rushstack/credential-cache';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { EnvironmentConfiguration, RushUserConfiguration } from '@rushstack/rush-sdk';

import { AzureStorageBuildCacheProvider } from '../AzureStorageBuildCacheProvider';
import type { AzureEnvironmentName } from '../AzureAuthenticationBase';

describe(AzureStorageBuildCacheProvider.name, () => {
  beforeEach(() => {
    jest.spyOn(EnvironmentConfiguration, 'buildCacheCredential', 'get').mockReturnValue(undefined);
    jest.spyOn(EnvironmentConfiguration, 'buildCacheEnabled', 'get').mockReturnValue(undefined);
    jest.spyOn(EnvironmentConfiguration, 'buildCacheWriteAllowed', 'get').mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('uses a correct list of Azure authority hosts', async () => {
    await expect(
      () =>
        new AzureStorageBuildCacheProvider({
          storageAccountName: 'storage-account',
          storageContainerName: 'container-name',
          azureEnvironment: 'INCORRECT_AZURE_ENVIRONMENT' as AzureEnvironmentName,
          isCacheWriteAllowed: false
        })
    ).toThrowErrorMatchingSnapshot();
  });

  describe('storageEndpoint', () => {
    it('uses the default endpoint when storageEndpoint is not provided', () => {
      const subject: AzureStorageBuildCacheProvider = new AzureStorageBuildCacheProvider({
        storageAccountName: 'storage-account',
        storageContainerName: 'container-name',
        isCacheWriteAllowed: false
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((subject as any)._storageAccountUrl).toBe('https://storage-account.blob.core.windows.net/');
    });

    it('uses the custom endpoint when storageEndpoint is provided', () => {
      const subject: AzureStorageBuildCacheProvider = new AzureStorageBuildCacheProvider({
        storageAccountName: 'devstoreaccount1',
        storageContainerName: 'container-name',
        storageEndpoint: 'http://127.0.0.1:10000/devstoreaccount1',
        isCacheWriteAllowed: false
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((subject as any)._storageAccountUrl).toBe('http://127.0.0.1:10000/devstoreaccount1/');
    });

    it('preserves a trailing slash on the custom endpoint', () => {
      const subject: AzureStorageBuildCacheProvider = new AzureStorageBuildCacheProvider({
        storageAccountName: 'devstoreaccount1',
        storageContainerName: 'container-name',
        storageEndpoint: 'https://my-proxy.example.com/devstoreaccount1/',
        isCacheWriteAllowed: false
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((subject as any)._storageAccountUrl).toBe('https://my-proxy.example.com/devstoreaccount1/');
    });
  });

  describe('isCacheWriteAllowed', () => {
    function prepareSubject(
      optionValue: boolean,
      envVarValue: boolean | undefined
    ): AzureStorageBuildCacheProvider {
      jest.spyOn(EnvironmentConfiguration, 'buildCacheWriteAllowed', 'get').mockReturnValue(envVarValue);
      return new AzureStorageBuildCacheProvider({
        storageAccountName: 'storage-account',
        storageContainerName: 'container-name',
        isCacheWriteAllowed: optionValue
      });
    }

    it('is false if isCacheWriteAllowed is false', () => {
      const subject: AzureStorageBuildCacheProvider = prepareSubject(false, undefined);
      expect(subject.isCacheWriteAllowed).toBe(false);
    });

    it('is true if isCacheWriteAllowed is true', () => {
      const subject: AzureStorageBuildCacheProvider = prepareSubject(true, undefined);
      expect(subject.isCacheWriteAllowed).toBe(true);
    });

    it('is false if isCacheWriteAllowed is true but the env var is false', () => {
      const subject: AzureStorageBuildCacheProvider = prepareSubject(true, false);
      expect(subject.isCacheWriteAllowed).toBe(false);
    });

    it('is true if the env var is true', () => {
      const subject: AzureStorageBuildCacheProvider = prepareSubject(false, true);
      expect(subject.isCacheWriteAllowed).toBe(true);
    });
  });

  async function testCredentialCache(isCacheWriteAllowed: boolean): Promise<void> {
    const cacheProvider: AzureStorageBuildCacheProvider = new AzureStorageBuildCacheProvider({
      storageAccountName: 'storage-account',
      storageContainerName: 'container-name',
      isCacheWriteAllowed
    });

    // Mock the user folder to the current folder so a real .rush-user folder doesn't interfere with the test
    jest.spyOn(RushUserConfiguration, 'getRushUserFolderPath').mockReturnValue(__dirname);
    let setCacheEntryArgs: unknown[] = [];
    const credentialsCacheSetCacheEntrySpy: jest.SpyInstance = jest
      .spyOn(CredentialCache.prototype, 'setCacheEntry')
      .mockImplementation((...args) => {
        setCacheEntryArgs = args;
      });
    const credentialsCacheSaveSpy: jest.SpyInstance = jest
      .spyOn(CredentialCache.prototype, 'saveIfModifiedAsync')
      .mockImplementation(() => Promise.resolve());

    const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
    await cacheProvider.updateCachedCredentialAsync(terminal, 'credential');

    expect(credentialsCacheSetCacheEntrySpy).toHaveBeenCalledTimes(1);
    expect(setCacheEntryArgs).toMatchSnapshot();
    expect(credentialsCacheSaveSpy).toHaveBeenCalledTimes(1);
  }

  it('Has an expected cached credential name (write not allowed)', async () => {
    await testCredentialCache(false);
  });

  it('Has an expected cached credential name (write allowed)', async () => {
    await testCredentialCache(true);
  });

  describe('a credential that changes while the provider is in use', () => {
    const FIRST_SAS: string = 'sv=2025-01-05&sp=rcw&sig=first-secret-signature';
    const SECOND_SAS: string = 'sv=2025-01-05&sp=rcw&sig=second-secret-signature';
    const SECRETS: string[] = ['first-secret-signature', 'second-secret-signature'];

    type BlobOperation = 'exists' | 'download' | 'upload';
    // 'hit' and 'miss' answer an existence check; a number is the status code of an error
    type FakeResponse = 'hit' | 'miss' | 'ok' | number;

    let cachedCredential: ICredentialCacheEntry | undefined;
    let credentialReads: number;
    let requests: string[];
    let respond: (credentialName: string, operation: BlobOperation) => FakeResponse | Promise<FakeResponse>;
    let terminalProvider: StringBufferTerminalProvider;
    let terminal: Terminal;

    function getCredentialName(sasString: string | undefined): string {
      return sasString === FIRST_SAS ? 'first' : sasString === SECOND_SAS ? 'second' : 'anonymous';
    }

    function createBlobError(statusCode: number): Error {
      const errorCode: string = `Status${statusCode}ErrorCode`;
      return Object.assign(new Error(`The request failed with status ${statusCode}.`), {
        name: 'RestError',
        statusCode,
        code: errorCode,
        response: { status: statusCode, parsedHeaders: { errorCode } }
      });
    }

    function createFakeContainerClient(sasString: string | undefined): ContainerClient {
      const credentialName: string = getCredentialName(sasString);
      async function requestAsync(operation: BlobOperation): Promise<FakeResponse> {
        requests.push(`${operation} ${credentialName}`);
        const response: FakeResponse = await respond(credentialName, operation);
        if (typeof response === 'number') {
          throw createBlobError(response);
        }
        return response;
      }

      const blobClient: Partial<BlockBlobClient> = {
        exists: () => requestAsync('exists').then((response: FakeResponse) => response === 'hit'),
        downloadToBuffer: (async () => {
          await requestAsync('download');
          return Buffer.from(`read with ${credentialName}`);
        }) as BlockBlobClient['downloadToBuffer'],
        upload: (async () => {
          await requestAsync('upload');
        }) as unknown as BlockBlobClient['upload'],
        getBlockBlobClient: () => blobClient as BlockBlobClient
      };
      return { getBlobClient: () => blobClient } as unknown as ContainerClient;
    }

    function createSubject(isCacheWriteAllowed: boolean = false): AzureStorageBuildCacheProvider {
      return new AzureStorageBuildCacheProvider({
        storageAccountName: 'storage-account',
        storageContainerName: 'container-name',
        isCacheWriteAllowed
      });
    }

    beforeEach(() => {
      cachedCredential = undefined;
      credentialReads = 0;
      requests = [];
      terminalProvider = new StringBufferTerminalProvider();
      terminal = new Terminal(terminalProvider);

      jest.spyOn(CredentialCache, 'usingAsync').mockImplementation(async (options, doActionAsync) => {
        credentialReads++;
        await doActionAsync({ tryGetCacheEntry: () => cachedCredential } as unknown as CredentialCache);
      });
      jest.spyOn(BlobServiceClient, 'fromConnectionString').mockImplementation(
        (connectionString: string) =>
          ({
            getContainerClient: () =>
              createFakeContainerClient(connectionString.split('SharedAccessSignature=')[1])
          }) as unknown as BlobServiceClient
      );
      jest
        .spyOn(BlobServiceClient.prototype, 'getContainerClient')
        .mockImplementation(() => createFakeContainerClient(undefined));
    });

    afterEach(() => {
      const allOutput: string = JSON.stringify(terminalProvider.getAllOutput());
      for (const secret of SECRETS) {
        expect(allOutput).not.toContain(secret);
      }

      jest.restoreAllMocks();
    });

    it.each([
      { anonymousResult: 'a miss', anonymousResponse: 'miss' as const },
      { anonymousResult: '401', anonymousResponse: 401 }
    ])(
      'uses a credential that was cached after an anonymous read got $anonymousResult',
      async ({ anonymousResponse }) => {
        const subject: AzureStorageBuildCacheProvider = createSubject();
        respond = (credentialName: string) => (credentialName === 'anonymous' ? anonymousResponse : 'hit');

        expect(await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id')).toBeUndefined();
        cachedCredential = { credential: FIRST_SAS };
        const entry: Buffer | undefined = await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id');

        expect(entry?.toString()).toBe('read with first');
        expect(requests).toEqual(['exists anonymous', 'exists first', 'download first']);
        expect(credentialReads).toBe(2);
      }
    );

    it.each([
      { anonymousResult: 'a miss', anonymousResponse: 'miss' as const },
      { anonymousResult: '401', anonymousResponse: 401 }
    ])(
      'reuses the anonymous client and warns once about an expired credential when reads get $anonymousResult',
      async ({ anonymousResponse }) => {
        const subject: AzureStorageBuildCacheProvider = createSubject();
        respond = () => anonymousResponse;
        cachedCredential = { credential: FIRST_SAS, expires: new Date(Date.now() - 60_000) };

        await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id');
        await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id');

        expect(requests).toEqual(['exists anonymous', 'exists anonymous']);
        expect(credentialReads).toBe(2);
        expect(BlobServiceClient.prototype.getContainerClient).toHaveBeenCalledTimes(1);
        expect(terminalProvider.getWarningOutput().match(/have expired/g)).toHaveLength(1);
      }
    );

    it("keeps using the anonymous client when the cached credentials can't be read", async () => {
      const subject: AzureStorageBuildCacheProvider = createSubject();
      respond = () => 'miss';

      await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id');
      jest.mocked(CredentialCache.usingAsync).mockRejectedValueOnce(new Error('Unexpected end of input'));
      expect(await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id')).toBeUndefined();
      cachedCredential = { credential: FIRST_SAS };
      await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id');

      expect(requests).toEqual(['exists anonymous', 'exists anonymous', 'exists first']);
      expect(BlobServiceClient.prototype.getContainerClient).toHaveBeenCalledTimes(1);
      expect(terminalProvider.getWarningOutput()).toBe('');
      expect(terminalProvider.getErrorOutput()).toBe('');
    });

    it('keeps a newer client when an older one is rejected late', async () => {
      const subject: AzureStorageBuildCacheProvider = createSubject();
      let onLateRequest!: () => void;
      const lateRequestSent: Promise<void> = new Promise<void>((resolve) => {
        onLateRequest = resolve;
      });
      let answerLateRequest!: () => void;
      const lateResponse: Promise<FakeResponse> = new Promise<FakeResponse>((resolve) => {
        answerLateRequest = () => resolve(403);
      });
      let firstRequests: number = 0;
      respond = (credentialName: string) => {
        if (credentialName !== 'first') {
          return 'hit';
        } else if (firstRequests++ === 0) {
          onLateRequest();
          return lateResponse;
        } else {
          return 403;
        }
      };
      cachedCredential = { credential: FIRST_SAS };

      const lateRead: Promise<Buffer | undefined> = subject.tryGetCacheEntryBufferByIdAsync(
        terminal,
        'cache-id'
      );
      await lateRequestSent;
      expect(await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id')).toBeUndefined();
      cachedCredential = { credential: SECOND_SAS };
      expect((await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id'))?.toString()).toBe(
        'read with second'
      );
      answerLateRequest();
      expect(await lateRead).toBeUndefined();
      expect((await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id'))?.toString()).toBe(
        'read with second'
      );

      expect(credentialReads).toBe(2);
    });

    it('keeps a client made from a credential while Azure Storage accepts it, or fails with another status', async () => {
      const subject: AzureStorageBuildCacheProvider = createSubject();
      let failNextRequest: boolean = false;
      respond = () => (failNextRequest ? 500 : 'hit');
      cachedCredential = { credential: FIRST_SAS };

      await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id');
      failNextRequest = true;
      await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id');
      failNextRequest = false;
      cachedCredential = { credential: SECOND_SAS };
      await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id');

      expect(requests).toEqual([
        'exists first',
        'download first',
        'exists first',
        'exists first',
        'download first'
      ]);
      expect(credentialReads).toBe(1);
    });

    it.each([401, 403])(
      'reads the cached credential again after a read was rejected with %i',
      async (statusCode: number) => {
        const subject: AzureStorageBuildCacheProvider = createSubject();
        respond = (credentialName: string) => (credentialName === 'first' ? statusCode : 'hit');
        cachedCredential = { credential: FIRST_SAS };

        expect(await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id')).toBeUndefined();
        cachedCredential = { credential: SECOND_SAS };
        const entry: Buffer | undefined = await subject.tryGetCacheEntryBufferByIdAsync(terminal, 'cache-id');

        expect(entry?.toString()).toBe('read with second');
        expect(requests).toEqual(['exists first', 'exists second', 'download second']);
        expect(credentialReads).toBe(2);
      }
    );

    it.each([
      { rejectedOperation: 'upload' as const, expectedResult: false },
      { rejectedOperation: 'exists' as const, expectedResult: true }
    ])(
      'reads the cached credential again after the $rejectedOperation request of a write was rejected',
      async ({ rejectedOperation, expectedResult }) => {
        const subject: AzureStorageBuildCacheProvider = createSubject(true);
        respond = (credentialName: string, operation: BlobOperation) =>
          credentialName === 'first' && operation === rejectedOperation
            ? 403
            : operation === 'exists'
              ? 'miss'
              : 'ok';
        cachedCredential = { credential: FIRST_SAS };

        expect(await subject.trySetCacheEntryBufferAsync(terminal, 'cache-id', Buffer.from('entry'))).toBe(
          expectedResult
        );
        cachedCredential = { credential: SECOND_SAS };
        expect(await subject.trySetCacheEntryBufferAsync(terminal, 'cache-id', Buffer.from('entry'))).toBe(
          true
        );

        expect(requests).toEqual(['exists first', 'upload first', 'exists second', 'upload second']);
        expect(credentialReads).toBe(2);
      }
    );
  });
});
