/// <reference path="../../typings/tsd.d.ts" />

import * as chai from 'chai';
import * as colors from 'colors';

import DualTaskStream from '../DualTaskStream';

const assert: Chai.AssertStatic = chai.assert;

const helloWorld: string = 'Hello, world!';

describe('DualTaskStream', () => {
  it('passes stdout values through unmodified', (done: () => void) => {
    const stream: DualTaskStream = new DualTaskStream();

    stream.on('data', (data: string | Buffer) => {
      assert.equal(data.toString(), helloWorld);
      done();
    });

    stream.stdout.write(helloWorld);
  });

  it('writes stderr values in red', (done: () => void) => {
    const stream: DualTaskStream = new DualTaskStream();

    stream.on('data', (data: string | Buffer) => {
      assert.equal(data.toString(), colors.red(helloWorld));
      done();
    });

    stream.stderr.write(helloWorld);
  });

  it('writes warnings written to stderr in yellow to stdout', (done: () => void) => {
    const stream: DualTaskStream = new DualTaskStream();
    var helloWorld = 'Warning - ' + helloWorld; /* tslint:disable-line */

    stream.on('data', (data: string | Buffer) => {
      assert.equal(data.toString(), colors.yellow(helloWorld));
      assert.equal(stream.stdout.readAll(), colors.yellow(helloWorld));
      done();
    });

    stream.stderr.write(helloWorld);
  });

  it('doesn\'t write data in quiet mode', (done: () => void) => {
    const stream: DualTaskStream = new DualTaskStream(true);

    stream.stdout.write(helloWorld);

    stream.stdout.end();
    assert.isNull(stream.read());

    done();
  });

  it('doesn\'t write warnings from stderr in quiet mode', (done: () => void) => {
    const stream: DualTaskStream = new DualTaskStream(true);
    var helloWorld = 'Warning - ' + helloWorld; /* tslint:disable-line */

    stream.stderr.write(helloWorld);

    stream.stderr.end();
    assert.isNull(stream.read());

    done();
  });

  it('end() closes both substreams', (done: () => void) => {
    const stream: DualTaskStream = new DualTaskStream(true);

    let stderrClosed: boolean, stdoutClosed: boolean = false;

    const finishedIfBothStreamsClosed: () => void = () => {
      if (stderrClosed && stdoutClosed) {
        done();
      }
    };

    stream.stderr.on('end', () => {
      stderrClosed = true;
      finishedIfBothStreamsClosed();
    });

    stream.stdout.on('end', () => {
      stdoutClosed = true;
      finishedIfBothStreamsClosed();
    });

    stream.end();
  });
});
