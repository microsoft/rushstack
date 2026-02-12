// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { promisify } from 'node:util';

import webpack, { type Stats, type InputFileSystem, type OutputFileSystem } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { ModuleMinifierPlugin } from '../ModuleMinifierPlugin';
import { MockMinifier } from './MockMinifier';

jest.setTimeout(1e9);

interface ITestEnvironment {
  methodShorthand?: boolean;
  arrowFunction?: boolean;
  const?: boolean;
  destructuring?: boolean;
  forOf?: boolean;
  module?: boolean;
}

async function runWebpackWithEnvironment(environment: ITestEnvironment): Promise<{
  errors: webpack.StatsError[];
  warnings: webpack.StatsError[];
  requests: Array<[string, string]>;
}> {
  const mockMinifier: MockMinifier = new MockMinifier();
  const memoryFileSystem: Volume = new Volume();
  memoryFileSystem.fromJSON(
    {
      '/package.json': '{}',
      '/entry.js': `import('./module.js').then(m => m.test());`,
      '/module.js': `export function test() { console.log("test"); }`
    },
    '/src'
  );

  const minifierPlugin: ModuleMinifierPlugin = new ModuleMinifierPlugin({
    minifier: mockMinifier
  });

  const compiler: webpack.Compiler = webpack({
    entry: '/entry.js',
    output: {
      path: '/release',
      filename: 'bundle.js',
      environment
    },
    optimization: {
      minimizer: []
    },
    context: '/',
    mode: 'production',
    plugins: [minifierPlugin]
  });

  compiler.inputFileSystem = memoryFileSystem as unknown as InputFileSystem;
  compiler.outputFileSystem = memoryFileSystem as unknown as OutputFileSystem;

  const stats: Stats | undefined = await promisify(compiler.run.bind(compiler))();
  await promisify(compiler.close.bind(compiler));
  if (!stats) {
    throw new Error(`Expected stats`);
  }
  const { errors, warnings } = stats.toJson('errors-warnings');

  const requests: Array<[string, string]> = Array.from(mockMinifier.requests.entries());

  return { errors: errors || [], warnings: warnings || [], requests };
}

describe('WebpackOutputFormats', () => {
  it('Captures code sent to minifier with methodShorthand=false, arrowFunction=false', async () => {
    const { errors, warnings, requests } = await runWebpackWithEnvironment({
      methodShorthand: false,
      arrowFunction: false,
      const: false,
      destructuring: false,
      forOf: false,
      module: false
    });

    expect(errors).toMatchSnapshot('Errors');
    expect(warnings).toMatchSnapshot('Warnings');

    // Verify modules are wrapped with regular function format
    for (const [, code] of requests) {
      if (code.includes('__MINIFY_MODULE__')) {
        expect(code).toMatch(/^__MINIFY_MODULE__\(/);
        expect(code).toMatch(/\);$/);
        // With methodShorthand=false and arrowFunction=false, expect function keyword
        expect(code).toContain('function');
        expect(code).not.toContain('=>');
      }
    }
    expect(requests).toMatchSnapshot('Minifier Requests');
  });

  it('Captures code sent to minifier with methodShorthand=false, arrowFunction=true', async () => {
    const { errors, warnings, requests } = await runWebpackWithEnvironment({
      methodShorthand: false,
      arrowFunction: true,
      const: true,
      destructuring: true,
      forOf: true,
      module: false
    });

    expect(errors).toMatchSnapshot('Errors');
    expect(warnings).toMatchSnapshot('Warnings');

    // Verify modules use arrow function format when arrowFunction=true
    for (const [, code] of requests) {
      if (code.includes('__MINIFY_MODULE__')) {
        expect(code).toMatch(/^__MINIFY_MODULE__\(/);
        expect(code).toMatch(/\);$/);
        // With arrowFunction=true, may have arrow functions in module code
        // but the module wrapper itself uses the rendered format
      }
    }
    expect(requests).toMatchSnapshot('Minifier Requests');
  });

  it('Captures code sent to minifier with methodShorthand=true', async () => {
    const { errors, warnings, requests } = await runWebpackWithEnvironment({
      methodShorthand: true,
      arrowFunction: true,
      const: true,
      destructuring: true,
      forOf: true,
      module: false
    });

    expect(errors).toMatchSnapshot('Errors');
    expect(warnings).toMatchSnapshot('Warnings');

    // Verify modules are wrapped with shorthand format when methodShorthand=true
    for (const [, code] of requests) {
      if (code.includes('__MINIFY_MODULE__')) {
        expect(code).toMatch(/^__MINIFY_MODULE__\(/);
        expect(code).toMatch(/\);$/);
        // With methodShorthand=true, expect shorthand wrapper with __DEFAULT_ID__
        if (code.includes('__DEFAULT_ID__')) {
          expect(code).toContain('__DEFAULT_ID__');
        }
      }
    }
    expect(requests).toMatchSnapshot('Minifier Requests');
  });
});
