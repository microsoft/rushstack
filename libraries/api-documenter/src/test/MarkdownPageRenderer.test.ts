// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

// import { assert } from 'chai';
import * as path from 'path';
import { FileDiffTest } from '@microsoft/node-core-library';
import { IMarkupPage } from '@microsoft/api-extractor';

import { MarkdownPageRenderer } from '../MarkdownPageRenderer';
import { Domifier } from '../Domifier';

describe('MarkdownPageRenderer', () => {
  it('renders markdown', (done: MochaDone) => {

    const outputFolder: string = FileDiffTest.prepareFolder(__dirname, 'MarkdownPageRenderer');

    const renderer: MarkdownPageRenderer = new MarkdownPageRenderer(outputFolder);
    const domPage: IMarkupPage = Domifier.createPage('Test page', 'test-id');

    domPage.elements.push(Domifier.createHeading1('Simple bold test'));
    domPage.elements.push(...Domifier.createTextElements('This is a '));
    domPage.elements.push(...Domifier.createTextElements('bold', { bold: true }));
    domPage.elements.push(...Domifier.createTextElements(' word.'));

    domPage.elements.push(Domifier.createHeading1('All whitespace bold'));
    domPage.elements.push(...Domifier.createTextElements('  ', { bold: true }));

    domPage.elements.push(Domifier.createHeading1('Newline bold'));
    domPage.elements.push(...Domifier.createTextElements('line 1\nline 2', { bold: true }));

    domPage.elements.push(Domifier.createHeading1('Newline bold with spaces'));
    domPage.elements.push(...Domifier.createTextElements('  line 1  \n  line 2  \n  line 3  ', { bold: true }));

    domPage.elements.push(Domifier.createHeading1('Adjacent bold regions'));
    domPage.elements.push(...Domifier.createTextElements('one', { bold: true }));
    domPage.elements.push(...Domifier.createTextElements('two', { bold: true }));
    domPage.elements.push(...Domifier.createTextElements(' three', { bold: true }));
    domPage.elements.push(...Domifier.createTextElements('', { bold: false }));
    domPage.elements.push(...Domifier.createTextElements('four', { bold: true }));
    domPage.elements.push(...Domifier.createTextElements('non-bold', { bold: false }));
    domPage.elements.push(...Domifier.createTextElements('five', { bold: true }));

    domPage.elements.push(Domifier.createHeading1('Adjacent to other characters'));
    // Creates a "[" before the bold text
    domPage.elements.push(Domifier.createDocumentationLinkFromText('a link', 'index'));
    domPage.elements.push(...Domifier.createTextElements('bold', { bold: true }));
    domPage.elements.push(...Domifier.createTextElements('non-bold', { bold: false }));
    domPage.elements.push(...Domifier.createTextElements('more-non-bold', { bold: false }));

    domPage.elements.push(Domifier.createHeading1('Bad characters'));
    domPage.elements.push(...Domifier.createTextElements('*one*two*', { bold: true }));
    domPage.elements.push(...Domifier.createTextElements('three*four', { bold: true }));

    const outputFilename: string = renderer.writePage(domPage);

    FileDiffTest.assertEqual(outputFilename, path.join(__dirname, 'ExpectedOutput.md'));

    done();
  });
});
