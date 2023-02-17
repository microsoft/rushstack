// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CobuildContextId } from '../CobuildContextId';

describe(CobuildContextId.name, () => {
  describe('Valid pattern names', () => {
    it('expands a environment variable', () => {
      const contextId: string = CobuildContextId.parsePattern('context-${MR_ID}-${AUTHOR_NAME}')({
        environment: {
          MR_ID: '123',
          AUTHOR_NAME: 'Mr.example'
        }
      });
      expect(contextId).toEqual('context-123-Mr.example');
    });
  });

  describe('Invalid pattern names', () => {
    it('throws an error if a environment variable is missing', () => {
      expect(() =>
        CobuildContextId.parsePattern('context-${MR_ID}-${AUTHOR_NAME}')({
          environment: {
            MR_ID: '123'
          }
        })
      ).toThrowErrorMatchingSnapshot();
    });
    it('throws an error if multiple environment variables are missing', () => {
      expect(() =>
        CobuildContextId.parsePattern('context-${MR_ID}-${AUTHOR_NAME}')({
          environment: {}
        })
      ).toThrowErrorMatchingSnapshot();
    });
  });
});
