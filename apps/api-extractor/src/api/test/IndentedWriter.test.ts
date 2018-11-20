// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IndentedWriter } from '../IndentedWriter';

test('01 Demo from docs', () => {
  const indentedWriter: IndentedWriter = new IndentedWriter();
  indentedWriter.write('begin\n');
  indentedWriter.increaseIndent();
  indentedWriter.write('one\ntwo\n');
  indentedWriter.decreaseIndent();
  indentedWriter.increaseIndent();
  indentedWriter.decreaseIndent();
  indentedWriter.write('end');

  expect(indentedWriter.toString()).toMatchSnapshot();
});

test('02 Indent something', () => {
  const indentedWriter: IndentedWriter = new IndentedWriter();
  indentedWriter.write('a');
  indentedWriter.write('b');
  indentedWriter.increaseIndent();
    indentedWriter.writeLine('c');
    indentedWriter.writeLine('d');
  indentedWriter.decreaseIndent();
  indentedWriter.writeLine('e');

  expect(indentedWriter.toString()).toMatchSnapshot();
});
