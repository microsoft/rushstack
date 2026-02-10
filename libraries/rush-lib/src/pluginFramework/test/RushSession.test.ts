// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ConsoleTerminalProvider } from '@rushstack/terminal';

import { RushSession } from '../RushSession';
import type { IPublishProvider, PublishProviderFactory } from '../IPublishProvider';

function createTestSession(): RushSession {
  return new RushSession({
    terminalProvider: new ConsoleTerminalProvider(),
    getIsDebugMode: () => false
  });
}

function createMockFactory(providerName: string): PublishProviderFactory {
  return async () => ({
    providerName,
    publishAsync: async () => {},
    checkExistsAsync: async () => false
  });
}

describe(RushSession.name, () => {
  describe('publish provider factory registration', () => {
    it('registers and retrieves a publish provider factory', async () => {
      const session: RushSession = createTestSession();
      const factory: PublishProviderFactory = createMockFactory('npm');

      session.registerPublishProviderFactory('npm', factory);

      const retrieved: PublishProviderFactory | undefined = session.getPublishProviderFactory('npm');
      expect(retrieved).toBe(factory);

      const provider: IPublishProvider = await retrieved!();
      expect(provider.providerName).toEqual('npm');
    });

    it('throws on duplicate registration', () => {
      const session: RushSession = createTestSession();
      const factory1: PublishProviderFactory = createMockFactory('npm');
      const factory2: PublishProviderFactory = createMockFactory('npm');

      session.registerPublishProviderFactory('npm', factory1);

      expect(() => {
        session.registerPublishProviderFactory('npm', factory2);
      }).toThrow(/already been registered/);
    });

    it('returns undefined for unregistered target', () => {
      const session: RushSession = createTestSession();

      const factory: PublishProviderFactory | undefined = session.getPublishProviderFactory('nonexistent');
      expect(factory).toBeUndefined();
    });

    it('supports multiple different publish targets', () => {
      const session: RushSession = createTestSession();
      const npmFactory: PublishProviderFactory = createMockFactory('npm');
      const vsixFactory: PublishProviderFactory = createMockFactory('vsix');

      session.registerPublishProviderFactory('npm', npmFactory);
      session.registerPublishProviderFactory('vsix', vsixFactory);

      expect(session.getPublishProviderFactory('npm')).toBe(npmFactory);
      expect(session.getPublishProviderFactory('vsix')).toBe(vsixFactory);
    });
  });
});
