import express from 'express';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import open from 'open';

const PORT: number = 8091;
const APP_URL: string = `http://localhost:${PORT}/app/`;

const app: express.Application = express();

app.use('/app', express.static(path.resolve(__dirname, '../dist')));

app.get('/', (req: express.Request, res: express.Response) => {
  const doc = yaml.load(
    fs.readFileSync(path.resolve(__dirname, './exampleData/monorepo.pnpm-lock.yaml')).toString()
  );
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
