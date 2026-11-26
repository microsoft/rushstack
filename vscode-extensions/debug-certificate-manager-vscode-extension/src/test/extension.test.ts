// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock(
  'vscode',
  () => {
    const path: typeof import('node:path') = jest.requireActual('node:path');

    function createUri(components: Pick<vscode.Uri, 'scheme' | 'authority' | 'path'>): vscode.Uri {
      const { scheme, authority, path: uriPath } = components;
      return {
        scheme,
        authority,
        path: uriPath,
        toString: (): string => `${scheme}://${authority}${uriPath}`
      } as vscode.Uri;
    }

    class MockFileSystemError extends Error {
      public readonly code: string;

      public constructor(code: string) {
        super(code);
        this.code = code;
      }

      public static FileNotFound(): MockFileSystemError {
        return new MockFileSystemError('FileNotFound');
      }

      public static NoPermissions(): MockFileSystemError {
        return new MockFileSystemError('NoPermissions');
      }
    }

    return {
      Uri: {
        from: jest.fn(createUri),
        joinPath: jest.fn((uri: vscode.Uri, ...segments: string[]): vscode.Uri => {
          const { scheme, authority, path: uriPath } = uri;
          return createUri({ scheme, authority, path: path.posix.join(uriPath, ...segments) });
        })
      },
      FileSystemError: MockFileSystemError,
      env: { remoteName: 'ssh-remote' },
      workspace: {
        workspaceFolders: [
          {
            uri: createUri({
              scheme: 'vscode-remote',
              authority: 'ssh-remote+test-host',
              path: '/work/project'
            }),
            name: 'project',
            index: 0
          }
        ],
        fs: {
          readFile: jest.fn(),
          createDirectory: jest.fn(),
          writeFile: jest.fn()
        }
      },
      window: {
        createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), show: jest.fn(), dispose: jest.fn() })),
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn()
      },
      commands: {
        registerCommand: jest.fn(() => ({ dispose: jest.fn() }))
      }
    };
  },
  { virtual: true }
);

jest.mock('../certificates', () => ({
  getCertificateManager: jest.fn(() => ({
    validateCertificateAsync: jest.fn().mockResolvedValue({
      isValid: true,
      certificate: {
        pemCaCertificate: 'test-ca',
        pemCertificate: 'test-certificate',
        pemKey: 'test-key'
      }
    })
  }))
}));

jest.mock('../config', () => ({ getConfig: jest.fn() }));
jest.mock('@rushstack/vscode-shared/lib/runWorkspaceCommandAsync', () => ({
  runWorkspaceCommandAsync: jest.fn()
}));

import * as vscode from 'vscode';

import { runWorkspaceCommandAsync } from '@rushstack/vscode-shared/lib/runWorkspaceCommandAsync';

import { activate } from '../extension';
import { getConfig } from '../config';
import { COMMAND_SYNC } from '../constants';

describe(activate.name, () => {
  const workspaceUri: vscode.Uri = vscode.Uri.from({
    scheme: 'vscode-remote',
    authority: 'ssh-remote+test-host',
    path: '/work/project'
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getConfig).mockReturnValue({ autoSync: false, homeDirectory: '/home/remote' });
    jest.mocked(vscode.workspace.fs.readFile).mockRejectedValue(vscode.FileSystemError.FileNotFound());
    jest.mocked(vscode.workspace.fs.createDirectory).mockResolvedValue(undefined);
    jest.mocked(vscode.workspace.fs.writeFile).mockResolvedValue(undefined);
  });

  async function syncAsync(): Promise<void> {
    const subscriptions: vscode.Disposable[] = [];
    const context: vscode.ExtensionContext = { subscriptions } as vscode.ExtensionContext;
    activate(context);
    const registration: Parameters<typeof vscode.commands.registerCommand> | undefined = jest
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find(
        (call: Parameters<typeof vscode.commands.registerCommand>): boolean => call[0] === COMMAND_SYNC
      );
    if (!registration) {
      throw new Error('Certificate synchronization command was not registered');
    }

    await registration[1]();
  }

  function expectCertificates(
    storePath: string,
    filenames: string[] = ['rushstack-ca.pem', 'rushstack-serve.pem', 'rushstack-serve.key']
  ): void {
    const { scheme, authority } = workspaceUri;
    expect(vscode.workspace.fs.createDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        scheme,
        authority,
        path: storePath
      })
    );
    expect(vscode.workspace.fs.writeFile).toHaveBeenCalledTimes(3);
    const contents: string[] = ['test-ca', 'test-certificate', 'test-key'];
    for (const [index, filename] of filenames.entries()) {
      expect(vscode.workspace.fs.writeFile).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({
          scheme,
          authority,
          path: `${storePath}/${filename}`
        }),
        Buffer.from(contents[index], 'utf8')
      );
    }

    const directoryCall: number = jest.mocked(vscode.workspace.fs.createDirectory).mock
      .invocationCallOrder[0];
    const writeCall: number = jest.mocked(vscode.workspace.fs.writeFile).mock.invocationCallOrder[0];
    expect(directoryCall).toBeLessThan(writeCall);
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  }

  it('syncs to the default remote store when workspace configuration is missing', async () => {
    await syncAsync();

    expect(vscode.workspace.fs.readFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/work/project/.vscode/debug-certificate-manager.json' })
    );
    expectCertificates('/home/remote/.rushstack');
  });

  it('resolves the default store using the remote home directory when no override is configured', async () => {
    jest.mocked(getConfig).mockReturnValue({ autoSync: false, homeDirectory: undefined });
    jest
      .mocked(runWorkspaceCommandAsync)
      .mockResolvedValue('shell output\n<<<HOMEDIR_START>>>/home/ssh-user<<<HOMEDIR_END>>>\n');

    await syncAsync();

    expect(runWorkspaceCommandAsync).toHaveBeenCalledTimes(1);
    expectCertificates('/home/ssh-user/.rushstack');
  });

  it('decodes plain Uint8Array configuration and preserves custom relative paths and filenames', async () => {
    const config: string = JSON.stringify({
      storePath: 'temp/certificates',
      caCertificateFilename: 'ca.pem',
      certificateFilename: 'certificate.pem',
      keyFilename: 'private-key.pem'
    });
    jest.mocked(vscode.workspace.fs.readFile).mockResolvedValue(new Uint8Array(Buffer.from(config, 'utf8')));

    await syncAsync();

    expectCertificates('/work/project/temp/certificates', ['ca.pem', 'certificate.pem', 'private-key.pem']);
  });

  it('preserves absolute store paths and default filenames from existing configuration', async () => {
    jest
      .mocked(vscode.workspace.fs.readFile)
      .mockResolvedValue(Buffer.from(JSON.stringify({ storePath: '/custom/certificates' }), 'utf8'));

    await syncAsync();

    expectCertificates('/custom/certificates');
  });

  it.each([vscode.FileSystemError.NoPermissions(), new Error('Connection lost')])(
    'does not fall back to the default store on read errors (%s)',
    async (error: Error) => {
      jest.mocked(vscode.workspace.fs.readFile).mockRejectedValue(error);

      await syncAsync();

      expect(vscode.workspace.fs.createDirectory).not.toHaveBeenCalled();
      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Error reading or parsing configuration file:')
      );
    }
  );

  it('reports malformed JSON without writing certificates', async () => {
    jest.mocked(vscode.workspace.fs.readFile).mockResolvedValue(Buffer.from('{ invalid JSON', 'utf8'));

    await syncAsync();

    expect(vscode.workspace.fs.createDirectory).not.toHaveBeenCalled();
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Error reading or parsing configuration file:')
    );
  });

  it('reports directory creation errors before attempting any certificate writes', async () => {
    jest
      .mocked(vscode.workspace.fs.createDirectory)
      .mockRejectedValue(vscode.FileSystemError.NoPermissions());

    await syncAsync();

    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Error synchronizing certificates: NoPermissions')
    );
  });
});
