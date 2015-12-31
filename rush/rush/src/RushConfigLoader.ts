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

    // Remove the $schema reference that appears in the config object (used for IntelliSense),
    // since we are replacing it with the precompiled version.  The validator.setRemoteReference()
    // API is a better way to handle this, but we'd first need to publish the schema file
    // to a public web server where Visual Studio can find it.
    delete config['$schema'];

    let schema = require('./rush-schema.json');
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
