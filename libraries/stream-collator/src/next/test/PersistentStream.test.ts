/// <reference types="mocha" />

import { assert } from 'chai';
import PersistentStream from '../PersistentStream';

describe('PersistentStream', () => {
  it('passes through unmodified values', (done: () => void) => {
    const stream: PersistentStream = new PersistentStream();
    const text: string = 'Hello, world!';

    stream.on('data', (data: string | Buffer) => {
      assert.equal(data.toString(), text);
      done();
    });

    stream.write(text);
  });

  it('stores everything in the buffer', (done: () => void) => {
    const stream: PersistentStream = new PersistentStream();

    stream.write('1');
    stream.write('2');
    assert.equal(stream.readAll(), '12');

    stream.end();

    assert.equal(stream.readAll(), '12');

    done();
  });
});
