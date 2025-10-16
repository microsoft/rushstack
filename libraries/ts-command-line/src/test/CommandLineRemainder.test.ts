// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DynamicCommandLineParser } from '../providers/DynamicCommandLineParser';
import { DynamicCommandLineAction } from '../providers/DynamicCommandLineAction';
import { ensureHelpTextMatchesSnapshot } from './helpTestUtilities';

describe('CommandLineRemainder', () => {
  it('renders help text', () => {
    const commandLineParser: DynamicCommandLineParser = new DynamicCommandLineParser({
      toolFilename: 'example',
      toolDescription: 'An example project'
    });
    commandLineParser.defineFlagParameter({
      parameterLongName: '--verbose',
      description: 'A flag that affects all actions'
    });

    const action: DynamicCommandLineAction = new DynamicCommandLineAction({
      actionName: 'run',
      summary: 'does the job',
      documentation: 'a longer description'
    });
    commandLineParser.addAction(action);

    action.defineStringParameter({
      parameterLongName: '--title',
      description: 'A string',
      argumentName: 'TEXT'
    });

    action.defineCommandLineRemainder({
      description: 'The action remainder'
    });

    ensureHelpTextMatchesSnapshot(commandLineParser);
  });

  it('parses an action input with remainder', async () => {
    const commandLineParser: DynamicCommandLineParser = new DynamicCommandLineParser({
      toolFilename: 'example',
      toolDescription: 'An example project'
    });
    commandLineParser.defineFlagParameter({
      parameterLongName: '--verbose',
      description: 'A flag that affects all actions'
    });

    const action: DynamicCommandLineAction = new DynamicCommandLineAction({
      actionName: 'run',
      summary: 'does the job',
      documentation: 'a longer description'
    });
    commandLineParser.addAction(action);

    action.defineStringParameter({
      parameterLongName: '--title',
      description: 'A string',
      argumentName: 'TEXT'
    });

    action.defineCommandLineRemainder({
      description: 'The action remainder'
    });

    const args: string[] = ['run', '--title', 'The title', 'the', 'remaining', 'args'];

    await commandLineParser.executeAsync(args);

    expect(commandLineParser.selectedAction).toBe(action);

    const copiedArgs: string[] = [];
    for (const parameter of action.parameters) {
      copiedArgs.push(`### ${parameter.longName} output: ###`);
      parameter.appendToArgList(copiedArgs);
    }

    copiedArgs.push(`### remainder output: ###`);
    action.remainder!.appendToArgList(copiedArgs);

    expect(copiedArgs).toMatchSnapshot();
  });

  it('parses an action input with remainder flagged options', async () => {
    const commandLineParser: DynamicCommandLineParser = new DynamicCommandLineParser({
      toolFilename: 'example',
      toolDescription: 'An example project'
    });
    commandLineParser.defineFlagParameter({
      parameterLongName: '--verbose',
      description: 'A flag that affects all actions'
    });

    const action: DynamicCommandLineAction = new DynamicCommandLineAction({
      actionName: 'run',
      summary: 'does the job',
      documentation: 'a longer description'
    });
    commandLineParser.addAction(action);

    action.defineStringParameter({
      parameterLongName: '--title',
      description: 'A string',
      argumentName: 'TEXT'
    });

    action.defineCommandLineRemainder({
      description: 'The action remainder'
    });

    const args: string[] = ['run', '--title', 'The title', '--', '--the', 'remaining', '--args'];

    await commandLineParser.executeAsync(args);

    expect(commandLineParser.selectedAction).toBe(action);

    const copiedArgs: string[] = [];
    for (const parameter of action.parameters) {
      copiedArgs.push(`### ${parameter.longName} output: ###`);
      parameter.appendToArgList(copiedArgs);
    }

    copiedArgs.push(`### remainder output: ###`);
    action.remainder!.appendToArgList(copiedArgs);

    expect(copiedArgs).toMatchSnapshot();
  });

  it('captures unknown parameters in remainder when they appear before --', async () => {
    // When remainder is defined, argparse treats everything after known parameters as remainder,
    // even if they look like flags. This is the expected behavior of argparse.Const.REMAINDER.
    const commandLineParser: DynamicCommandLineParser = new DynamicCommandLineParser({
      toolFilename: 'example',
      toolDescription: 'An example project'
    });
    commandLineParser.defineFlagParameter({
      parameterLongName: '--verbose',
      description: 'A flag that affects all actions'
    });

    const action: DynamicCommandLineAction = new DynamicCommandLineAction({
      actionName: 'run',
      summary: 'does the job',
      documentation: 'a longer description'
    });
    commandLineParser.addAction(action);

    action.defineStringParameter({
      parameterLongName: '--title',
      description: 'A string',
      argumentName: 'TEXT'
    });

    action.defineCommandLineRemainder({
      description: 'The action remainder'
    });

    const args: string[] = ['run', '--title', 'The title', '--unknown', 'value'];

    await commandLineParser.executeAsync(args);

    expect(commandLineParser.selectedAction).toBe(action);
    // Unknown parameters are captured as remainder args
    expect(action.remainder!.values).toEqual(['--unknown', 'value']);
  });

  it('excludes the -- separator from remainder values', async () => {
    const commandLineParser: DynamicCommandLineParser = new DynamicCommandLineParser({
      toolFilename: 'example',
      toolDescription: 'An example project'
    });
    commandLineParser.defineFlagParameter({
      parameterLongName: '--verbose',
      description: 'A flag that affects all actions'
    });

    const action: DynamicCommandLineAction = new DynamicCommandLineAction({
      actionName: 'run',
      summary: 'does the job',
      documentation: 'a longer description'
    });
    commandLineParser.addAction(action);

    action.defineStringParameter({
      parameterLongName: '--title',
      description: 'A string',
      argumentName: 'TEXT'
    });

    action.defineCommandLineRemainder({
      description: 'The action remainder'
    });

    const args: string[] = ['run', '--title', 'The title', '--', '--unknown', 'value'];

    await commandLineParser.executeAsync(args);

    expect(commandLineParser.selectedAction).toBe(action);
    // The -- separator itself should be filtered out (this is the key requirement from the PR comment)
    expect(action.remainder!.values).toEqual(['--unknown', 'value']);
  });
});
