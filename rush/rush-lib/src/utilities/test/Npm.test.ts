/// <reference types='mocha' />

import { assert } from 'chai';
import Npm from '../Npm';
import * as process from 'process';

describe('npm', () => {
  it('publishedVersions gets versions', () => {
    const versions: string[] = Npm.publishedVersions('@microsoft/rush-lib',
      __dirname,
      process.env);
    assert.isTrue(versions.indexOf('1.4.0') >= 0,
      'Version 1.4.0 of @microsoft/rush-lib should be found');
  });
});