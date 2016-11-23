/// <reference types="mocha" />

import { assert } from 'chai';
import StreamCollator from '../StreamCollator';
import PersistentStream from '../PersistentStream';

let collator: StreamCollator<NodeJS.ReadableStream>;
let stdout: PersistentStream, taskA: PersistentStream, taskB: PersistentStream;

describe('StreamCollator tests', () => {
  beforeEach(() => {
    collator = new StreamCollator();
    stdout = new PersistentStream();
    taskA = new PersistentStream();
    taskB = new PersistentStream();

    taskA.on('data', () => { /* no-op */ });
    taskB.on('data', () => { /* no-op */ });

    collator.pipe(stdout);

    collator.register(taskA);
    collator.register(taskB);
  });

  it('should write text to stdout', (done: MochaDone) => {
    const text: string = 'Hello World';

    testWrite(taskA, text, stdout, 'data', () => {
      assert.equal(stdout.readAll(), text);
      done();
    });
  });

  it('should not write non-active tasks to stdout', (done: MochaDone) => {
    testWrite(taskA, '1', collator, 'data', () => {
      assert.equal(stdout.readAll(), '1');

      taskB.write('2');
      testWrite(taskA, '3', stdout, 'data', () => {
        assert.equal(stdout.readAll(), '13');

        taskA.end();
        assert.equal(stdout.readAll(), '13');

        testEnd(taskB,
          taskB, 'end',
          () => {
            assert.equal(stdout.readAll(), '132');
            assert.equal(taskA.readAll(), '13');
            assert.equal(taskB.readAll(), '2');
            done();
          }
        );
      });
    });
  });

  it('should close automatically when all registered streams close', (done: MochaDone) => {
    testWrite(taskA, '1', stdout, 'data', () => {
      assert.equal(stdout.readAll(), '1');

      taskB.write('2');
      testWrite(taskA, '3', stdout, 'data', () => {
        assert.equal(stdout.readAll(), '13');

        taskA.end();
        assert.equal(stdout.readAll(), '13');

        testEnd(taskB,
          collator, 'end',
          () => {
            assert.equal(stdout.readAll(), '132');
            assert.equal(taskA.readAll(), '13');
            assert.equal(taskB.readAll(), '2');
            done();
          }
        );
      });
    });
  });

  it('should update the active task once the active task is closed', (done: MochaDone) => {
    testWrite(taskA, '1', collator, 'data', () => {
      assert.equal(stdout.readAll(), '1');

      taskA.end();
      assert.equal(stdout.readAll(), '1');

      testWrite(
        taskB, '2',
        stdout, 'data',
        () => {
          assert.equal(stdout.readAll(), '12');

          testEnd(taskB,
            stdout, 'data',
            () => {
              assert.equal(stdout.readAll(), '12');
              assert.equal(taskA.readAll(), '1');
              assert.equal(taskB.readAll(), '2');
              done();
            }
          );
        }
      );
    });
  });

  it('should write completed tasks after the active task is completed', (done: MochaDone) => {
    testWrite(taskA, '1', collator, 'data', () => {
      assert.equal(stdout.readAll(), '1');

      taskB.write('2');
      assert.equal(stdout.readAll(), '1');

      testEnd(taskB,
        taskB, 'end',
        () => {
          assert.equal(stdout.readAll(), '1');

          testEnd(taskA,
            taskA, 'end', () => {
              testActionOnStream(() => { /* no-op */ }, stdout, 'data',
                () => {
                  assert.equal(stdout.readAll(), '12');
                  assert.equal(taskA.readAll(), '1');
                  assert.equal(taskB.readAll(), '2');
                  done();
                }
              );
            }
          );
        }
      );
    });
  });

  function testEnd(stream1: NodeJS.WritableStream, stream2: NodeJS.EventEmitter,
    event: string, cb: () => void): void {
    testActionOnStream(
      () => { stream1.end(); },
      stream2,
      event,
      cb
    );
  }

  function testWrite(stream1: NodeJS.WritableStream, text: string,
    stream2: NodeJS.EventEmitter, event: string, cb: () => void): void {
    testActionOnStream(
      () => { stream1.write(text); },
      stream2,
      event,
      cb
    );
  }

  function testActionOnStream(action: () => void,
    stream: NodeJS.EventEmitter, event: string, cb: () => void): void {
    const wrapper: () => void = () => {
      stream.removeListener(event, wrapper);
      cb();
    };
    stream.on(event, wrapper);
    action();
  }

});
