// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../typeScript7Loader.cjs', () => ({ importAsync: jest.fn() }));

import * as path from 'node:path';

import type { APIOptions, Diagnostic, ParsedCommandLine } from 'typescript-7/dist/api/async/api';

import type { IScopedLogger } from '@rushstack/heft';

import { TypeScript7Builder } from '../TypeScript7Builder';
import { importAsync } from '../typeScript7Loader.cjs';

describe('TypeScript 7 compiler lifecycle', () => {
  const diagnostic: Diagnostic = { code: 2322, category: 1, pos: 0, end: 0, text: 'type error' };
  let controller: AbortController;
  let config: ParsedCommandLine;
  let logger: IScopedLogger;
  let builder: TypeScript7Builder;
  let createApi: jest.Mock;
  const program = {
    getConfigFileParsingDiagnostics: jest.fn(),
    getProgramDiagnostics: jest.fn(),
    getGlobalDiagnostics: jest.fn(),
    getSyntacticDiagnostics: jest.fn(),
    getSemanticDiagnostics: jest.fn(),
    getDeclarationDiagnostics: jest.fn(),
    emit: jest.fn()
  };
  const api = {
    parseConfigFile: jest.fn(),
    createProgram: jest.fn(),
    close: jest.fn()
  };

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new AbortController();
    config = {
      fileNames: ['/project/src/index.ts' as ParsedCommandLine['fileNames'][number]],
      options: {},
      errors: []
    };
    logger = {
      emitError: jest.fn(),
      emitWarning: jest.fn(),
      terminal: { writeLine: jest.fn() }
    } as unknown as IScopedLogger;
    for (const method of Object.values(program)) {
      method.mockResolvedValue([]);
    }
    program.emit.mockResolvedValue({ diagnostics: [] });
    api.parseConfigFile.mockImplementation(async () => config);
    api.createProgram.mockResolvedValue(program);
    api.close.mockResolvedValue(undefined);
    createApi = jest.fn().mockImplementation(() => api);
    (importAsync as jest.Mock).mockResolvedValue({
      API: createApi,
      formatDiagnostics: (diagnostics: Diagnostic[]) => diagnostics[0].text
    });
    builder = new TypeScript7Builder({
      typescriptPackagePath: path.dirname(require.resolve('typescript-7/package.json')),
      tsconfigPath: '/project/tsconfig.json',
      buildFolderPath: '/project',
      abortSignal: controller.signal,
      logger
    });
  });

  it('forces typechecking and declaration-only output without selecting module kinds', async () => {
    config.options = { noCheck: true, declaration: false, emitDeclarationOnly: false, noEmitOnError: true };
    await builder.invokeAsync();
    const options: object = api.createProgram.mock.calls[0][1];
    expect(options).toEqual({
      configFilePath: '/project/tsconfig.json',
      noCheck: false,
      declaration: true,
      emitDeclarationOnly: true,
      noEmitOnError: true
    });
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it('reports and deduplicates all diagnostic stages including emit', async () => {
    config.errors.push(diagnostic);
    for (const method of Object.values(program)) {
      method.mockResolvedValue([diagnostic]);
    }
    program.emit.mockResolvedValue({ diagnostics: [diagnostic] });
    await builder.invokeAsync();
    expect(logger.emitError).toHaveBeenCalledTimes(1);
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it.each(['parseConfigFile', 'createProgram'])('closes after %s fails', async (method) => {
    api[method as 'parseConfigFile' | 'createProgram'].mockRejectedValue(new Error('compiler failure'));
    await expect(builder.invokeAsync()).rejects.toThrow('compiler failure');
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it('closes after diagnostics or emit fail', async () => {
    program.getSemanticDiagnostics.mockRejectedValueOnce(new Error('check failure'));
    await expect(builder.invokeAsync()).rejects.toThrow('check failure');
    expect(api.close).toHaveBeenCalledTimes(1);
    program.emit.mockRejectedValueOnce(new Error('emit failure'));
    await expect(builder.invokeAsync()).rejects.toThrow('emit failure');
    expect(api.close).toHaveBeenCalledTimes(2);
  });

  it('does not emit after cancellation and still closes the native session', async () => {
    program.getSemanticDiagnostics.mockImplementation(async () => {
      controller.abort();
      return [];
    });
    await builder.invokeAsync();
    expect(program.emit).not.toHaveBeenCalled();
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it('guards against accidental JavaScript output', async () => {
    await builder.invokeAsync();
    const options: APIOptions = createApi.mock.calls[0][0];
    const writeFile = options.fs!.writeFile;
    if (typeof writeFile !== 'function') {
      throw new Error('Expected a writeFile callback');
    }
    expect(() => writeFile('/project/out/index.js' as never, 'JavaScript')).toThrow(
      'cannot emit JavaScript'
    );
  });
});
