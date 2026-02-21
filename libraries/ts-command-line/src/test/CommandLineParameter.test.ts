// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as argparse from 'argparse';

import { DynamicCommandLineParser } from '../providers/DynamicCommandLineParser.ts';
import { DynamicCommandLineAction } from '../providers/DynamicCommandLineAction.ts';
import { CommandLineParameterBase } from '../parameters/BaseClasses.ts';
import type { CommandLineParser } from '../providers/CommandLineParser.ts';
import type { CommandLineAction } from '../providers/CommandLineAction.ts';
import { ensureHelpTextMatchesSnapshot } from './helpTestUtilities.ts';

interface IExtendedArgumentParser extends argparse.ArgumentParser {
  _printMessage: (message: string) => void;
}

function createParser(): DynamicCommandLineParser {
  const commandLineParser: DynamicCommandLineParser = new DynamicCommandLineParser({
    toolFilename: 'example',
    toolDescription: 'An example project'
  });
  commandLineParser.defineFlagParameter({
    parameterLongName: '--global-flag',
    parameterShortName: '-g',
    description: 'A flag that affects all actions'
  });

  const action: DynamicCommandLineAction = new DynamicCommandLineAction({
    actionName: 'do:the-job',
    summary: 'does the job',
    documentation: 'a longer description'
  });
  commandLineParser.addAction(action);

  // Choice
  action.defineChoiceParameter({
    parameterLongName: '--choice',
    parameterShortName: '-c',
    description: 'A choice',
    alternatives: ['one', 'two', 'three', 'default'],
    environmentVariable: 'ENV_CHOICE'
  });
  action.defineChoiceParameter({
    parameterLongName: '--choice-with-default',
    description: 'A choice with a default. This description ends with a "quoted word"',
    alternatives: ['one', 'two', 'three', 'default'],
    environmentVariable: 'ENV_CHOICE2',
    defaultValue: 'default'
  });

  // Choice List
  action.defineChoiceListParameter({
    parameterLongName: '--choice-list',
    parameterShortName: '-C',
    description: 'This parameter may be specified multiple times to make a list of choices',
    alternatives: ['red', 'green', 'blue'],
    environmentVariable: 'ENV_CHOICE_LIST'
  });

  // Flag
  action.defineFlagParameter({
    parameterLongName: '--flag',
    parameterShortName: '-f',
    description: 'A flag',
    environmentVariable: 'ENV_FLAG'
  });

  // Integer
  action.defineIntegerParameter({
    parameterLongName: '--integer',
    parameterShortName: '-i',
    description: 'An integer',
    argumentName: 'NUMBER',
    environmentVariable: 'ENV_INTEGER'
  });
  action.defineIntegerParameter({
    parameterLongName: '--integer-with-default',
    description: 'An integer with a default',
    argumentName: 'NUMBER',
    environmentVariable: 'ENV_INTEGER2',
    defaultValue: 123
  });
  action.defineIntegerParameter({
    parameterLongName: '--integer-required',
    description: 'An integer',
    argumentName: 'NUMBER',
    required: true
  });
  action.defineIntegerParameter({
    parameterLongName: '--env-integer-required',
    description: 'An integer',
    argumentName: 'NUMBER',
    environmentVariable: 'ENV_INTEGER_REQUIRED',
    required: true
  });

  // Integer List
  action.defineIntegerListParameter({
    parameterLongName: '--integer-list',
    parameterShortName: '-I',
    description: 'This parameter may be specified multiple times to make a list of integers',
    argumentName: 'LIST_ITEM',
    environmentVariable: 'ENV_INTEGER_LIST'
  });

  // String
  action.defineStringParameter({
    parameterLongName: '--string',
    parameterShortName: '-s',
    description: 'A string',
    argumentName: 'TEXT',
    environmentVariable: 'ENV_STRING'
  });
  action.defineStringParameter({
    parameterLongName: '--string-with-default',
    description: 'A string with a default',
    argumentName: 'TEXT',
    environmentVariable: 'ENV_STRING2',
    defaultValue: '123'
  });
  action.defineStringParameter({
    parameterLongName: '--string-with-undocumented-synonym',
    description: 'A string with an undocumented synonym',
    argumentName: 'TEXT',
    undocumentedSynonyms: ['--undocumented-synonym']
  });

  // String List
  action.defineStringListParameter({
    parameterLongName: '--string-list',
    parameterShortName: '-l',
    description: 'This parameter may be specified multiple times to make a list of strings',
    argumentName: 'LIST_ITEM',
    environmentVariable: 'ENV_STRING_LIST'
  });

  return commandLineParser;
}

function expectPropertiesToMatchSnapshot(object: {}, propertyNames: string[]): void {
  const snapshotObject: {} = {};

  for (const propertyName of propertyNames) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (snapshotObject as any)[propertyName] = (object as any)[propertyName];
  }
  expect(snapshotObject).toMatchSnapshot();
}

const snapshotPropertyNames: string[] = [
  'description',
  'kind',
  'longName',
  'shortName',
  'value',
  'kind',
  'argumentName',
  'environmentVariable',
  'required',
  'defaultValue',
  'values'
];

describe(CommandLineParameterBase.name, () => {
  let existingEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    existingEnv = {
      ...process.env
    };
  });

  afterEach(() => {
    process.env = existingEnv;
  });

  it('renders help text', () => {
    const commandLineParser: CommandLineParser = createParser();
    ensureHelpTextMatchesSnapshot(commandLineParser);
  });

  it('parses an input with ALL parameters', async () => {
    const commandLineParser: CommandLineParser = createParser();
    const action: CommandLineAction = commandLineParser.getAction('do:the-job');

    const args: string[] = [
      '--global-flag',
      'do:the-job',
      '--choice',
      'two',
      '--choice-list',
      'red',
      '--choice-list',
      'blue',
      '--flag',
      '--integer',
      '123',
      '--integer-required',
      '321',
      '--env-integer-required',
      '123',
      '--integer-list',
      '37',
      '--integer-list',
      '-404',
      '--string',
      'hello',
      '--string-list',
      'first',
      '--string-list',
      'second'
    ];

    await expect(commandLineParser.executeAsync(args)).resolves.toBe(true);

    expect(commandLineParser.selectedAction).toBe(action);

    expectPropertiesToMatchSnapshot(
      commandLineParser.getFlagParameter('--global-flag'),
      snapshotPropertyNames
    );

    expectPropertiesToMatchSnapshot(action.getChoiceParameter('--choice'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(
      action.getChoiceParameter('--choice-with-default'),
      snapshotPropertyNames
    );
    expectPropertiesToMatchSnapshot(action.getChoiceListParameter('--choice-list'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(action.getFlagParameter('--flag'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(action.getIntegerParameter('--integer'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(
      action.getIntegerParameter('--integer-with-default'),
      snapshotPropertyNames
    );
    expectPropertiesToMatchSnapshot(action.getIntegerParameter('--integer-required'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(action.getIntegerListParameter('--integer-list'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(action.getStringParameter('--string'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(
      action.getStringParameter('--string-with-default'),
      snapshotPropertyNames
    );
    expectPropertiesToMatchSnapshot(action.getStringListParameter('--string-list'), snapshotPropertyNames);

    const copiedArgs: string[] = [];
    for (const parameter of action.parameters) {
      copiedArgs.push(`### ${parameter.longName} output: ###`);
      parameter.appendToArgList(copiedArgs);
    }
    expect(copiedArgs).toMatchSnapshot();
  });

  it('parses an input with NO parameters', async () => {
    const commandLineParser: CommandLineParser = createParser();
    const action: CommandLineAction = commandLineParser.getAction('do:the-job');
    const args: string[] = ['do:the-job', '--integer-required', '123', '--env-integer-required', '321'];

    await expect(commandLineParser.executeAsync(args)).resolves.toBe(true);

    expect(commandLineParser.selectedAction).toBe(action);

    expectPropertiesToMatchSnapshot(
      commandLineParser.getFlagParameter('--global-flag'),
      snapshotPropertyNames
    );

    expectPropertiesToMatchSnapshot(action.getChoiceParameter('--choice'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(
      action.getChoiceParameter('--choice-with-default'),
      snapshotPropertyNames
    );
    expectPropertiesToMatchSnapshot(action.getChoiceListParameter('--choice-list'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(action.getFlagParameter('--flag'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(action.getIntegerParameter('--integer'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(
      action.getIntegerParameter('--integer-with-default'),
      snapshotPropertyNames
    );
    expectPropertiesToMatchSnapshot(action.getIntegerParameter('--integer-required'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(action.getIntegerListParameter('--integer-list'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(action.getStringParameter('--string'), snapshotPropertyNames);
    expectPropertiesToMatchSnapshot(
      action.getStringParameter('--string-with-default'),
      snapshotPropertyNames
    );
    expectPropertiesToMatchSnapshot(action.getStringListParameter('--string-list'), snapshotPropertyNames);

    const copiedArgs: string[] = [];
    for (const parameter of action.parameters) {
      copiedArgs.push(`### ${parameter.longName} output: ###`);
      parameter.appendToArgList(copiedArgs);
    }
    expect(copiedArgs).toMatchSnapshot();
  });

  it('parses each parameter from an environment variable', async () => {
    const commandLineParser: CommandLineParser = createParser();
    const action: CommandLineAction = commandLineParser.getAction('do:the-job');

    action.defineStringListParameter({
      parameterLongName: '--json-string-list',
      description: 'Test JSON parsing',
      argumentName: 'LIST_ITEM',
      environmentVariable: 'ENV_JSON_STRING_LIST'
    });

    const args: string[] = ['do:the-job', '--integer-required', '1'];

    process.env.ENV_CHOICE = 'one';
    process.env.ENV_CHOICE2 = 'two';
    process.env.ENV_CHOICE_LIST = ' [ "red", "green" ] ';
    process.env.ENV_FLAG = '1';
    process.env.ENV_INTEGER = '111';
    process.env.ENV_INTEGER2 = '222';
    process.env.ENV_INTEGER_REQUIRED = '333';
    process.env.ENV_INTEGER_LIST = ' [ 1 , 2 , 3 ] ';
    process.env.ENV_STRING = 'Hello, world!';
    process.env.ENV_STRING2 = 'Hello, world!';
    process.env.ENV_STRING_LIST = 'simple text';
    process.env.ENV_JSON_STRING_LIST = ' [ 1, true, "Hello, world!" ] ';

    await expect(commandLineParser.executeAsync(args)).resolves.toBe(true);

    expect(commandLineParser.selectedAction).toBe(action);

    const copiedArgs: string[] = [];
    for (const parameter of action.parameters) {
      copiedArgs.push(`### ${parameter.longName} output: ###`);
      parameter.appendToArgList(copiedArgs);
    }
    expect(copiedArgs).toMatchSnapshot();
  });

  it('allows an undocumented synonym', async () => {
    const commandLineParser: CommandLineParser = createParser();
    const action: CommandLineAction = commandLineParser.getAction('do:the-job');

    const args: string[] = [
      'do:the-job',
      '--undocumented-synonym',
      'undocumented-value',
      '--integer-required',
      '6',
      '--env-integer-required',
      '123'
    ];

    await expect(commandLineParser.executeAsync(args)).resolves.toBe(true);

    expect(commandLineParser.selectedAction).toBe(action);

    const copiedArgs: string[] = [];
    for (const parameter of action.parameters) {
      copiedArgs.push(`### ${parameter.longName} output: ###`);
      parameter.appendToArgList(copiedArgs);
    }
    expect(copiedArgs).toMatchSnapshot();
  });

  it('raises an error if a required parameter backed by an env variable is not provided', async () => {
    const commandLineParser: CommandLineParser = createParser();

    const printMessageSpy: jest.SpyInstance = jest
      .spyOn(argparse.ArgumentParser.prototype as IExtendedArgumentParser, '_printMessage')
      .mockImplementation(() => {
        /* don't print */
      });

    const args: string[] = ['do:the-job', '--integer-required', '1'];
    await expect(commandLineParser.executeWithoutErrorHandlingAsync(args)).rejects.toMatchSnapshot('Error');
    expect(printMessageSpy).toHaveBeenCalled();
    expect(printMessageSpy.mock.calls[0][0]).toMatchSnapshot('Usage');
  });

  it(
    'prints the same usage if a required parameter backed by an env variable is not provided as when ' +
      'a different required parameter is missing',
    async () => {
      const printMessageSpy: jest.SpyInstance = jest
        .spyOn(argparse.ArgumentParser.prototype as IExtendedArgumentParser, '_printMessage')
        .mockImplementation(() => {
          /* don't print */
        });

      async function runWithArgsAsync(args: string[]): Promise<void> {
        const commandLineParser: CommandLineParser = createParser();
        await expect(commandLineParser.executeAsync(args)).resolves.toBe(false);
      }

      await runWithArgsAsync(['do:the-job', '--integer-required', '1']);
      await runWithArgsAsync(['do:the-job', '--env-integer-required', '1']);

      expect(printMessageSpy).toHaveBeenCalledTimes(2);
      expect(printMessageSpy.mock.calls[0][0]).toMatchSnapshot('Usage');
      expect(printMessageSpy.mock.calls[0][0]).toEqual(printMessageSpy.mock.calls[1][0]);
    }
  );

  describe('choice list', () => {
    function createHelloWorldParser(): CommandLineParser {
      const commandLineParser: CommandLineParser = new DynamicCommandLineParser({
        toolFilename: 'example',
        toolDescription: 'An example project'
      });
      const action: DynamicCommandLineAction = new DynamicCommandLineAction({
        actionName: 'hello-world',
        summary: 'Hello World',
        documentation: 'best program'
      });
      commandLineParser.addAction(action);

      action.defineChoiceListParameter({
        parameterLongName: '--color',
        parameterShortName: '-c',
        description: 'Your favorite colors',
        alternatives: ['purple', 'yellow', 'pizza'],
        environmentVariable: 'ENV_COLOR'
      });

      return commandLineParser;
    }

    it('raises an error if env var value is not valid json', async () => {
      const commandLineParser: CommandLineParser = createHelloWorldParser();
      const args: string[] = ['hello-world'];
      process.env.ENV_COLOR = '[u';

      // TODO: When Node 18 support is removed, switch this to use
      // ```
      // await expect(
      //   commandLineParser.executeWithoutErrorHandling(args)
      // ).rejects.toThrowErrorMatchingSnapshot();
      // ```

      let error: string | undefined;
      try {
        await commandLineParser.executeWithoutErrorHandlingAsync(args);
      } catch (e) {
        error = e.message;
      }

      expect(error).toMatch(
        /^The \[u environment variable value looks like a JSON array but failed to parse: Unexpected token /
      );
    });

    it('raises an error if env var value is json containing non-scalars', async () => {
      const commandLineParser: CommandLineParser = createHelloWorldParser();
      const args: string[] = ['hello-world'];
      process.env.ENV_COLOR = '[{}]';

      await expect(
        commandLineParser.executeWithoutErrorHandlingAsync(args)
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it('raises an error if env var value is not a valid choice', async () => {
      const commandLineParser: CommandLineParser = createHelloWorldParser();
      const args: string[] = ['hello-world'];
      process.env.ENV_COLOR = 'oblong';

      await expect(
        commandLineParser.executeWithoutErrorHandlingAsync(args)
      ).rejects.toThrowErrorMatchingSnapshot();
    });
  });
});
