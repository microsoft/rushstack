// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CobuildConfiguration } from '../../../api/CobuildConfiguration';
import { ProjectBuildCache } from '../../buildCache/ProjectBuildCache';
import { CobuildLock } from '../CobuildLock';

describe(CobuildLock.name, () => {
  function prepareSubject(): CobuildLock {
    const subject: CobuildLock = new CobuildLock({
      cobuildConfiguration: {
        contextId: 'foo'
      } as unknown as CobuildConfiguration,
      projectBuildCache: {
        cacheId: 'bar'
      } as unknown as ProjectBuildCache
    });
    return subject;
  }
  it('returns cobuild context', () => {
    const subject: CobuildLock = prepareSubject();
    expect(subject.cobuildContext).toEqual({
      contextId: 'foo',
      cacheId: 'bar',
      version: 1
    });
  });
});
