// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IDisposable, Utilities } from '../Utilities';

describe(Utilities.name, () => {
  describe(Utilities.usingAsync.name, () => {
    let disposed: boolean;

    beforeEach(() => {
      disposed = false;
    });

    class Disposable implements IDisposable {
      public dispose(): void {
        disposed = true;
      }
    }

    it('Disposes correctly in a simple case', async () => {
      await Utilities.usingAsync(
        () => new Disposable(),
        () => {
          /* no-op */
        }
      );

      expect(disposed).toEqual(true);
    });

    it('Disposes correctly after the operation throws an exception', async () => {
      await expect(
        async () =>
          await Utilities.usingAsync(
            () => new Disposable(),
            () => {
              throw new Error('operation threw');
            }
          )
      ).rejects.toMatchSnapshot();

      expect(disposed).toEqual(true);
    });

    it('Does not dispose if the construction throws an exception', async () => {
      await expect(
        async () =>
          await Utilities.usingAsync(
            async () => {
              throw new Error('constructor threw');
            },
            () => {
              /* no-op */
            }
          )
      ).rejects.toMatchSnapshot();

      expect(disposed).toEqual(false);
    });
  });
});
