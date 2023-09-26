// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { fastify, type FastifyInstance } from 'fastify';

// eslint-disable-next-line no-console
console.error('CHILD STARTING');
process.on('beforeExit', () => {
  // eslint-disable-next-line no-console
  console.error('CHILD BEFOREEXIT');
});
process.on('exit', () => {
  // eslint-disable-next-line no-console
  console.error('CHILD EXITED');
});
process.on('SIGINT', function () {
  // eslint-disable-next-line no-console
  console.error('CHILD SIGINT');
});
process.on('SIGTERM', function () {
  // eslint-disable-next-line no-console
  console.error('CHILD SIGTERM');
});

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

    // eslint-disable-next-line no-console
    console.log('Listening on http://localhost:3000');
    await this.server.listen(3000);
  }

  public start(): void {
    this._startAsync().catch((error) => {
      process.exitCode = 1;
      this.server.log.error(error);

      if (error.stack) {
        // eslint-disable-next-line no-console
        console.error(error.stack);
        // eslint-disable-next-line no-console
        console.error();
      }
      // eslint-disable-next-line no-console
      console.error('ERROR: ' + error.toString());
    });
  }
}

const myApp: MyApp = new MyApp();
myApp.start();
