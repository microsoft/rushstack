// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonSchema } from '@rushstack/node-core-library';
import {
  AliasCommandLineAction,
  DynamicCommandLineAction,
  DynamicCommandLineParser
} from '@rushstack/ts-command-line';

import { HeftParameterManager } from '../HeftParameterManager';
import { HeftTaskPluginDefinition, type IParameterJson } from '../../configuration/HeftPluginDefinition';
import heftPluginSchema from '../../schemas/heft-plugin.schema.json';

interface IParameterTestCase {
  parameter: IParameterJson;
  args: string[];
}

const PARAMETER_TEST_CASES: IParameterTestCase[] = [
  {
    parameter: { parameterKind: 'flag', longName: '--value', description: 'A flag.' },
    args: ['--value']
  },
  {
    parameter: {
      parameterKind: 'choice',
      longName: '--value',
      description: 'A choice.',
      alternatives: [{ name: 'first', description: 'First choice.' }]
    },
    args: ['--value', 'first']
  },
  {
    parameter: {
      parameterKind: 'choiceList',
      longName: '--value',
      description: 'A choice list.',
      alternatives: [{ name: 'first', description: 'First choice.' }]
    },
    args: ['--value', 'first']
  },
  {
    parameter: {
      parameterKind: 'integer',
      longName: '--value',
      description: 'An integer.',
      argumentName: 'VALUE'
    },
    args: ['--value', '0']
  },
  {
    parameter: {
      parameterKind: 'integerList',
      longName: '--value',
      description: 'An integer list.',
      argumentName: 'VALUE'
    },
    args: ['--value', '0']
  },
  {
    parameter: {
      parameterKind: 'string',
      longName: '--value',
      description: 'A string.',
      argumentName: 'VALUE'
    },
    args: ['--value', '']
  },
  {
    parameter: {
      parameterKind: 'stringList',
      longName: '--value',
      description: 'A string list.',
      argumentName: 'VALUE'
    },
    args: ['--value', '']
  }
];

function createPlugin(
  parameter: IParameterJson,
  parameterScope: string = 'test-scope'
): HeftTaskPluginDefinition {
  return HeftTaskPluginDefinition.loadFromObject({
    heftPluginDefinitionJson: {
      pluginName: 'test-plugin',
      parameterScope,
      entryPoint: 'unused.js',
      parameters: [parameter]
    },
    packageName: 'test-package',
    packageRoot: __dirname
  });
}

async function parseAsync(
  plugins: HeftTaskPluginDefinition[],
  args: string[],
  aliasDefaults?: string[]
): Promise<HeftParameterManager> {
  const parser: DynamicCommandLineParser = new DynamicCommandLineParser({
    toolFilename: 'heft-test',
    toolDescription: 'Test parameter preflight.'
  });
  const action: DynamicCommandLineAction = new DynamicCommandLineAction({
    actionName: 'run',
    summary: 'Run a test.',
    documentation: 'Run a test.'
  });
  parser.addAction(action);
  const clean = action.defineFlagParameter({ parameterLongName: '--clean', description: 'Clean outputs.' });
  const watch = action.defineFlagParameter({ parameterLongName: '--watch', description: 'Watch files.' });
  const manager: HeftParameterManager = new HeftParameterManager({
    getIsClean: () => clean.value,
    getIsWatch: () => watch.value,
    getIsDebug: () => false,
    getIsVerbose: () => false,
    getIsProduction: () => false,
    getLocales: () => []
  });
  for (const plugin of plugins) {
    manager.addPluginParameters(plugin);
  }
  manager.finalizeParameters(action);
  if (aliasDefaults) {
    parser.addAction(
      new AliasCommandLineAction({
        toolFilename: 'heft-test',
        aliasName: 'alias',
        targetAction: action,
        defaultParameters: aliasDefaults
      })
    );
  }
  await parser.executeWithoutErrorHandlingAsync([aliasDefaults ? 'alias' : 'run', ...args]);
  return manager;
}

describe(HeftParameterManager.name, () => {
  describe.each(PARAMETER_TEST_CASES)('$parameter.parameterKind', ({ parameter, args }) => {
    it.each(['--clean', '--watch'])('rejects an active restricted value with %s', async (mode) => {
      const manager: HeftParameterManager = await parseAsync(
        [createPlugin({ ...parameter, allowWithClean: false, allowInWatchMode: false })],
        [mode, ...args]
      );
      expect(() => manager.validateParameters()).toThrow(
        `Parameter "--test-scope:value" from plugin "test-plugin" in package "test-package" cannot be used with ${
          mode === '--clean' ? '--clean' : 'watch mode'
        }. Run ${mode === '--clean' ? 'without --clean' : 'in a non-watch action'}`
      );
    });

    it.each(['--clean', '--watch'])('allows an inactive restricted value with %s', async (mode) => {
      const manager: HeftParameterManager = await parseAsync(
        [createPlugin({ ...parameter, allowWithClean: false, allowInWatchMode: false })],
        [mode]
      );
      expect(() => manager.validateParameters()).not.toThrow();
    });

    it('allows an active restricted value without either mode', async () => {
      const manager: HeftParameterManager = await parseAsync(
        [createPlugin({ ...parameter, allowWithClean: false, allowInWatchMode: false })],
        args
      );
      expect(() => manager.validateParameters()).not.toThrow();
    });

    it.each([undefined, true])('preserves behavior when restrictions are %s', async (restriction) => {
      const manager: HeftParameterManager = await parseAsync(
        [createPlugin({ ...parameter, allowWithClean: restriction, allowInWatchMode: restriction })],
        ['--clean', '--watch', ...args]
      );
      expect(() => manager.validateParameters()).not.toThrow();
    });

    it('does not restrict the other mode', async () => {
      const cleanOnly: HeftParameterManager = await parseAsync(
        [createPlugin({ ...parameter, allowWithClean: false })],
        ['--watch', ...args]
      );
      const watchOnly: HeftParameterManager = await parseAsync(
        [createPlugin({ ...parameter, allowInWatchMode: false })],
        ['--clean', ...args]
      );
      expect(() => cleanOnly.validateParameters()).not.toThrow();
      expect(() => watchOnly.validateParameters()).not.toThrow();
    });
  });

  it.each<IParameterJson>([
    {
      parameterKind: 'integer',
      longName: '--value',
      description: 'Default zero.',
      argumentName: 'VALUE',
      defaultValue: 0
    },
    {
      parameterKind: 'string',
      longName: '--value',
      description: 'Default empty string.',
      argumentName: 'VALUE',
      defaultValue: ''
    },
    {
      parameterKind: 'choice',
      longName: '--value',
      description: 'Default choice.',
      alternatives: [{ name: 'first', description: 'First choice.' }],
      defaultValue: 'first'
    }
  ])('checks the effective default for $parameterKind', async (parameter) => {
    for (const mode of ['--clean', '--watch']) {
      const manager: HeftParameterManager = await parseAsync(
        [createPlugin({ ...parameter, allowWithClean: false, allowInWatchMode: false })],
        [mode]
      );
      expect(() => manager.validateParameters()).toThrow('--test-scope:value');
    }
  });

  it('checks scoped values independently when long names collide', async () => {
    const parameter: IParameterJson = {
      parameterKind: 'flag',
      longName: '--value',
      description: 'A flag.'
    };
    const plugins: HeftTaskPluginDefinition[] = [
      createPlugin({ ...parameter, allowWithClean: false }, 'restricted'),
      createPlugin(parameter, 'unrestricted')
    ];
    const allowed: HeftParameterManager = await parseAsync(plugins, ['--clean', '--unrestricted:value']);
    expect(() => allowed.validateParameters()).not.toThrow();
    const rejected: HeftParameterManager = await parseAsync(plugins, ['--clean', '--restricted:value']);
    expect(() => rejected.validateParameters()).toThrow('--restricted:value');
  });

  it('checks short names and alias defaults using parsed values', async () => {
    const plugin: HeftTaskPluginDefinition = createPlugin({
      parameterKind: 'flag',
      longName: '--value',
      shortName: '-x',
      description: 'A flag.',
      allowWithClean: false
    });
    const manager: HeftParameterManager = await parseAsync([plugin], [], ['--clean', '-x']);
    expect(() => manager.validateParameters()).toThrow('--test-scope:value');
  });
});

describe('plugin parameter restriction schema', () => {
  const schema: JsonSchema = JsonSchema.fromLoadedObject(heftPluginSchema);
  it.each(PARAMETER_TEST_CASES)('validates metadata on $parameter.parameterKind', ({ parameter }) => {
    const validate = (extra: object): void =>
      schema.validateObject(
        {
          taskPlugins: [
            { pluginName: 'test-plugin', entryPoint: 'unused.js', parameters: [{ ...parameter, ...extra }] }
          ]
        },
        'heft-plugin.json'
      );
    expect(() => validate({ allowWithClean: false, allowInWatchMode: false })).not.toThrow();
    expect(() => validate({ allowWithClean: true, allowInWatchMode: true })).not.toThrow();
    expect(() => validate({ allowWithClean: 'false' })).toThrow();
    expect(() => validate({ allowInWatchMode: 'false' })).toThrow();
    expect(() => validate({ unknownRestriction: false })).toThrow();
  });
});
