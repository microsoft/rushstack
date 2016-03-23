let loaderUtils = require('loader-utils');

export class LoadThemedStylesLoader {
  public static pitch(remainingRequest: string): string {
    return [
      `var content = require(${loaderUtils.stringifyRequest(this, '!!' + remainingRequest)});`,
      'var loader = require("load-themed-styles");',
      '',
      'if(typeof content === "string") content = [[module.id, content]];',
      '',
      '// add the styles to the DOM',
      'for (var i = 0; i < content.length; i++) loader.loadStyles(content[i][1]);',
      '',
      'if(content.locals) module.exports = content.locals;'
    ].join('\n');
  }
}
