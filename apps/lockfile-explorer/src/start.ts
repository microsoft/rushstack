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
app.use(express.json());
app.use(cors());

const appState = init();

app.use('/app', express.static('dist'));

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
        message: `Could not load package.json file in location: ${projectPath}`
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
    const packageJson = fs.readFileSync(fileLocation);
    const {
      hooks: { readPackage }
    } = require(path.resolve(appState.pnpmfileLocation));
    const parsedPackage = readPackage(packageJson);
    res.send(parsedPackage);
  }
);

app.listen(port, () => {
  console.log(`Rush Lockfile Explorer running at ${appUrl}`);

  if (process.argv.indexOf('--debug') < 0) {
    // Launch the web browser
    open(appUrl).catch((e) => {
      console.error('Error launching browser: ' + e.toString());
    });
  }
});
