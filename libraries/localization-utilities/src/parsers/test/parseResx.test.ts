// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, NewlineKind } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import type { IgnoreStringFunction } from '../../interfaces.ts';
import { type IParseResxOptions, parseResx } from '../parseResx.ts';

describe(parseResx.name, () => {
  let terminalProvider: StringBufferTerminalProvider;
  let terminal: Terminal;

  beforeEach(() => {
    terminalProvider = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalProvider);
  });

  afterEach(() => {
    expect(terminalProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot('terminal output');
  });

  async function testResxAsync(
    filename:
      | 'invalidXml'
      | 'resxWithSchema'
      | 'stringWithoutComment'
      | 'stringWithQuotemarks'
      | 'withNewlines'
      | 'resxWithDuplicateEntry',
    optionsOverride: Partial<IParseResxOptions> = {}
  ): Promise<void> {
    const content: string = await FileSystem.readFileAsync(`${__dirname}/testResxFiles/${filename}.resx`);

    expect(
      parseResx({
        content,
        filePath: 'test.resx',
        terminal,
        ignoreMissingResxComments: undefined,
        resxNewlineNormalization: undefined,
        ...optionsOverride
      })
    ).toMatchSnapshot('Loc file');
  }

  it('parses a valid file with a schema', async () => {
    await testResxAsync('resxWithSchema');
  });

  it('parses a valid file with quotemarks', async () => {
    await testResxAsync('stringWithQuotemarks');
  });

  it('prints an error on invalid XML', async () => {
    await testResxAsync('invalidXml');
  });

  it('correctly ignores a string', async () => {
    const ignoredStringFunction: IgnoreStringFunction = jest
      .fn()
      .mockImplementation(
        (fileName: string, stringName: string) => fileName === 'test.resx' && stringName === 'bar'
      );

    await testResxAsync('resxWithSchema', {
      ignoreString: ignoredStringFunction
    });

    expect((ignoredStringFunction as unknown as jest.SpyInstance).mock.calls).toMatchSnapshot(
      'ignoreStrings calls'
    );
  });

  describe('ignoreMissingResxComments', () => {
    it('when set to true, ignores a missing comment', async () => {
      await testResxAsync('stringWithoutComment', {
        ignoreMissingResxComments: true
      });
    });

    it('when set to false, warns on a missing comment', async () => {
      await testResxAsync('stringWithoutComment', {
        ignoreMissingResxComments: false
      });
    });

    it('when set to undefined, warns on a missing comment', async () => {
      await testResxAsync('stringWithoutComment', {
        ignoreMissingResxComments: undefined
      });
    });
  });

  describe('resxNewlineNormalization', () => {
    it('when set to CrLf, normalizes to CrLf', async () => {
      await testResxAsync('withNewlines', {
        resxNewlineNormalization: NewlineKind.CrLf
      });
    });

    it('when set to Lf, normalizes to Lf', async () => {
      await testResxAsync('withNewlines', {
        resxNewlineNormalization: NewlineKind.Lf
      });
    });
  });

  it('fails to parse a RESX file with a duplicate string', async () => {
    await testResxAsync('resxWithDuplicateEntry');
  });
});
