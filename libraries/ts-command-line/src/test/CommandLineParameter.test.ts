// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';

import { CommandLineAction } from '../CommandLineAction';
import { CommandLineParser } from '../CommandLineParser';
import { DynamicCommandLineParser } from '../DynamicCommandLineParser';
import { DynamicCommandLineAction } from '../DynamicCommandLineAction';

function createParser(): DynamicCommandLineParser {
  const commandLineParser: DynamicCommandLineParser = new DynamicCommandLineParser(
    {
      toolFilename: 'example',
      toolDescription: 'An example project'
    }
  );
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
    alternatives: [ 'one', 'two', 'three', 'default' ],
    environmentVariable: 'ENV_CHOICE'
  });
  action.defineChoiceParameter({
    parameterLongName: '--choice-with-default',
    description: 'A choice with a default',
    alternatives: [ 'one', 'two', 'three', 'default' ],
    environmentVariable: 'ENV_CHOICE',
    defaultValue: 'default'
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
    environmentVariable: 'ENV_INTEGER',
    defaultValue: 123
  });
  action.defineIntegerParameter({
    parameterLongName: '--integer-required',
    description: 'An integer',
    argumentName: 'NUMBER',
    required: true
  });

  // String
  action.defineStringParameter({
    parameterLongName: '--string',
    parameterShortName: '-s',
    description: 'A string',
    argumentName: 'TEXT',
    environmentVariable: 'ENV_INTEGER'
  });
  action.defineStringParameter({
    parameterLongName: '--string-with-default',
    description: 'A string with a default',
    argumentName: 'TEXT',
    environmentVariable: 'ENV_INTEGER',
    defaultValue: '123'
  });

  // String List
  action.defineStringListParameter({
    parameterLongName: '--string-list',
    parameterShortName: '-l',
    description: 'A string list',
    argumentName: 'LIST',
    environmentVariable: 'ENV_INTEGER'
  });
  return commandLineParser;
}

function expectPropertiesToMatchSnapshot(object: {}, propertyNames: string[]): void {
  const snapshotObject: {} = {};

  for (const propertyName of propertyNames) {
    snapshotObject[propertyName] = object[propertyName];
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

describe('CommandLineParameter', () => {
  it('prints the global help', () => {
    const commandLineParser: CommandLineParser = createParser();
    const helpText: string = colors.stripColors(commandLineParser.renderHelpText());
    expect(helpText).toMatchSnapshot();
  });

  it('prints the action help', () => {
    const commandLineParser: CommandLineParser = createParser();
    const helpText: string = colors.stripColors(commandLineParser.getAction('do:the-job').renderHelpText());
    expect(helpText).toMatchSnapshot();
  });

  it('parses an input with ALL parameters', () => {
    const commandLineParser: CommandLineParser = createParser();
    const action: CommandLineAction = commandLineParser.getAction('do:the-job');

    const args: string[] = [
      '--global-flag',
      'do:the-job',
      '--choice', 'two',
      '--flag',
      '--integer', '123',
      '--integer-required', '321',
      '--string', 'hello',
      '--string-list', 'first',
      '--string-list', 'second'
    ];

    return commandLineParser.execute(args).then(() => {
      expect(commandLineParser.selectedAction).toBe(action);

      expectPropertiesToMatchSnapshot(
        commandLineParser.getFlagParameter('--global-flag'),
        snapshotPropertyNames
      );

      expectPropertiesToMatchSnapshot(
        action.getChoiceParameter('--choice'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getChoiceParameter('--choice-with-default'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getFlagParameter('--flag'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getIntegerParameter('--integer'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getIntegerParameter('--integer-with-default'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getIntegerParameter('--integer-required'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getStringParameter('--string'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getStringParameter('--string-with-default'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getStringListParameter('--string-list'),
        snapshotPropertyNames
      );

      const copiedArgs: string[] = [];
      for (const parameter of action.parameters) {
        copiedArgs.push(`### ${parameter.longName} output: ###`);
        parameter.appendToArgList(copiedArgs);
      }
      expect(copiedArgs).toMatchSnapshot();
    });
  });

  it('parses an input with NO parameters', () => {
    const commandLineParser: CommandLineParser = createParser();
    const action: CommandLineAction = commandLineParser.getAction('do:the-job');
    const args: string[] = [ 'do:the-job', '--integer-required', '123'];

    return commandLineParser.execute(args).then(() => {
      expect(commandLineParser.selectedAction).toBe(action);

      expectPropertiesToMatchSnapshot(
        commandLineParser.getFlagParameter('--global-flag'),
        snapshotPropertyNames
      );

      expectPropertiesToMatchSnapshot(
        action.getChoiceParameter('--choice'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getChoiceParameter('--choice-with-default'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getFlagParameter('--flag'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getIntegerParameter('--integer'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getIntegerParameter('--integer-with-default'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getIntegerParameter('--integer-required'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getStringParameter('--string'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getStringParameter('--string-with-default'),
        snapshotPropertyNames
      );
      expectPropertiesToMatchSnapshot(
        action.getStringListParameter('--string-list'),
        snapshotPropertyNames
      );

      const copiedArgs: string[] = [];
      for (const parameter of action.parameters) {
        copiedArgs.push(`### ${parameter.longName} output: ###`);
        parameter.appendToArgList(copiedArgs);
      }
      expect(copiedArgs).toMatchSnapshot();
    });
  });
});
