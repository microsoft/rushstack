// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

// import { assert } from 'chai';
import * as path from 'path';
import { FileDiffTest } from '@microsoft/node-core-library';
import { IMarkupPage } from '@microsoft/api-extractor';

import { MarkdownPageRenderer } from '../MarkdownPageRenderer';
import { MarkupBuilder } from '../MarkupBuilder';

describe('MarkdownPageRenderer', () => {
  it('renders markdown', (done: MochaDone) => {

    const outputFolder: string = FileDiffTest.prepareFolder(__dirname, 'MarkdownPageRenderer');

    const renderer: MarkdownPageRenderer = new MarkdownPageRenderer(outputFolder);
    const domPage: IMarkupPage = MarkupBuilder.createPage('Test page', 'test-id');

    domPage.elements.push(MarkupBuilder.createHeading1('Simple bold test'));
    domPage.elements.push(...MarkupBuilder.createTextElements('This is a '));
    domPage.elements.push(...MarkupBuilder.createTextElements('bold', { bold: true }));
    domPage.elements.push(...MarkupBuilder.createTextElements(' word.'));

    domPage.elements.push(MarkupBuilder.createHeading1('All whitespace bold'));
    domPage.elements.push(...MarkupBuilder.createTextElements('  ', { bold: true }));

    domPage.elements.push(MarkupBuilder.createHeading1('Newline bold'));
    domPage.elements.push(...MarkupBuilder.createTextElements('line 1\nline 2', { bold: true }));

    domPage.elements.push(MarkupBuilder.createHeading1('Newline bold with spaces'));
    domPage.elements.push(...MarkupBuilder.createTextElements('  line 1  \n  line 2  \n  line 3  ', { bold: true }));

    domPage.elements.push(MarkupBuilder.createHeading1('Adjacent bold regions'));
    domPage.elements.push(...MarkupBuilder.createTextElements('one', { bold: true }));
    domPage.elements.push(...MarkupBuilder.createTextElements('two', { bold: true }));
    domPage.elements.push(...MarkupBuilder.createTextElements(' three', { bold: true }));
    domPage.elements.push(...MarkupBuilder.createTextElements('', { bold: false }));
    domPage.elements.push(...MarkupBuilder.createTextElements('four', { bold: true }));
    domPage.elements.push(...MarkupBuilder.createTextElements('non-bold', { bold: false }));
    domPage.elements.push(...MarkupBuilder.createTextElements('five', { bold: true }));

    domPage.elements.push(MarkupBuilder.createHeading1('Adjacent to other characters'));
    // Creates a "[" before the bold text
    domPage.elements.push(MarkupBuilder.createDocumentationLinkFromText('a link', 'index'));
    domPage.elements.push(...MarkupBuilder.createTextElements('bold', { bold: true }));
    domPage.elements.push(...MarkupBuilder.createTextElements('non-bold', { bold: false }));
    domPage.elements.push(...MarkupBuilder.createTextElements('more-non-bold', { bold: false }));

    domPage.elements.push(MarkupBuilder.createHeading1('Bad characters'));
    domPage.elements.push(...MarkupBuilder.createTextElements('*one*two*', { bold: true }));
    domPage.elements.push(...MarkupBuilder.createTextElements('three*four', { bold: true }));

    const outputFilename: string = renderer.writePage(domPage);

    FileDiffTest.assertEqual(outputFilename, path.join(__dirname, 'ExpectedOutput.md'));

    done();
  });
});
