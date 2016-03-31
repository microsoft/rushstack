'use strict';
/// <reference path='../../typings/main.d.ts' />

import 'es6-promise';
import { expect } from 'chai';
import { serial, parallel } from '../index';

// disable the exit watching
global.dontWatchExit = true;

describe('serial', () => {
  it('can run a set of tasks in serial', (done) => {
    let execution = [];
    let tasks = createTasks('task', 3, command => execution.push(command));

    serial(tasks).execute({}).then(() => {
      expect(execution).to.deep.equal([
        'executing task 0',
        'complete task 0',
        'executing task 1',
        'complete task 1',
        'executing task 2',
        'complete task 2'
      ]);
      done();
    }).catch(error => done(error));
  });

});

describe('parallel', () => {
  it('can run a set of tasks in parallel', (done) => {
    let execution = [];
    let tasks = createTasks('task', 3, command => execution.push(command));

    parallel(tasks).execute({}).then(() => {
      expect(execution).to.deep.equal([
        'executing task 0',
        'executing task 1',
        'executing task 2',
        'complete task 0',
        'complete task 1',
        'complete task 2'
      ]);
      done();
    }).catch(error => done(error));
  });

  it('can mix in serial sets of tasks', (done) => {
    let execution = [];
    let serial1Tasks = serial(createTasks('serial set 1 -', 2, command => execution.push(command)));
    let parallelTasks = parallel(createTasks('parallel', 2, command => execution.push(command)));
    let serial2Tasks = serial(createTasks('serial set 2 -', 2, command => execution.push(command)));

    serial([
      serial1Tasks,
      parallelTasks,
      serial2Tasks
    ]).execute({})
      .then(() => {
        expect(execution).to.deep.equal([
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
          'complete serial set 2 - 1'
        ]);
        done();
      })
      .catch(error => done(error));
  });

  it('stops running serial tasks on failure', (done) => {
    let execution = [];
    let tasks = createTasks('task', 1, command => execution.push(command));

    tasks.push(createTask('fail task', command => execution.push(command), true));
    tasks.push(createTask('should not run task', command => execution.push(command), false));

    serial(tasks).execute({}).then(
      () => {
        done('The task returned success unexpectedly.');
      }).catch((error) => {
        expect(error).to.equal('Failure', 'Make sure the proper error is propagate');
        expect(execution).to.deep.equal([
          'executing task 0',
          'complete task 0',
          'executing fail task',
          'complete fail task'
        ]);
        done();
      });

  });

});

function createTasks(
  name: string,
  count: number,
  executionCallback: (message: string) => void) {
  return Array.apply(null, Array(count))
    .map((item, index) => createTask(name + ' ' + index, executionCallback));
}

function createTask(
  name: string,
  executionCallback: (message: string) => void,
  shouldFail?: boolean) {
  return {
    execute: (buildConfig) => new Promise((done, error) => {
      executionCallback(`executing ${name}`);

      setTimeout(() => {
        executionCallback(`complete ${name}`);

        if (shouldFail) {
          error('Failure');
        } else {
          done();
        }
      }, 10);
    })
  };
}
