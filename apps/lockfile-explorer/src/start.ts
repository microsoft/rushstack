// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import express from 'express';
import yaml from 'js-yaml';
import cors from 'cors';
import fs from 'fs';
import process from 'process';
import path from 'path';
import open from 'open';
import { init } from './init';

import { IAppState } from './state';
import type { IAppContext } from '@rushstack/lockfile-explorer-web/lib/AppContext';

const PORT: number = 8091;
// Must not have a trailing slash
const SERVICE_URL: string = `http://localhost:${PORT}`;
const APP_URL: string = `${SERVICE_URL}/app/`;

const appState: IAppState = init();

process.chdir(path.join(__dirname, '..'));
const app: express.Application = express();
app.use(express.json());
app.use(cors());

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

app.use('/app', express.static(path.resolve(__dirname, '../dist')));

app.use('/favicon.ico', express.static(path.resolve(__dirname, '../dist'), { index: 'favicon.ico' }));

app.get('/', (req: express.Request, res: express.Response) => {
  const doc = yaml.load(fs.readFileSync(appState.pnpmLockfileLocation).toString());
  res.send(doc);
});

app.post(
  '/api/package-json',
  (req: express.Request<{}, {}, { projectPath: string }, {}>, res: express.Response) => {
    const { projectPath } = req.body;
    const fileLocation = path.resolve(appState.projectRoot, projectPath, 'package.json');
    if (!fs.existsSync(fileLocation)) {
      return res.status(400).send({
        message: `Could not load package.json file for this package. Have you installed all the dependencies for this workspace?`,
        error: `No package.json in location: ${projectPath}`
      });
    }
    const packageJson = fs.readFileSync(fileLocation);
    res.send(packageJson);
  }
);

app.get('/api/pnpmfile', (req: express.Request, res: express.Response) => {
  const cjsFile = fs.readFileSync(path.resolve(appState.pnpmfileLocation));
  res.send(cjsFile);
});

app.post(
  '/api/package-spec',
  (req: express.Request<{}, {}, { projectPath: string }, {}>, res: express.Response) => {
    const { projectPath } = req.body;
    const fileLocation = path.resolve(appState.projectRoot, projectPath, 'package.json');
    if (!fs.existsSync(fileLocation)) {
      return res.status(400).send({
        message: `Could not load package.json file in location: ${projectPath}`
      });
    }
    const packageJson = fs.readFileSync(fileLocation).toString();

    const {
      hooks: { readPackage }
    } = require(path.resolve(appState.pnpmfileLocation));
    const parsedPackage = readPackage(JSON.parse(packageJson));
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
