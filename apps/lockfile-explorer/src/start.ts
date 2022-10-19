import express from 'express';
import yaml from 'js-yaml';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import open from 'open';
import { init } from './init';
import { IAppState } from './state';

const PORT: number = 8091;
const APP_URL: string = `http://localhost:${PORT}/app/`;

process.chdir(path.join(__dirname, '..'));
const app: express.Application = express();
app.use(express.json());
app.use(cors());

const appState: IAppState = init();

app.use('/app', express.static(path.resolve(__dirname, '../dist')));

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

app.listen(PORT, async () => {
  console.log(`Rush Lockfile Explorer running at ${APP_URL}`);

  if (!process.argv.includes('--debug')) {
    try {
      // Launch the web browser
      await open(APP_URL);
    } catch (e) {
      console.error('Error launching browser: ' + e.toString());
    }
  }
});
