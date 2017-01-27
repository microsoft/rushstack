/// <reference types="mocha" />

import { IDocItem } from '../IDocItem';
import DocItemLoader from '../DocItemLoader';
import TestFileComparer from '../TestFileComparer';
import { IApiDefinitionReference } from '../IApiDefinitionReference';
import JsonFile from '../JsonFile';
/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

describe('DocItemLoader tests', function (): void {
  this.timeout(10000);

  describe('Basic Tests', (): void => {
    it('Should locate external scoped package api item', (): void => {
      const apiDefRef: IApiDefinitionReference = {
        scopeName: '@microsoft',
        packageName: 'sp-core-library',
        exportName: 'DisplayMode',
        memberName: ''
      };
      const docItemLoader: DocItemLoader = new DocItemLoader('./testInputs/example2');
      /* ts-lint:diasble:no-unused-variable */
      const apiDocItem: IDocItem = docItemLoader.getItem(apiDefRef);

      JsonFile.saveJsonFile('./lib/inheritedDoc-output.json', JSON.stringify(apiDocItem));
      TestFileComparer.assertFileMatchesExpected(
        './lib/inheritedDoc-output.json',
        './testInputs/inheritedDoc-output.json'
      );
    });
  });
});