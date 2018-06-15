// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DocElementParser } from '../DocElementParser';

function makeSnapshot(s: string): void {
  expect(DocElementParser.parseMarkdownishText(s)).toMatchSnapshot();
}

test('DocElementParser.parseMarkdownishText', () => {
  makeSnapshot('not an escape:  C:\\Dog\\Cat');
  makeSnapshot('escaped symbols: \\$\\^');
  makeSnapshot('escaped backslashes: \\\\ \\\\\\ end');
  makeSnapshot('escaped HTML: \\<td>');
  makeSnapshot('real HTML: <td> </td> <a href="#" /a>');
});
