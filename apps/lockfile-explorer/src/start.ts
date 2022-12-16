// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import express from 'express';
import yaml from 'js-yaml';
import cors from 'cors';
import process from 'process';
import colors from 'colors/safe';
import open from 'open';
import { FileSystem, type IPackageJson, JsonFile } from '@rushstack/node-core-library';
import type { IAppContext } from '@rushstack/lockfile-explorer-web/lib/AppContext';

import { init } from './init';
import type { IAppState } from './state';

const PORT: number = 8091;
// Must not have a trailing slash
const SERVICE_URL: string = `http://localhost:${PORT}`;
const APP_URL: string = `${SERVICE_URL}/app/`;

const appState: IAppState = init();

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
    console.log(colors.red('The client has disconnected!'));
    console.log(`Please open a browser window at http://localhost:${PORT}/app`);
    disconnected = true;
  } else if (!awaitingFirstConnect) {
    isClientConnected = false;
  }
}, 4000);

// This takes precedence over the `/app` static route, which also has an `initappcontext.js` file.
app.get('/app/initappcontext.js', (req: express.Request, res: express.Response) => {
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

app.use('/app', express.static(distFolderPath));

app.use('/favicon.ico', express.static(distFolderPath, { index: 'favicon.ico' }));

app.get('/', async (req: express.Request, res: express.Response) => {
  const pnpmLockfileText: string = await FileSystem.readFileAsync(appState.pnpmLockfileLocation);
  const doc = yaml.load(pnpmLockfileText);
  res.send(doc);
});

app.get('/api/health', (req: express.Request, res: express.Response) => {
  awaitingFirstConnect = false;
  isClientConnected = true;
  if (disconnected) {
    disconnected = false;
    console.log(colors.green('The client has reconnected!'));
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
  let pnpmLockfile: string;
  try {
    pnpmLockfile = await FileSystem.readFileAsync(appState.pnpmLockfileLocation);
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

  res.send(pnpmLockfile);
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
    const parsedPackage = readPackage(packageJson);
    res.send(parsedPackage);
  }
);

app.listen(PORT, async () => {
  console.log(`Rush Lockfile Explorer ${appState.appVersion} running at ${APP_URL}`);

  if (!process.argv.includes('--debug')) {
    try {
      // Launch the web browser
      await open(APP_URL);
    } catch (e) {
      console.error('Error launching browser: ' + e.toString());
    }
  }
});
