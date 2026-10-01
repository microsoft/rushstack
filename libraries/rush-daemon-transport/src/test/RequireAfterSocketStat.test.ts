// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IChildOutcome } from './LinkedPackageFixture';
import {
  createLinkedPackageFolder,
  removeLinkedPackageFolder,
  runThenRequireLinkedPackage
} from './LinkedPackageFixture';

const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;

/** What meets the socket, its module, JavaScript that calls it (see the fixture), and what the child prints. */
type SocketCase = readonly [string, string, string, string];

const SOCKET_CASES: readonly SocketCase[] = [
  ['readFileIdentity', 'DaemonFileIdentity', 'out(typeof target.readFileIdentity(socketPath).ino);', 'number found'],
  [
    'removeOwnFile',
    'DaemonFileIdentity',
    'target.removeOwnFile(socketPath, target.readFileIdentity(socketPath)); out(fs.existsSync(socketPath));',
    'false found'
  ],
  [
    'listenPublishedAsync',
    'DaemonSocketPublication',
    'const published = net.createServer();' +
      ' out(typeof (await target.listenPublishedAsync(published, { socketPath: publishedPath })).ino);' +
      ' published.close();',
    'number found'
  ],
  [
    'verifyRuntimeFolder',
    'DaemonRuntimeFolderCheck',
    'try { target.verifyRuntimeFolder(socketPath, process.getuid()); } catch (error) { out(error.code); }',
    'unsafeRuntimeDirectory found'
  ]
];

// A plain stat of a socket leaves its type in the stat array that Node 22's cached realpath reads
// (nodejs/node#65113). Jest resolves modules itself, so a Node process of its own makes each call and then requires
// a package through a symbolic link, as pnpm installs them.
posixIt.each(SOCKET_CASES)(
  'leaves require() resolving symbolic links after %s meets a socket',
  (name: string, moduleName: string, call: string, expected: string) => {
    const folder: string = createLinkedPackageFolder();
    try {
      const outcome: IChildOutcome = runThenRequireLinkedPackage(folder, require.resolve(`../${moduleName}`), call);
      expect(outcome).toEqual({ status: 0, stdout: expected, stderr: '' });
    } finally {
      removeLinkedPackageFolder(folder);
    }
  }
);
