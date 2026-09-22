// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { GraphRequestContext } from '../GraphRequestContext';

describe(GraphRequestContext.name, () => {
  it('preserves one deadline rather than resetting it for a second request', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const context = new GraphRequestContext({ waitTimeoutMs: 100 });
    try {
      now.mockReturnValue(1060);
      expect(context.admission).toEqual({ waitTimeoutMs: 40 });
      now.mockReturnValue(1100);
      expect(() => context.admission).toThrow('deadline expired');
    } finally {
      context[Symbol.dispose]();
      now.mockRestore();
    }
  });

  it.each([{ noWait: true }, { waitTimeoutMs: 0 }])('preserves immediate admission %j', (admission) => {
    const context = new GraphRequestContext(admission);
    try {
      expect(context.admission).toEqual(admission);
    } finally {
      context[Symbol.dispose]();
    }
  });

  it('releases both signal handlers on disposal', () => {
    const before = ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal));
    const context = new GraphRequestContext({ waitTimeoutMs: 100 });
    context[Symbol.dispose]();
    expect(['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal))).toEqual(before);
  });
});
