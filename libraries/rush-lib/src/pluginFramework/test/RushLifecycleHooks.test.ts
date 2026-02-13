// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushLifecycleHooks, type IPublishCommand } from '../RushLifeCycle';

describe(RushLifecycleHooks.name, () => {
  describe('beforePublish', () => {
    it('fires with the publish command payload', async () => {
      const hooks: RushLifecycleHooks = new RushLifecycleHooks();
      const receivedPayloads: IPublishCommand[] = [];

      hooks.beforePublish.tapPromise('test', async (command: IPublishCommand) => {
        receivedPayloads.push(command);
      });

      const command: IPublishCommand = { actionName: 'publish', dryRun: false };
      await hooks.beforePublish.promise(command);

      expect(receivedPayloads).toHaveLength(1);
      expect(receivedPayloads[0]).toBe(command);
    });

    it('runs multiple taps in series order', async () => {
      const hooks: RushLifecycleHooks = new RushLifecycleHooks();
      const callOrder: string[] = [];

      hooks.beforePublish.tapPromise('first', async () => {
        callOrder.push('first');
      });
      hooks.beforePublish.tapPromise('second', async () => {
        callOrder.push('second');
      });

      await hooks.beforePublish.promise({ actionName: 'publish', dryRun: false });

      expect(callOrder).toEqual(['first', 'second']);
    });

    it('passes dryRun flag correctly', async () => {
      const hooks: RushLifecycleHooks = new RushLifecycleHooks();
      let receivedDryRun: boolean | undefined;

      hooks.beforePublish.tapPromise('test', async (command: IPublishCommand) => {
        receivedDryRun = command.dryRun;
      });

      await hooks.beforePublish.promise({ actionName: 'publish', dryRun: true });

      expect(receivedDryRun).toBe(true);
    });
  });

  describe('afterPublish', () => {
    it('fires with the publish command payload', async () => {
      const hooks: RushLifecycleHooks = new RushLifecycleHooks();
      const receivedPayloads: IPublishCommand[] = [];

      hooks.afterPublish.tapPromise('test', async (command: IPublishCommand) => {
        receivedPayloads.push(command);
      });

      const command: IPublishCommand = { actionName: 'publish', dryRun: false };
      await hooks.afterPublish.promise(command);

      expect(receivedPayloads).toHaveLength(1);
      expect(receivedPayloads[0]).toBe(command);
    });

    it('runs multiple taps in series order', async () => {
      const hooks: RushLifecycleHooks = new RushLifecycleHooks();
      const callOrder: string[] = [];

      hooks.afterPublish.tapPromise('first', async () => {
        callOrder.push('first');
      });
      hooks.afterPublish.tapPromise('second', async () => {
        callOrder.push('second');
      });

      await hooks.afterPublish.promise({ actionName: 'publish', dryRun: false });

      expect(callOrder).toEqual(['first', 'second']);
    });
  });

  describe('hook ordering', () => {
    it('beforePublish and afterPublish fire independently', async () => {
      const hooks: RushLifecycleHooks = new RushLifecycleHooks();
      const callOrder: string[] = [];

      hooks.beforePublish.tapPromise('test', async () => {
        callOrder.push('before');
      });
      hooks.afterPublish.tapPromise('test', async () => {
        callOrder.push('after');
      });

      const command: IPublishCommand = { actionName: 'publish', dryRun: false };
      await hooks.beforePublish.promise(command);
      // Simulate publishing happening here
      await hooks.afterPublish.promise(command);

      expect(callOrder).toEqual(['before', 'after']);
    });

    it('isUsed() returns false when no taps registered', () => {
      const hooks: RushLifecycleHooks = new RushLifecycleHooks();

      expect(hooks.beforePublish.isUsed()).toBe(false);
      expect(hooks.afterPublish.isUsed()).toBe(false);
    });

    it('isUsed() returns true after tap', () => {
      const hooks: RushLifecycleHooks = new RushLifecycleHooks();

      hooks.beforePublish.tapPromise('test', async () => {});

      expect(hooks.beforePublish.isUsed()).toBe(true);
      expect(hooks.afterPublish.isUsed()).toBe(false);
    });
  });
});
