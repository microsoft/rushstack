let loaderUtils = require('loader-utils');

export class SetWebpackPublicPathLoader {
  public static pitch(remainingRequest: string): string {
    return [
      `__webpack_public_path__ = 'http://foobar'`
    ].join('\n');
  }
}
