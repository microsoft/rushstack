// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';

import { DynamicCommandLineParser } from '../DynamicCommandLineParser';
import { DynamicCommandLineAction } from '../DynamicCommandLineAction';

describe('CommandLineParameter', () => {
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
    actionVerb: 'do-job',
    summary: 'does the job',
    documentation: 'a longer description'
  });
  commandLineParser.addAction(action);

  action.defineChoiceParameter({
    parameterLongName: '--choice',
    parameterShortName: '-c',
    description: 'A choice',
    alternatives: [ 'one', 'two' ],
    defaultValue: 'one'
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

  it('prints the global help', () => {
    const helpText: string = colors.stripColors(commandLineParser.renderHelpText());
    expect(helpText).toMatchSnapshot();
  });

  it('prints the action help', () => {
    const helpText: string = colors.stripColors(action.renderHelpText());
    expect(helpText).toMatchSnapshot();
  });
});
