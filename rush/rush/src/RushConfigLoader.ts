/// <reference path="../typings/tsd.d.ts" />

import * as path from 'path';
import * as fs from 'fs';
import stripJsonComments = require('strip-json-comments');
import Validator = require('z-schema');

export interface IRushConfig {
  commonFolder: string;
  projects: Array<string>;
};

export default class RushConfigLoader {

  public static load(): IRushConfig {
    let configFile : string = path.resolve('rush.json');

    if (!fs.existsSync(configFile)) {
      throw new Error(`Project folder not found: ${configFile}`);
    }

    let buffer = fs.readFileSync(configFile);
    let stripped = stripJsonComments(buffer.toString());
    let config = JSON.parse(stripped) as IRushConfig;

    // TODO: Move this to a standalone file that can be loaded into Visual Studio
    // http://blogs.msdn.com/b/webdev/archive/2014/04/11/intellisense-for-json-schema-in-the-json-editor.aspx
    let schema = {
      // '$schema': 'http://json-schema.org/draft-04/schema#',
      'title': 'Rush Configuration',
      'description': 'Configuration file for the Rush bulk package management tool',

      'type': 'object',
      'properties': {
        'commonFolder': {
          'description':
              'Specifies the name of a top-level global folder containing a package.json file'
            + 'with a superset of all dependencies for all projects in the repository.  Example: "common"',
          'type': 'string'
        },
        'projects': {
          'description':
              'Ann array of top-level project folders that will be managed by this tool,'
            + 'sorted according to build order.  Example: ["lib1", "lib2", "my-app"]',
          'type': 'array',
          'items': {
            'type': 'string'
          },
          'minItems': 1,
          'uniqueItems': true
        }
      },
      'required': [ 'projects' ]
    };

    let validator = new Validator({
      assumeAdditional: true,
      breakOnFirstError: true,
      noTypeless: true
    });

    if (!validator.validate(config, schema)) {
      let error: ZSchema.Error = validator.getLastError();

      let detail: ZSchema.ErrorDetail = error.details[0];
      let errorMessage: string = `Error parsing file '${path.basename(configFile)}', section [${detail.path}]:`
        + `\r\n(${detail.code}) ${detail.message} `;

      console.log('\r\nERROR: ' + errorMessage + '\r\n\r\n');
      throw new Error(errorMessage);
    }

    return config;
  }

}
