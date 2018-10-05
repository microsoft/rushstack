// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileDiffTest, FileSystem } from '@microsoft/node-core-library';
import { IMarkupPage, Markup } from '@microsoft/api-extractor';

import { MarkdownRenderer } from '../MarkdownRenderer';

describe('MarkdownPageRenderer', () => {
  it('renders markdown', done => {

    const outputFolder: string = FileDiffTest.prepareFolder(__dirname, 'MarkdownPageRenderer');

    const markupPage: IMarkupPage = Markup.createPage('Test page');

    markupPage.elements.push(Markup.createHeading1('Simple bold test'));
    markupPage.elements.push(...Markup.createTextElements('This is a '));
    markupPage.elements.push(...Markup.createTextElements('bold', { bold: true }));
    markupPage.elements.push(...Markup.createTextElements(' word.'));

    markupPage.elements.push(Markup.createHeading1('All whitespace bold'));
    markupPage.elements.push(...Markup.createTextElements('  ', { bold: true }));

    markupPage.elements.push(Markup.createHeading1('Newline bold'));
    markupPage.elements.push(...Markup.createTextElements('line 1\nline 2', { bold: true }));

    markupPage.elements.push(Markup.createHeading1('Newline bold with spaces'));
    markupPage.elements.push(...Markup.createTextElements('  line 1  \n  line 2  \n  line 3  ', { bold: true }));

    markupPage.elements.push(Markup.createHeading1('Adjacent bold regions'));
    markupPage.elements.push(...Markup.createTextElements('one', { bold: true }));
    markupPage.elements.push(...Markup.createTextElements('two', { bold: true }));
    markupPage.elements.push(...Markup.createTextElements(' three', { bold: true }));
    markupPage.elements.push(...Markup.createTextElements('', { bold: false }));
    markupPage.elements.push(...Markup.createTextElements('four', { bold: true }));
    markupPage.elements.push(...Markup.createTextElements('non-bold', { bold: false }));
    markupPage.elements.push(...Markup.createTextElements('five', { bold: true }));

    markupPage.elements.push(Markup.createHeading1('Adjacent to other characters'));
    // Creates a "[" before the bold text
    markupPage.elements.push(Markup.createWebLinkFromText('a link', './index.md'));
    markupPage.elements.push(...Markup.createTextElements('bold', { bold: true }));
    markupPage.elements.push(...Markup.createTextElements('non-bold', { bold: false }));
    markupPage.elements.push(...Markup.createTextElements('more-non-bold', { bold: false }));

    markupPage.elements.push(Markup.createHeading1('Bad characters'));
    markupPage.elements.push(...Markup.createTextElements('*one*two*', { bold: true }));
    markupPage.elements.push(...Markup.createTextElements('three*four', { bold: true }));

    markupPage.elements.push(Markup.createHeading1('Characters that should be escaped'));
    markupPage.elements.push(...Markup.createTextParagraphs(
      'Double-encoded JSON: "{ \\"A\\": 123}"\n\n'));
    markupPage.elements.push(...Markup.createTextParagraphs(
      'HTML chars: <script>alert("[You] are #1!");</script>\n\n'));
    markupPage.elements.push(...Markup.createTextParagraphs(
      'HTML escape: &quot;\n\n'));
    markupPage.elements.push(...Markup.createTextParagraphs(
      '3 or more hyphens: - -- --- ---- ----- ------\n\n'));

    markupPage.elements.push(...[
      Markup.createHtmlTag('<b>'),
      ...Markup.createTextElements('bold'),
      Markup.createHtmlTag('</b>')
    ]);

    const outputFilename: string = path.join(outputFolder, 'ActualOutput.md');
    FileSystem.writeFile(outputFilename, MarkdownRenderer.renderElements([markupPage], { }));

    FileDiffTest.assertEqual(outputFilename, path.join(__dirname, 'ExpectedOutput.md'));

    done();
  });
});
