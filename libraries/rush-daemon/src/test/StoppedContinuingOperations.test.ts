// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonRequestDispatchError } from '../DaemonRequestDispatcher';
import {
  addStoppedContinuingOperations,
  formatStoppedContinuingOperations
} from '../StoppedContinuingOperations';

describe(formatStoppedContinuingOperations.name, () => {
  it('names one operation in the singular', () => {
    expect(formatStoppedContinuingOperations({ count: 1, names: ['c (compile)'] })).toBe(
      'rushd stopped 1 operation left running by an earlier failed command (c (compile)), so that this command ' +
        'can run in-process.'
    );
  });

  it('names the operations in the given order, and counts the ones that it does not name', () => {
    expect(formatStoppedContinuingOperations({ count: 2, names: ['S1', 'S2'] })).toBe(
      'rushd stopped 2 operations left running by an earlier failed command (S1, S2), so that this command can ' +
        'run in-process.'
    );
    expect(formatStoppedContinuingOperations({ count: 5, names: ['S1', 'S10', 'S2'] })).toBe(
      'rushd stopped 5 operations left running by an earlier failed command (S1, S10, S2 +2 more), so that this ' +
        'command can run in-process.'
    );
  });

  it('leaves the names out if there are none', () => {
    expect(formatStoppedContinuingOperations({ count: 2, names: [] })).toBe(
      'rushd stopped 2 operations left running by an earlier failed command, so that this command can run ' +
        'in-process.'
    );
  });
});

describe(addStoppedContinuingOperations.name, () => {
  const stopped: string = formatStoppedContinuingOperations({ count: 1, names: ['c (compile)'] });

  it('adds the line after the first line of the rejection, which the client prints as its fallback line', () => {
    const rejection: DaemonRequestDispatchError = new DaemonRequestDispatchError(
      'unsupported',
      'The command is not phased.\nwarning: first\nwarning: second'
    );
    const added: DaemonRequestDispatchError = addStoppedContinuingOperations(rejection, {
      count: 1,
      names: ['c (compile)']
    });
    expect(added.message).toBe(`The command is not phased.\n${stopped}\nwarning: first\nwarning: second`);
    expect(added.code).toBe('unsupported');
    expect(added.cause).toBe(rejection);
    expect(rejection.message).toBe('The command is not phased.\nwarning: first\nwarning: second');
  });

  it('adds the line after the first line that is not blank', () => {
    const rejection: DaemonRequestDispatchError = new DaemonRequestDispatchError(
      'unsupported',
      '\n  \nThe command is not phased.'
    );
    expect(addStoppedContinuingOperations(rejection, { count: 1, names: ['c (compile)'] }).message).toBe(
      `\n  \nThe command is not phased.\n${stopped}`
    );
  });
});
