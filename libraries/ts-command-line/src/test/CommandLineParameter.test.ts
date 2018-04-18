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
    actionName: 'do-job',
    summary: 'does the job',
    documentation: 'a longer description'
  });
  commandLineParser.addAction(action);

  action.defineChoiceParameter({
    parameterLongName: '--choice-with-default',
    description: 'A choice with a default',
    alternatives: [ 'one', 'two' ],
    defaultValue: 'one'
  });
  action.defineChoiceParameter({
    parameterLongName: '--choice',
    parameterShortName: '-c',
    description: 'A choice without a default',
    alternatives: [ 'one', 'two' ]
  });
  action.defineFlagParameter({
    parameterLongName: '--flag',
    parameterShortName: '-f',
    description: 'A flag'
  });
  action.defineIntegerParameter({
    parameterLongName: '--integer',
    parameterShortName: '-i',
    description: 'An integer',
    argumentName: 'NUMBER'
  });
  action.defineStringParameter({
    parameterLongName: '--string',
    parameterShortName: '-s',
    description: 'A string',
    argumentName: 'TEXT'
  });
  action.defineStringListParameter({
    parameterLongName: '--string-list',
    parameterShortName: '-l',
    description: 'A string list',
    argumentName: 'LIST'
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

describe('CommandLineParameter', () => {
  it('prints the global help', () => {
    const commandLineParser: CommandLineParser = createParser();
    const helpText: string = colors.stripColors(commandLineParser.renderHelpText());
    expect(helpText).toMatchSnapshot();
  });

  it('prints the action help', () => {
    const commandLineParser: CommandLineParser = createParser();
    const helpText: string = colors.stripColors(commandLineParser.getAction('do-job').renderHelpText());
    expect(helpText).toMatchSnapshot();
  });

  it('parses an input with ALL parameters', () => {
    const commandLineParser: CommandLineParser = createParser();
    const action: CommandLineAction = commandLineParser.getAction('do-job');

    const args: string[] = [ '-g',
      'do-job', '-c', 'two', '-f', '-i', '123', '-s', 'hello', '-l', 'first', '-l', 'second'];

    return commandLineParser.execute(args).then(() => {
      expect(commandLineParser.selectedAction).toBe(action);

      expectPropertiesToMatchSnapshot(
        commandLineParser.getFlagParameter('--global-flag'),
        ['description', 'kind', 'longName', 'shortName', 'value']
      );

      expectPropertiesToMatchSnapshot(
        action.getChoiceParameter('--choice'),
        ['alternatives', 'defaultValue', 'description', 'kind', 'longName', 'shortName', 'value']
      );
      expectPropertiesToMatchSnapshot(
        action.getFlagParameter('--flag'),
        ['description', 'kind', 'longName', 'shortName', 'value']
      );
      expectPropertiesToMatchSnapshot(
        action.getIntegerParameter('--integer'),
        ['argumentName', 'description', 'kind', 'longName', 'shortName', 'value']
      );
      expectPropertiesToMatchSnapshot(
        action.getStringParameter('--string'),
        ['argumentName', 'description', 'kind', 'longName', 'shortName', 'value']
      );
      expectPropertiesToMatchSnapshot(
        action.getStringListParameter('--string-list'),
        ['argumentName', 'description', 'kind', 'longName', 'shortName', 'values']
      );
    });
  });

  it('parses an input with NO parameters', () => {
    const commandLineParser: CommandLineParser = createParser();
    const action: CommandLineAction = commandLineParser.getAction('do-job');
    const args: string[] = [ 'do-job'];

    return commandLineParser.execute(args).then(() => {
      expect(commandLineParser.selectedAction).toBe(action);

      expectPropertiesToMatchSnapshot(
        commandLineParser.getFlagParameter('--global-flag'),
        ['description', 'kind', 'longName', 'shortName', 'value']
      );

      expectPropertiesToMatchSnapshot(
        action.getChoiceParameter('--choice'),
        ['alternatives', 'defaultValue', 'description', 'kind', 'longName', 'shortName', 'value']
      );
      expectPropertiesToMatchSnapshot(
        action.getFlagParameter('--flag'),
        ['description', 'kind', 'longName', 'shortName', 'value']
      );
      expectPropertiesToMatchSnapshot(
        action.getIntegerParameter('--integer'),
        ['argumentName', 'description', 'kind', 'longName', 'shortName', 'value']
      );
      expectPropertiesToMatchSnapshot(
        action.getStringParameter('--string'),
        ['argumentName', 'description', 'kind', 'longName', 'shortName', 'value']
      );
      expectPropertiesToMatchSnapshot(
        action.getStringListParameter('--string-list'),
        ['argumentName', 'description', 'kind', 'longName', 'shortName', 'values']
      );
    });
  });
});
