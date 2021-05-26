// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { fastify, FastifyInstance } from 'fastify';

class MyApp {
  public readonly server: FastifyInstance;

  public constructor() {
    this.server = fastify({
      logger: true
    });
  }

  private async _startAsync(): Promise<void> {
    this.server.get('/', async (request, reply) => {
      return { hello: 'world' };
    });
  }

  public start(): void {
    this._startAsync().catch((error) => {
      process.exitCode = 1;
      this.server.log.error(error);

      if (error.stack) {
        console.error(error.stack);
        console.error();
      }
      console.error('ERROR: ' + error.toString());
    });
  }
}

const myApp: MyApp = new MyApp();
myApp.start();
