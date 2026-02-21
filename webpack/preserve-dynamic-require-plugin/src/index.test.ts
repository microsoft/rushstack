// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import webpack from 'webpack';

import { PreserveDynamicRequireWebpackPlugin } from './index.ts';

jest.setTimeout(1e9);

describe(PreserveDynamicRequireWebpackPlugin.name, () => {
  it('Preserves dynamic require usage', async () => {
    const sources: Map<string, string> = new Map();
    sources.set('/package.json', JSON.stringify({}));
    sources.set('/file.js', 'require(process.env.SOME_PATH);');

    const compiler: webpack.Compiler = webpack({
      entry: {
        main: '/file.js'
      },
      output: {
        path: '/release',
        filename: '[name].js'
      },
      context: '/',
      mode: 'none',
      plugins: [new PreserveDynamicRequireWebpackPlugin()]
    });

    const inputFs: typeof compiler.inputFileSystem = {
      readFile(path: string, cb: (err?: NodeJS.ErrnoException | undefined, content?: string) => void): void {
        cb(undefined, sources.get(path));
      },
      readdir(path: string, cb: (err?: NodeJS.ErrnoException | undefined, files?: string[]) => void): void {
        cb(
          undefined,
          Array.from(sources.keys(), (key: string) => key.slice(1))
        );
      },
      readlink(path: string, cb: (err?: NodeJS.ErrnoException | undefined, dest?: string) => void): void {
        cb();
      },
      stat(path: string, cb: (err?: NodeJS.ErrnoException, stat?: unknown) => void): void {
        if (sources.has(path)) {
          return cb(undefined, {
            isFile() {
              return true;
            },
            isDirectory() {
              return false;
            }
          });
        } else if (path === '/') {
          return cb(undefined, {
            isFile() {
              return false;
            },
            isDirectory() {
              return true;
            }
          });
        }
        cb(new Error(`Unexpected stat call for ${path}`));
      }
    } as unknown as typeof compiler.inputFileSystem;

    const results: Map<string, string> = new Map();

    const outputFs: typeof compiler.outputFileSystem = {
      mkdir(path: string, cb: (err?: NodeJS.ErrnoException) => void): void {
        cb();
      },
      stat(path: string, cb: (err?: NodeJS.ErrnoException) => void): void {
        const err: NodeJS.ErrnoException = new Error(`No such file`);
        err.code = 'ENOENT';
        cb(err);
      },
      writeFile(path: string, content: Buffer, cb: (err?: NodeJS.ErrnoException) => void): void {
        results.set(path, content.toString('utf8'));
        cb();
      }
    } as unknown as typeof compiler.outputFileSystem;

    compiler.inputFileSystem = inputFs;
    compiler.outputFileSystem = outputFs;

    await new Promise<void>((resolve: () => void, reject: (err: Error) => void) =>
      compiler.run((err?: Error | null) => {
        if (err) {
          return reject(err);
        }
        resolve();
      })
    );

    expect(results).toMatchSnapshot();
  });
});
