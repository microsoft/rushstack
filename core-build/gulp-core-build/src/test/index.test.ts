// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { serial, parallel, getConfig, setConfig, IExecutable, IBuildConfig } from '../index';
import { mockBuildConfig } from './mockBuildConfig';

// disable the exit watching
global['dontWatchExit'] = true; // eslint-disable-line dot-notation

describe('serial', () => {
  it('can run a set of tasks in serial', (done) => {
    const execution: string[] = [];
    const tasks: IExecutable[] = createTasks('task', 3, (command) => execution.push(command));

    serial(tasks)
      .execute(mockBuildConfig)
      .then(() => {
        expect(execution).toEqual([
          'executing task 0',
          'complete task 0',
          'executing task 1',
          'complete task 1',
          'executing task 2',
          'complete task 2',
        ]);
        done();
      })
      .catch((error) => done(error));
  });
});

describe('parallel', () => {
  it('can run a set of tasks in parallel', (done) => {
    const execution: string[] = [];
    const tasks: IExecutable[] = createTasks('task', 3, (command) => execution.push(command));

    parallel(tasks)
      .execute(mockBuildConfig)
      .then(() => {
        expect(execution).toEqual([
          'executing task 0',
          'executing task 1',
          'executing task 2',
          'complete task 0',
          'complete task 1',
          'complete task 2',
        ]);
        done();
      })
      .catch((error) => done(error));
  });

  it('can mix in serial sets of tasks', (done) => {
    const execution: string[] = [];
    const serial1Tasks: IExecutable = serial(
      createTasks('serial set 1 -', 2, (command) => execution.push(command))
    );
    const parallelTasks: IExecutable = parallel(
      createTasks('parallel', 2, (command) => execution.push(command))
    );
    const serial2Tasks: IExecutable = serial(
      createTasks('serial set 2 -', 2, (command) => execution.push(command))
    );

    serial([serial1Tasks, parallelTasks, serial2Tasks])
      .execute(mockBuildConfig)
      .then(() => {
        expect(execution).toEqual([
          'executing serial set 1 - 0',
          'complete serial set 1 - 0',
          'executing serial set 1 - 1',
          'complete serial set 1 - 1',
          'executing parallel 0',
          'executing parallel 1',
          'complete parallel 0',
          'complete parallel 1',
          'executing serial set 2 - 0',
          'complete serial set 2 - 0',
          'executing serial set 2 - 1',
          'complete serial set 2 - 1',
        ]);
        done();
      })
      .catch((error) => done(error));
  });

  it('stops running serial tasks on failure', (done) => {
    const execution: string[] = [];
    const tasks: IExecutable[] = createTasks('task', 1, (command) => execution.push(command));

    tasks.push(createTask('fail task', (command) => execution.push(command), true));
    tasks.push(createTask('should not run task', (command) => execution.push(command), false));

    serial(tasks)
      .execute(mockBuildConfig)
      .then(() => {
        done('The task returned success unexpectedly.');
      })
      .catch((error) => {
        expect(error).toEqual('Failure'); //, 'Make sure the proper error is propagate');
        expect(execution).toEqual([
          'executing task 0',
          'complete task 0',
          'executing fail task',
          'complete fail task',
        ]);
        done();
      });
  });

  it('can read the current config', (done) => {
    const config: IBuildConfig = getConfig();
    // eslint-disable-next-line
    expect(config).not.toBeNull();
    done();
  });

  it('can set the config', (done) => {
    const distFolder: string = 'testFolder';
    const newConfig: Partial<IBuildConfig> = {
      distFolder: distFolder,
    };

    setConfig(newConfig);
    expect(getConfig().distFolder).toEqual(distFolder);
    done();
  });
});

function createTasks(
  name: string,
  count: number,
  executionCallback: (message: string) => void
): IExecutable[] {
  return Array.apply(undefined, Array(count)).map((item, index) =>
    createTask(name + ' ' + index, executionCallback)
  );
}

function createTask(
  name: string,
  executionCallback: (message: string) => void,
  shouldFail?: boolean
): IExecutable {
  return {
    execute: (buildConfig): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        executionCallback(`executing ${name}`);

        setTimeout(() => {
          executionCallback(`complete ${name}`);

          if (shouldFail) {
            reject('Failure');
          } else {
            resolve();
          }
        }, 10);
      }),
  };
}
