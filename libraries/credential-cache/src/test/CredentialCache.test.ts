// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { mockGetHomeFolder } from './CredentialCache.mock';
import { LockFile, Async, FileSystem } from '@rushstack/node-core-library';
import { CredentialCache, type ICredentialCacheOptions, RUSH_USER_FOLDER_NAME } from '../CredentialCache';

const FAKE_HOME_FOLDER: string = 'temp';
const FAKE_RUSH_USER_FOLDER: string = `${FAKE_HOME_FOLDER}/${RUSH_USER_FOLDER_NAME}`;

interface IPathsTestCase extends Required<Pick<ICredentialCacheOptions, 'cacheFilePath'>> {
  testCaseName: string;
}

describe(CredentialCache.name, () => {
  let fakeFilesystem: { [key: string]: string };
  let filesystemLocks: { [key: string]: Promise<void> };
  let unresolvedLockfiles: Set<LockFile>;

  beforeEach(() => {
    fakeFilesystem = {};
    filesystemLocks = {};
    unresolvedLockfiles = new Set();
  });

  beforeEach(() => {
    mockGetHomeFolder.mockReturnValue(FAKE_HOME_FOLDER);

    // TODO: Consider expanding these mocks and moving them to node-core-library
    jest
      .spyOn(LockFile, 'acquire')
      .mockImplementation(async (folderPath: string, lockFilePath: string, maxWaitMs?: number) => {
        const fullPath: string = `${folderPath}/${lockFilePath}`;
        const existingLock: Promise<void> | undefined = filesystemLocks[fullPath];
        if (existingLock) {
          if (maxWaitMs === undefined) {
            await existingLock;
          } else {
            await Promise.race([existingLock, Async.sleepAsync(maxWaitMs)]);
          }
        }

        let release: () => void;
        const lockPromise: Promise<void> = new Promise<void>((resolve: () => void) => {
          release = resolve;
        });

        // eslint-disable-next-line require-atomic-updates
        filesystemLocks[fullPath] = lockPromise;
        const result: LockFile = {
          release: () => {
            release();
            unresolvedLockfiles.delete(result);
          }
        } as LockFile;
        unresolvedLockfiles.add(result);
        return result;
      });

    jest
      .spyOn(FileSystem, 'writeFileAsync')
      .mockImplementation(async (filePath: string, data: Buffer | string) => {
        fakeFilesystem[filePath] = data.toString();
      });

    jest.spyOn(FileSystem, 'readFileAsync').mockImplementation(async (filePath: string) => {
      if (filePath in fakeFilesystem) {
        return fakeFilesystem[filePath];
      } else {
        const notExistError: NodeJS.ErrnoException = new Error(
          `ENOENT: no such file or directory, open '${filePath}'`
        );
        notExistError.code = 'ENOENT';
        notExistError.errno = -2;
        notExistError.syscall = 'open';
        notExistError.path = filePath;
        throw notExistError;
      }
    });
  });

  afterEach(() => {
    for (const lockfile of unresolvedLockfiles) {
      lockfile.release();
    }
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe.each<IPathsTestCase>([
    {
      testCaseName: 'default cache path',
      cacheFilePath: `${FAKE_RUSH_USER_FOLDER}/credentials.json`
    },
    {
      testCaseName: 'custom cache path with no suffix',
      cacheFilePath: `${FAKE_RUSH_USER_FOLDER}/my-cache-name`
    },
    {
      testCaseName: 'custom cache path with json suffix',
      cacheFilePath: `${FAKE_RUSH_USER_FOLDER}/my-cache-name.json`
    }
  ])('cache paths [$testCaseName]', ({ cacheFilePath }) => {
    it("initializes a credential cache correctly when one doesn't exist on disk", async () => {
      const credentialCache: CredentialCache = await CredentialCache.initializeAsync({
        supportEditing: false
      });
      expect(credentialCache).toBeDefined();
      credentialCache.dispose();
    });

    it('initializes a credential cache correctly when one exists on disk', async () => {
      const credentialId: string = 'test-credential';
      const credentialValue: string = 'test-value';
      fakeFilesystem[cacheFilePath] = JSON.stringify({
        version: '0.1.0',
        cacheEntries: {
          [credentialId]: {
            expires: 0,
            credential: credentialValue
          }
        }
      });

      const credentialCache: CredentialCache = await CredentialCache.initializeAsync({
        cacheFilePath: cacheFilePath,
        supportEditing: false
      });
      expect(credentialCache.tryGetCacheEntry(credentialId)?.credential).toEqual(credentialValue);
      expect(credentialCache.tryGetCacheEntry(credentialId)?.expires).toBeUndefined();
      credentialCache.dispose();
    });

    it('initializes a credential cache correctly when one exists on disk with a expired credential', async () => {
      const credentialId: string = 'test-credential';
      const credentialValue: string = 'test-value';
      fakeFilesystem[cacheFilePath] = JSON.stringify({
        version: '0.1.0',
        cacheEntries: {
          [credentialId]: {
            expires: 100, // Expired
            credential: credentialValue
          }
        }
      });

      const credentialCache: CredentialCache = await CredentialCache.initializeAsync({
        cacheFilePath: cacheFilePath,
        supportEditing: false
      });
      expect(credentialCache.tryGetCacheEntry(credentialId)?.credential).toEqual(credentialValue);
      expect(credentialCache.tryGetCacheEntry(credentialId)?.expires).toMatchSnapshot('expiration');
      credentialCache.dispose();
    });

    it('correctly trims expired credentials', async () => {
      const credentialId: string = 'test-credential';
      const credentialValue: string = 'test-value';
      fakeFilesystem[cacheFilePath] = JSON.stringify({
        version: '0.1.0',
        cacheEntries: {
          [credentialId]: {
            expires: 100, // Expired
            credential: credentialValue
          }
        }
      });

      const credentialCache: CredentialCache = await CredentialCache.initializeAsync({
        cacheFilePath: cacheFilePath,
        supportEditing: true
      });
      credentialCache.trimExpiredEntries();
      expect(credentialCache.tryGetCacheEntry(credentialId)).toBeUndefined();
      await credentialCache.saveIfModifiedAsync();
      credentialCache.dispose();

      expect(fakeFilesystem[cacheFilePath]).toMatchSnapshot('credential cache file');
    });

    it('correctly adds a new credential', async () => {
      const credentialId: string = 'test-credential';
      const credentialValue: string = 'test-value';

      const credentialCache1: CredentialCache = await CredentialCache.initializeAsync({
        cacheFilePath: cacheFilePath,
        supportEditing: true
      });
      credentialCache1.setCacheEntry(credentialId, { credential: credentialValue });
      expect(credentialCache1.tryGetCacheEntry(credentialId)?.credential).toEqual(credentialValue);
      expect(credentialCache1.tryGetCacheEntry(credentialId)?.expires).toBeUndefined();
      await credentialCache1.saveIfModifiedAsync();
      credentialCache1.dispose();

      expect(fakeFilesystem[cacheFilePath]).toMatchSnapshot('credential cache file');

      const credentialCache2: CredentialCache = await CredentialCache.initializeAsync({
        cacheFilePath: cacheFilePath,
        supportEditing: false
      });
      expect(credentialCache2.tryGetCacheEntry(credentialId)?.credential).toEqual(credentialValue);
      expect(credentialCache2.tryGetCacheEntry(credentialId)?.expires).toBeUndefined();
      credentialCache2.dispose();
    });

    it('correctly updates an existing credential', async () => {
      const credentialId: string = 'test-credential';
      const credentialValue: string = 'test-value';
      const newCredentialValue: string = 'new-test-value';
      fakeFilesystem[cacheFilePath] = JSON.stringify({
        version: '0.1.0',
        cacheEntries: {
          [credentialId]: {
            expires: 0,
            credential: credentialValue
          }
        }
      });

      const credentialCache1: CredentialCache = await CredentialCache.initializeAsync({
        cacheFilePath: cacheFilePath,
        supportEditing: true
      });
      credentialCache1.setCacheEntry(credentialId, { credential: newCredentialValue });
      expect(credentialCache1.tryGetCacheEntry(credentialId)?.credential).toEqual(newCredentialValue);
      expect(credentialCache1.tryGetCacheEntry(credentialId)?.expires).toBeUndefined();
      await credentialCache1.saveIfModifiedAsync();
      credentialCache1.dispose();

      expect(fakeFilesystem[cacheFilePath]).toMatchSnapshot('credential cache file');

      const credentialCache2: CredentialCache = await CredentialCache.initializeAsync({
        cacheFilePath: cacheFilePath,
        supportEditing: false
      });
      expect(credentialCache2.tryGetCacheEntry(credentialId)?.credential).toEqual(newCredentialValue);
      expect(credentialCache2.tryGetCacheEntry(credentialId)?.expires).toBeUndefined();
      credentialCache2.dispose();
    });

    it('correctly deletes an existing credential', async () => {
      const credentialId: string = 'test-credential';
      fakeFilesystem[cacheFilePath] = JSON.stringify({
        version: '0.1.0',
        cacheEntries: {
          [credentialId]: {
            expires: 0,
            credential: 'test-value'
          }
        }
      });

      const credentialCache1: CredentialCache = await CredentialCache.initializeAsync({
        cacheFilePath: cacheFilePath,
        supportEditing: true
      });
      credentialCache1.deleteCacheEntry(credentialId);
      expect(credentialCache1.tryGetCacheEntry(credentialId)).toBeUndefined();
      await credentialCache1.saveIfModifiedAsync();
      credentialCache1.dispose();

      expect(fakeFilesystem[cacheFilePath]).toMatchSnapshot('credential cache file');

      const credentialCache2: CredentialCache = await CredentialCache.initializeAsync({
        cacheFilePath: cacheFilePath,
        supportEditing: false
      });
      expect(credentialCache2.tryGetCacheEntry(credentialId)).toBeUndefined();
      credentialCache2.dispose();
    });

    it('correctly sets credentialMetadata', async () => {
      const credentialId: string = 'test-credential';
      const credentialValue: string = 'test-value';
      const credentialMetadata: object = {
        a: 1,
        b: true
      };

      const credentialCache1: CredentialCache = await CredentialCache.initializeAsync({
        cacheFilePath: cacheFilePath,
        supportEditing: true
      });
      credentialCache1.setCacheEntry(credentialId, { credential: credentialValue, credentialMetadata });
      expect(credentialCache1.tryGetCacheEntry(credentialId)).toEqual({
        credential: credentialValue,
        credentialMetadata
      });
      await credentialCache1.saveIfModifiedAsync();
      credentialCache1.dispose();

      expect(fakeFilesystem[cacheFilePath]).toMatchSnapshot('credential cache file');

      const credentialCache2: CredentialCache = await CredentialCache.initializeAsync({
        cacheFilePath: cacheFilePath,
        supportEditing: false
      });
      expect(credentialCache2.tryGetCacheEntry(credentialId)).toEqual({
        credential: credentialValue,
        credentialMetadata
      });
      credentialCache2.dispose();
    });

    it('correctly updates credentialMetadata', async () => {
      const credentialId: string = 'test-credential';
      const credentialValue: string = 'test-value';
      const oldCredentialMetadata: object = {
        a: 1,
        b: true
      };
      const newCredentialMetadata: object = {
        c: ['a', 'b', 'c']
      };

      fakeFilesystem[cacheFilePath] = JSON.stringify({
        version: '0.1.0',
        cacheEntries: {
          [credentialId]: {
            expires: 0,
            credential: 'test-value',
            credentialMetadata: oldCredentialMetadata
          }
        }
      });

      const credentialCache1: CredentialCache = await CredentialCache.initializeAsync({
        cacheFilePath: cacheFilePath,
        supportEditing: true
      });
      credentialCache1.setCacheEntry(credentialId, {
        credential: credentialValue,
        credentialMetadata: newCredentialMetadata
      });
      expect(credentialCache1.tryGetCacheEntry(credentialId)).toEqual({
        credential: credentialValue,
        credentialMetadata: newCredentialMetadata
      });
      await credentialCache1.saveIfModifiedAsync();
      credentialCache1.dispose();

      expect(fakeFilesystem[cacheFilePath]).toMatchSnapshot('credential cache file');

      const credentialCache2: CredentialCache = await CredentialCache.initializeAsync({
        cacheFilePath: cacheFilePath,
        supportEditing: false
      });
      expect(credentialCache2.tryGetCacheEntry(credentialId)).toEqual({
        credential: credentialValue,
        credentialMetadata: newCredentialMetadata
      });
      credentialCache2.dispose();
    });
  });

  it('does not allow interaction if already disposed', async () => {
    const credentialCache: CredentialCache = await CredentialCache.initializeAsync({ supportEditing: true });
    credentialCache.dispose();

    expect(() => credentialCache.deleteCacheEntry('test')).toThrowErrorMatchingInlineSnapshot(
      `"This instance of CredentialCache has been disposed."`
    );
    await expect(() => credentialCache.saveIfModifiedAsync()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"This instance of CredentialCache has been disposed."`
    );
    expect(() =>
      credentialCache.setCacheEntry('test', { credential: 'test' })
    ).toThrowErrorMatchingInlineSnapshot(`"This instance of CredentialCache has been disposed."`);
    expect(() => credentialCache.trimExpiredEntries()).toThrowErrorMatchingInlineSnapshot(
      `"This instance of CredentialCache has been disposed."`
    );
    expect(() => credentialCache.tryGetCacheEntry('test')).toThrowErrorMatchingInlineSnapshot(
      `"This instance of CredentialCache has been disposed."`
    );
  });

  it("does not allow modification if initialized with 'supportEditing': false", async () => {
    const credentialCache: CredentialCache = await CredentialCache.initializeAsync({ supportEditing: false });

    expect(() => credentialCache.deleteCacheEntry('test')).toThrowErrorMatchingInlineSnapshot(
      `"This instance of CredentialCache does not support editing."`
    );
    await expect(() => credentialCache.saveIfModifiedAsync()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"This instance of CredentialCache does not support editing."`
    );
    expect(() =>
      credentialCache.setCacheEntry('test', { credential: 'test' })
    ).toThrowErrorMatchingInlineSnapshot(`"This instance of CredentialCache does not support editing."`);
    expect(() => credentialCache.trimExpiredEntries()).toThrowErrorMatchingInlineSnapshot(
      `"This instance of CredentialCache does not support editing."`
    );
  });
});
