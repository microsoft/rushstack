/// <reference types='mocha' />

import { assert } from 'chai';
import Npm from '../Npm';
import * as process from 'process';
import Utilities from '../Utilities';
import * as sinon from 'sinon';

describe('npm', () => {
  const packageName: string = '@microsoft/rush-lib-never';
  let stub: sinon.SinonStub;

  beforeEach(() => {
    stub = sinon.stub(Utilities, 'executeCommandAndCaptureOutput');
  });

  afterEach(() => {
    stub.restore();
  });

  it('publishedVersions gets versions when package time is available.', () => {
    const json: string = `{
      "modified": "2017-03-30T18:37:27.757Z",
      "created": "2017-01-03T20:28:10.342Z",
      "0.0.0": "2017-01-03T20:28:10.342Z",
      "1.4.0": "2017-01-03T21:55:21.249Z",
      "1.4.1": "2017-01-09T19:22:00.488Z",
      "2.4.0-alpha.1": "2017-03-30T18:37:27.757Z"
    }`;
    stub.withArgs('npm', `view ${packageName} time --json`.split(' '), sinon.match.any, sinon.match.any)
      .returns(json);
    const versions: string[] = Npm.publishedVersions(packageName,
      __dirname,
      process.env);
    assert.equal(versions.length, 4,
      'Four versions of @microsoft/rush-lib-never should be found');
    assert.includeMembers(versions, ['0.0.0', '1.4.0', '1.4.1', '2.4.0-alpha.1'], 'All versions match');
  });

  it('publishedVersions gets versions when package time is not available', () => {
    const json: string = `[
      "0.0.0",
      "1.4.0",
      "1.4.1",
      "2.4.0-alpha.1"
    ]`;
    stub.withArgs('npm', `view ${packageName} time --json`.split(' '), sinon.match.any, sinon.match.any)
      .returns('');
    stub.withArgs('npm', `view ${packageName} versions --json`.split(' '), sinon.match.any, sinon.match.any)
      .returns(json);
    const versions: string[] = Npm.publishedVersions(packageName,
      __dirname,
      process.env);
    assert.equal(versions.length, 4,
      'Four versions of @microsoft/rush-lib-never should be found');
    assert.includeMembers(versions, ['0.0.0', '1.4.0', '1.4.1', '2.4.0-alpha.1'], 'All versions match');
  });
});