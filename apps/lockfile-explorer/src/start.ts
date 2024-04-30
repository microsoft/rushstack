// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import express from 'express';
import yaml from 'js-yaml';
import cors from 'cors';
import process from 'process';
import open from 'open';
import updateNotifier from 'update-notifier';
import { AlreadyReportedError } from '@rushstack/node-core-library';
import { FileSystem, type IPackageJson, JsonFile, PackageJsonLookup } from '@rushstack/node-core-library';
import type { IAppContext } from '@rushstack/lockfile-explorer-web/lib/AppContext';
import { Colorize } from '@rushstack/terminal';

import { init } from './init';
import type { IAppState } from './state';
import { type ICommandLine, parseCommandLine } from './commandLine';

function startApp(debugMode: boolean): void {
  const lockfileExplorerProjectRoot: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
  const lockfileExplorerPackageJson: IPackageJson = JsonFile.load(
    `${lockfileExplorerProjectRoot}/package.json`
  );
  const appVersion: string = lockfileExplorerPackageJson.version;

  console.log(
    Colorize.bold(`\nRush Lockfile Explorer ${appVersion}`) + Colorize.cyan(' - https://lfx.rushstack.io/\n')
  );

  updateNotifier({
    pkg: lockfileExplorerPackageJson,
    // Normally update-notifier waits a day or so before it starts displaying upgrade notices.
    // In debug mode, show the notice right away.
    updateCheckInterval: debugMode ? 0 : undefined
  }).notify({
    // Make sure it says "-g" in the "npm install" example command line
    isGlobal: true,
    // Show the notice immediately, rather than waiting for process.onExit()
    defer: false
  });

  const PORT: number = 8091;
  // Must not have a trailing slash
  const SERVICE_URL: string = `http://localhost:${PORT}`;

  const result: ICommandLine = parseCommandLine(process.argv.slice(2));
  if (result.showedHelp) {
    console.error('\nFor help, use:  ' + Colorize.yellow('lockfile-explorer --help'));
    process.exitCode = 1;
    return;
  }

  if (result.error) {
    console.error('\n' + Colorize.red('ERROR: ' + result.error));
    process.exitCode = 1;
    return;
  }

  const subspaceName: string = result.subspace ?? 'default';

  const appState: IAppState = init({ lockfileExplorerProjectRoot, appVersion, debugMode, subspaceName });

  // Important: This must happen after init() reads the current working directory
  process.chdir(appState.lockfileExplorerProjectRoot);

  const distFolderPath: string = `${appState.lockfileExplorerProjectRoot}/dist`;
  const app: express.Application = express();
  app.use(express.json());
  app.use(cors());

  // Variable used to check if the front-end client is still connected
  let awaitingFirstConnect: boolean = true;
  let isClientConnected: boolean = false;
  let disconnected: boolean = false;
  setInterval(() => {
    if (!isClientConnected && !awaitingFirstConnect && !disconnected) {
      console.log(Colorize.red('The client has disconnected!'));
      console.log(`Please open a browser window at http://localhost:${PORT}/app`);
      disconnected = true;
    } else if (!awaitingFirstConnect) {
      isClientConnected = false;
    }
  }, 4000);

  // This takes precedence over the `/app` static route, which also has an `initappcontext.js` file.
  app.get('/initappcontext.js', (req: express.Request, res: express.Response) => {
    const appContext: IAppContext = {
      serviceUrl: SERVICE_URL,
      appVersion: appState.appVersion,
      debugMode: process.argv.indexOf('--debug') >= 0
    };
    const sourceCode: string = [
      `console.log('Loaded initappcontext.js');`,
      `appContext = ${JSON.stringify(appContext)}`
    ].join('\n');

    res.type('application/javascript').send(sourceCode);
  });

  app.use('/', express.static(distFolderPath));

  app.use('/favicon.ico', express.static(distFolderPath, { index: 'favicon.ico' }));

  app.get('/api/lockfile', async (req: express.Request, res: express.Response) => {
    const pnpmLockfileText: string = await FileSystem.readFileAsync(appState.pnpmLockfileLocation);
    const doc = yaml.load(pnpmLockfileText);
    res.send({
      doc,
      subspaceName
    });
  });

  app.get('/api/health', (req: express.Request, res: express.Response) => {
    awaitingFirstConnect = false;
    isClientConnected = true;
    if (disconnected) {
      disconnected = false;
      console.log(Colorize.green('The client has reconnected!'));
    }
    res.status(200).send();
  });

  app.post(
    '/api/package-json',
    async (req: express.Request<{}, {}, { projectPath: string }, {}>, res: express.Response) => {
      const { projectPath } = req.body;
      const fileLocation = `${appState.projectRoot}/${projectPath}/package.json`;
      let packageJsonText: string;
      try {
        packageJsonText = await FileSystem.readFileAsync(fileLocation);
      } catch (e) {
        if (FileSystem.isNotExistError(e)) {
          return res.status(404).send({
            message: `Could not load package.json file for this package. Have you installed all the dependencies for this workspace?`,
            error: `No package.json in location: ${projectPath}`
          });
        } else {
          throw e;
        }
      }

      res.send(packageJsonText);
    }
  );

  app.get('/api/pnpmfile', async (req: express.Request, res: express.Response) => {
    let pnpmfile: string;
    try {
      pnpmfile = await FileSystem.readFileAsync(appState.pnpmfileLocation);
    } catch (e) {
      if (FileSystem.isNotExistError(e)) {
        return res.status(404).send({
          message: `Could not load pnpmfile file in this repo.`,
          error: `No .pnpmifile.cjs found.`
        });
      } else {
        throw e;
      }
    }

    res.send(pnpmfile);
  });

  app.post(
    '/api/package-spec',
    async (req: express.Request<{}, {}, { projectPath: string }, {}>, res: express.Response) => {
      const { projectPath } = req.body;
      const fileLocation = `${appState.projectRoot}/${projectPath}/package.json`;
      let packageJson: IPackageJson;
      try {
        packageJson = await JsonFile.loadAsync(fileLocation);
      } catch (e) {
        if (FileSystem.isNotExistError(e)) {
          return res.status(404).send({
            message: `Could not load package.json file in location: ${projectPath}`
          });
        } else {
          throw e;
        }
      }

      const {
        hooks: { readPackage }
      } = require(appState.pnpmfileLocation);
      const parsedPackage = readPackage(packageJson, {});
      res.send(parsedPackage);
    }
  );

  app.listen(PORT, async () => {
    console.log(`App launched on ${SERVICE_URL}`);

    if (!appState.debugMode) {
      try {
        // Launch the web browser
        await open(SERVICE_URL);
      } catch (e) {
        console.error('Error launching browser: ' + e.toString());
      }
    }
  });
}

const debugMode: boolean = process.argv.indexOf('--debug') >= 0;
if (debugMode) {
  // Display the full callstack for errors
  startApp(debugMode);
} else {
  // Catch exceptions and report them nicely
  try {
    startApp(debugMode);
  } catch (error) {
    if (!(error instanceof AlreadyReportedError)) {
      console.error();
      console.error(Colorize.red('ERROR: ' + error.message));
    }
  }
}
