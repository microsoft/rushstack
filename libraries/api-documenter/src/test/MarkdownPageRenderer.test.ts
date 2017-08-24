// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import { assert } from 'chai';
import * as path from 'path';
import * as fsx from 'fs-extra';
import { DiffTest } from '@microsoft/node-core-library';

import { MarkdownPageRenderer } from '../MarkdownPageRenderer';
import { IDomPage } from '../SimpleDom';
import { Domifier } from '../Domifier';

describe('MarkdownPageRenderer', () => {
  it('renders markdown', (done: MochaDone) => {

    const diffTest: DiffTest = new DiffTest();

    const outputFolder = diffTest.getFolderPath(__dirname, 'MarkdownPageRenderer');

    const renderer: MarkdownPageRenderer = new MarkdownPageRenderer(outputFolder);
    const domPage: IDomPage = Domifier.createPage('Test page', 'test-id');
    const outputFilename = renderer.writePage(domPage);

    diffTest.assertFileMatchesExpected(outputFilename, path.join(__dirname, 'ExpectedOutput.md'));

    done();
  });
});
