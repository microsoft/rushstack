// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration, IHeftParameters, IHeftTaskSession, IScopedLogger } from '@rushstack/heft';
import { MockScopedLogger } from '@rushstack/heft/lib/pluginFramework/logging/MockScopedLogger';
import { type ITerminal, StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import * as WebpackConfigurationLoader from '../WebpackConfigurationLoader.ts';
import { _createAccessorHooks } from '../Webpack5Plugin.ts';
import { type IWebpackConfiguration, STAGE_LOAD_LOCAL_CONFIG } from '../shared.ts';

interface IMockLoadWebpackConfigurationOptions
  extends WebpackConfigurationLoader.ILoadWebpackConfigurationOptions {
  loadWebpackAsyncFn: jest.Mock;
  _terminalProvider: StringBufferTerminalProvider;
  _tryLoadConfigFileAsync: jest.Mock;
}

describe(WebpackConfigurationLoader.tryLoadWebpackConfigurationAsync.name, () => {
  function createOptions(production: boolean, serveMode: boolean): IMockLoadWebpackConfigurationOptions {
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(false);
    const terminal: ITerminal = new Terminal(terminalProvider);
    const logger: IScopedLogger = new MockScopedLogger(terminal);
    const buildFolderPath: string = __dirname;

    const parameters: Partial<IHeftParameters> = {
      production
    };

    const taskSession: IHeftTaskSession = {
      logger,
      parameters: parameters as unknown as IHeftParameters,
      // Other values unused during these tests
      hooks: undefined!,
      parsedCommandLine: undefined!,
      requestAccessToPluginByName: undefined!,
      taskName: 'webpack',
      tempFolderPath: `${__dirname}/temp`
    };

    const heftConfiguration: Partial<HeftConfiguration> = {
      buildFolderPath
    };

    return {
      taskSession,
      heftConfiguration: heftConfiguration as unknown as HeftConfiguration,
      hooks: _createAccessorHooks(),
      loadWebpackAsyncFn: jest.fn(),
      serveMode,

      _terminalProvider: terminalProvider,
      _tryLoadConfigFileAsync: jest.fn()
    };
  }

  it(`onLoadConfiguration can return false`, async () => {
    const options: IMockLoadWebpackConfigurationOptions = createOptions(false, false);

    const onLoadConfiguration: jest.Mock = jest.fn();
    const onConfigure: jest.Mock = jest.fn();
    const onAfterConfigure: jest.Mock = jest.fn();

    options.hooks.onLoadConfiguration.tap('test', onLoadConfiguration);
    options.hooks.onConfigure.tap('test', onConfigure);
    options.hooks.onAfterConfigure.tap('test', onAfterConfigure);

    onLoadConfiguration.mockReturnValue(false);

    const config: IWebpackConfiguration | undefined =
      await WebpackConfigurationLoader.tryLoadWebpackConfigurationAsync(options, {});
    expect(config).toBeUndefined();
    expect(onLoadConfiguration).toHaveBeenCalledTimes(1);
    expect(options._tryLoadConfigFileAsync).toHaveBeenCalledTimes(0);
    expect(onConfigure).toHaveBeenCalledTimes(0);
    expect(onAfterConfigure).toHaveBeenCalledTimes(0);
  });

  it(`calls tryLoadWebpackConfigurationFileAsync`, async () => {
    const options: IMockLoadWebpackConfigurationOptions = createOptions(false, false);

    const onConfigure: jest.Mock = jest.fn();
    const onAfterConfigure: jest.Mock = jest.fn();

    options.hooks.onConfigure.tap('test', onConfigure);
    options.hooks.onAfterConfigure.tap('test', onAfterConfigure);

    options._tryLoadConfigFileAsync.mockReturnValue(Promise.resolve(undefined));

    const config: IWebpackConfiguration | undefined =
      await WebpackConfigurationLoader.tryLoadWebpackConfigurationAsync(options, {});
    expect(config).toBeUndefined();
    expect(options._tryLoadConfigFileAsync).toHaveBeenCalledTimes(1);
    expect(onConfigure).toHaveBeenCalledTimes(0);
    expect(onAfterConfigure).toHaveBeenCalledTimes(0);
  });

  it(`can fall back`, async () => {
    const options: IMockLoadWebpackConfigurationOptions = createOptions(false, false);

    const onLoadConfiguration: jest.Mock = jest.fn();
    const onConfigure: jest.Mock = jest.fn();
    const onAfterConfigure: jest.Mock = jest.fn();

    options.hooks.onLoadConfiguration.tap(
      { name: 'test', stage: STAGE_LOAD_LOCAL_CONFIG + 1 },
      onLoadConfiguration
    );
    options.hooks.onConfigure.tap('test', onConfigure);
    options.hooks.onAfterConfigure.tap('test', onAfterConfigure);

    options._tryLoadConfigFileAsync.mockReturnValue(Promise.resolve(undefined));

    const mockConfig: IWebpackConfiguration = {};
    onLoadConfiguration.mockReturnValue(mockConfig);

    const config: IWebpackConfiguration | undefined =
      await WebpackConfigurationLoader.tryLoadWebpackConfigurationAsync(options, {});
    expect(config).toBe(mockConfig);

    expect(options._tryLoadConfigFileAsync).toHaveBeenCalledTimes(1);
    expect(onLoadConfiguration).toHaveBeenCalledTimes(1);
    expect(onConfigure).toHaveBeenCalledTimes(1);
    expect(onAfterConfigure).toHaveBeenCalledTimes(1);

    expect(onConfigure).toHaveBeenCalledWith(mockConfig);
    expect(onAfterConfigure).toHaveBeenCalledWith(mockConfig);
  });

  it(`respects hook order`, async () => {
    const options: IMockLoadWebpackConfigurationOptions = createOptions(false, false);

    const onConfigure: jest.Mock = jest.fn();
    const onAfterConfigure: jest.Mock = jest.fn();

    options.hooks.onConfigure.tap('test', onConfigure);
    options.hooks.onAfterConfigure.tap('test', onAfterConfigure);

    const mockConfig: IWebpackConfiguration = {};

    options._tryLoadConfigFileAsync.mockReturnValue(Promise.resolve(mockConfig));

    const config: IWebpackConfiguration | undefined =
      await WebpackConfigurationLoader.tryLoadWebpackConfigurationAsync(options, {});
    expect(config).toBe(mockConfig);
    expect(options._tryLoadConfigFileAsync).toHaveBeenCalledTimes(1);
    expect(onConfigure).toHaveBeenCalledTimes(1);
    expect(onConfigure).toHaveBeenCalledWith(mockConfig);
    expect(onAfterConfigure).toHaveBeenCalledTimes(1);
    expect(onAfterConfigure).toHaveBeenCalledWith(mockConfig);
  });
});
