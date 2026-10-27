// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { AsyncParallelHook, AsyncSeriesWaterfallHook } from 'tapable';

import type {
  HeftConfiguration,
  IHeftTaskHooks,
  IHeftTaskSession,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions,
  IHeftTaskFileOperations,
  IWatchFileSystem
} from '@rushstack/heft';
import { MockScopedLogger } from '@rushstack/heft/lib/pluginFramework/logging/MockScopedLogger';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import SassPlugin from '../SassPlugin';
import { SassProcessor } from '../SassProcessor';

const buildFolder: string = path.resolve(__dirname, 'project');
const sourcePath: string = path.resolve(buildFolder, 'src/styles.module.scss');
const manifestPath: string = path.resolve(buildFolder, 'node_modules/styles/package.json');

describe('SassPlugin manifest watching', () => {
  let hooks: IHeftTaskHooks;
  let runOptions: IHeftTaskRunIncrementalHookOptions;
  let compileSpy: jest.SpyInstance;
  let manifestPathsSpy: jest.SpyInstance;
  let watchGlobMock: jest.Mock;
  let trackFileMock: jest.Mock;

  beforeEach(() => {
    hooks = {
      run: new AsyncParallelHook<IHeftTaskRunHookOptions>(['options']),
      runIncremental: new AsyncParallelHook<IHeftTaskRunIncrementalHookOptions>(['options']),
      registerFileOperations: new AsyncSeriesWaterfallHook<IHeftTaskFileOperations>(['operations'])
    };
    const logger: MockScopedLogger = new MockScopedLogger(new Terminal(new StringBufferTerminalProvider()));
    const session: Pick<IHeftTaskSession, 'hooks' | 'logger' | 'tempFolderPath'> = {
      hooks,
      logger,
      tempFolderPath: path.resolve(buildFolder, 'temp/sass')
    };
    const configuration: Pick<
      HeftConfiguration,
      'numberOfCores' | 'slashNormalizedBuildFolderPath' | 'tryLoadProjectConfigurationFileAsync'
    > = {
      numberOfCores: 1,
      slashNormalizedBuildFolderPath: buildFolder,
      tryLoadProjectConfigurationFileAsync: jest.fn().mockResolvedValue(undefined)
    };
    jest.spyOn(SassProcessor.prototype, 'loadCacheAsync').mockResolvedValue(undefined);
    compileSpy = jest.spyOn(SassProcessor.prototype, 'compileFilesAsync').mockResolvedValue(undefined);
    manifestPathsSpy = jest.spyOn(SassProcessor.prototype, 'packageManifestPaths', 'get').mockReturnValue([]);
    new SassPlugin().apply(session as IHeftTaskSession, configuration as HeftConfiguration);

    watchGlobMock = jest.fn().mockResolvedValue(new Map());
    trackFileMock = jest.fn().mockResolvedValue({ changed: false });
    const watchFs: IWatchFileSystem = {
      readdirSync: jest.fn(),
      readdir: jest.fn(),
      lstat: jest.fn(),
      lstatSync: jest.fn(),
      stat: jest.fn(),
      statSync: jest.fn(),
      getStateAndTrackAsync: trackFileMock,
      getStateAndTrack: jest.fn()
    };
    runOptions = {
      abortSignal: new AbortController().signal,
      globAsync: jest.fn(),
      watchGlobAsync: watchGlobMock,
      requestRun: jest.fn(),
      watchFs
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registers newly discovered manifests and recompiles on manifest-only changes', async () => {
    watchGlobMock.mockResolvedValue(new Map([[sourcePath, { changed: true }]]));
    compileSpy.mockImplementation(async () => {
      manifestPathsSpy.mockReturnValue([manifestPath]);
    });

    await hooks.runIncremental.promise(runOptions);

    expect(compileSpy).toHaveBeenLastCalledWith(new Set([sourcePath]));
    expect(trackFileMock).toHaveBeenCalledWith(manifestPath);

    watchGlobMock.mockResolvedValue(new Map([[sourcePath, { changed: false }]]));
    trackFileMock.mockResolvedValue({ changed: true });
    await hooks.runIncremental.promise(runOptions);

    expect(compileSpy).toHaveBeenCalledTimes(2);
    expect(compileSpy).toHaveBeenLastCalledWith(new Set([manifestPath]));
  });

  it('watches manifests restored from the cache before checking for changes', async () => {
    manifestPathsSpy.mockReturnValue([manifestPath]);
    trackFileMock.mockResolvedValue({ changed: true });

    await hooks.runIncremental.promise(runOptions);

    expect(trackFileMock).toHaveBeenCalledWith(manifestPath);
    expect(compileSpy).toHaveBeenCalledWith(new Set([manifestPath]));
  });

  it('does not compile unchanged manifests as standalone stylesheets', async () => {
    manifestPathsSpy.mockReturnValue([manifestPath]);

    await hooks.runIncremental.promise(runOptions);

    expect(trackFileMock).toHaveBeenCalledWith(manifestPath);
    expect(compileSpy).not.toHaveBeenCalled();
  });
});
