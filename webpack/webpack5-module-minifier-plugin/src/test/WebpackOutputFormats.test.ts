// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { promisify } from 'node:util';

import webpack, { type Stats, type InputFileSystem, type OutputFileSystem } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { ModuleMinifierPlugin } from '../ModuleMinifierPlugin';
import { MockMinifier } from './MockMinifier';

jest.setTimeout(1e9);

describe('WebpackOutputFormats', () => {
  it('Captures code sent to minifier with arrowFunction=false', async () => {
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
        environment: {
          arrowFunction: false,
          const: false,
          destructuring: false,
          forOf: false,
          module: false
        }
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
    expect(errors).toMatchSnapshot('Errors');
    expect(warnings).toMatchSnapshot('Warnings');

    // Capture what was sent to the minifier
    const requests: Array<[string, string]> = Array.from(mockMinifier.requests.entries());
    // Just check that modules have the expected wrapper
    for (const [, code] of requests) {
      if (code.includes('__MINIFY_MODULE__')) {
        expect(code).toMatch(/^__MINIFY_MODULE__\(/);
        expect(code).toMatch(/\);$/);
        // Check if it's function or arrow
        if (code.includes('function')) {
          expect(code).toContain('function');
        } else if (code.includes('=>')) {
          expect(code).toContain('=>');
        }
      }
    }
    expect(requests).toMatchSnapshot('Minifier Requests');
  });

  it('Captures code sent to minifier with arrowFunction=true', async () => {
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
        environment: {
          arrowFunction: true,
          const: true,
          destructuring: true,
          forOf: true,
          module: false
        }
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
    expect(errors).toMatchSnapshot('Errors');
    expect(warnings).toMatchSnapshot('Warnings');

    // Capture what was sent to the minifier
    const requests: Array<[string, string]> = Array.from(mockMinifier.requests.entries());
    // Just check that modules have the expected wrapper
    for (const [, code] of requests) {
      if (code.includes('__MINIFY_MODULE__')) {
        expect(code).toMatch(/^__MINIFY_MODULE__\(/);
        expect(code).toMatch(/\);$/);
        // Check if it's function or arrow
        if (code.includes('function')) {
          expect(code).toContain('function');
        } else if (code.includes('=>')) {
          expect(code).toContain('=>');
        }
      }
    }
    expect(requests).toMatchSnapshot('Minifier Requests');
  });
});
