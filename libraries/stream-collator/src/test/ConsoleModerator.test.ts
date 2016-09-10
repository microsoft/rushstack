import * as chai from 'chai';
// import * as stream from 'stream';

import ConsoleModerator from '../ConsoleModerator';
import PersistentStream from '../PersistentStream';

const assert: Chai.AssertStatic = chai.assert;

let moderator: ConsoleModerator<NodeJS.ReadableStream>;
let stdout: PersistentStream, taskA: PersistentStream, taskB: PersistentStream;

describe('ConsoleModerator tests', () => {
  beforeEach(() => {
    moderator = new ConsoleModerator();
    stdout = new PersistentStream();
    taskA = new PersistentStream();
    taskB = new PersistentStream();

    taskA.on('data', () => { /* no-op */ });
    taskB.on('data', () => { /* no-op */ });

    moderator.setStdOut(stdout);

    moderator.registerTask('A', taskA);
    moderator.registerTask('B', taskB);
  });

  it('should write text to stdout', (done: MochaDone) => {
    const text: string = 'Hello World';

    taskA.write(text);

    assert.equal(stdout.readAll(), text);

    stdout.end();

    assert.equal(stdout.read(), text);
    done();
  });

  describe('Testing that output is interleaved', () => {
    it('should not write non-active tasks to stdout', (done: MochaDone) => {
      taskA.write('1');
      assert.equal(stdout.readAll(), '1');

      taskB.write('2');
      assert.equal(stdout.readAll(), '1');

      taskA.write('3');
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

  it('should update the active task once the active task is closed', (done: MochaDone) => {
    taskA.write('1');
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

  it('should write completed tasks after the active task is completed', (done: MochaDone) => {
    taskA.write('1');
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

  function testEnd(stream1: NodeJS.ReadWriteStream, stream2: NodeJS.ReadWriteStream,
    event: string, cb: () => void): void {
    testActionOnStream(
      () => { stream1.end(); },
      stream2,
      event,
      cb
    );
  }

  function testWrite(stream1: NodeJS.ReadWriteStream, text: string,
    stream2: NodeJS.ReadWriteStream, event: string, cb: () => void): void {
    testActionOnStream(
      () => { stream1.write(text); },
      stream2,
      event,
      cb
    );
  }

  function testActionOnStream(action: () => void,
    stream: NodeJS.ReadWriteStream, event: string, cb: () => void): void {
    let wrapper: () => void = () => {
      stream.removeListener(event, wrapper);
      cb();
    };
    stream.on(event, wrapper);
    action();
  }

});
