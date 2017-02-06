/// <reference types="mocha" />

import { assert } from 'chai';
import { IDocItem, IDocProperty, IDocMember } from '../IDocItem';
/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

describe('IDocItem tests', function (): void {
  this.timeout(10000);
  // tslint:disable-next-line:no-any
  const hasOwnPropFunc: any = Object.prototype.hasOwnProperty;

  describe('Basic Tests', (): void => {
    beforeEach(() => {
      // tslint:disable-next-line:no-any
      (Object as any).prototype.hasOwnProperty = () => { return 123; };
    });

    it('Should break on altered Object.prototype', (): void => {
      const docProperty: IDocMember = {
        kind: 'IDocProperty',
        isBeta: false,
        summary: [],
        isOptional: true,
        isReadOnly: true,
        isStatic: true,
        type: 'string'
      };

      const members: {[name: string]: IDocMember} = {'param1': docProperty};
      // tslint:disable-next-line:no-any
      assert.equal((Object as any).prototype.hasOwnProperty('param1'), 123);
    });

    afterEach(() => {
      // tslint:disable-next-line:no-any
      (Object as any).prototype.hasOwnProperty = hasOwnPropFunc;
   });
  });
});
