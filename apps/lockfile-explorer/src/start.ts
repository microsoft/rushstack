import express from 'express';
import cors from 'cors';
import yaml from 'js-yaml';
const app: express.Application = express();
import fs from 'fs';
import path from 'path';
import open from 'open';

const port: number = 8091;
const appUrl: string = `http://localhost:${port}/app/`;

app.use(cors());

app.use('/app', express.static('dist'));

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

app.listen(port, () => {
  console.log(`Rush Lockfile Explorer running at ${appUrl}`);

  if (process.argv.indexOf('--debug') < 0) {
    // Launch the web browser
    open(appUrl);
  }
});
