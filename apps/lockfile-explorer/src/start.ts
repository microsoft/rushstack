import express from 'express';
import cors from 'cors';
import yaml from 'js-yaml';
const app: express.Application = express();
import fs from 'fs';
import * as process from 'process';
import path from 'path';
import open from 'open';
import { init } from './init';

const port: number = 8091;
const appUrl: string = `http://localhost:${port}/app/`;

process.chdir(path.join(__dirname, '..'));

app.use(cors());

const appState = init();

app.use('/app', express.static('dist'));

app.get('/', (req: express.Request, res: express.Response) => {
  const doc = yaml.load(fs.readFileSync(appState.pnpmLockfileLocation).toString());
  res.send(doc);
});

app.get('/loadPackageJSON', (req: express.Request, res: express.Response) => {
  const packageJson = fs.readFileSync(path.resolve(__dirname, './exampleData/package.json'));
  res.send(packageJson);
});

app.get('/loadCJS', (req: express.Request, res: express.Response) => {
  const cjsFile = fs.readFileSync(path.resolve(__dirname, './exampleData/.pnpmfile.cjs'));
  res.send(cjsFile);
});

app.get('/parsedCJS', (req: express.Request, res: express.Response) => {
  const packageJson = fs.readFileSync(path.resolve(__dirname, './exampleData/package.json'));
  const {
    hooks: { readPackage }
  } = require(path.resolve(__dirname, './exampleData/.pnpmfile.cjs'));
  const parsedPackage = readPackage(packageJson);
  res.send(parsedPackage);
});

app.post('/uploadLockfile', (req: express.Request, res: express.Response) => {
  console.log('req body: ', req.body);
  const doc = yaml.load(req.body);
  res.send(doc);
});

app.listen(port, () => {
  console.log(`Rush Lockfile Explorer running at ${appUrl}`);

  if (process.argv.indexOf('--debug') < 0) {
    // Launch the web browser
    open(appUrl).catch((e) => {
      console.error('Error launching browser: ' + e.toString());
    });
  }
});
