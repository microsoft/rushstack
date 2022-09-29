const express = require('express');
const cors = require('cors');
const yaml = require('js-yaml');
const app = express();
const fs = require('fs');
const path = require('path');
// const exampleData = require('./exampleData/pnpm-lock.yaml');
const port = 8091;

app.use(cors());

app.get('/', (req: any, res: any) => {
  const doc = yaml.load(fs.readFileSync(path.resolve(__dirname, './exampleData/monorepo.pnpm-lock.yaml')));
  res.send(doc);
});

app.get('/loadPackageJSON', (req: any, res: any) => {
  const packageJson = fs.readFileSync(path.resolve(__dirname, './exampleData/package.json'));
  res.send(packageJson);
});

app.get('/loadCJS', (req: any, res: any) => {
  const cjsFile = fs.readFileSync(path.resolve(__dirname, './exampleData/.pnpmfile.cjs'));
  res.send(cjsFile);
});

app.get('/parsedCJS', (req: any, res: any) => {
  const packageJson = fs.readFileSync(path.resolve(__dirname, './exampleData/package.json'));
  const {
    hooks: { readPackage }
  } = require(path.resolve(__dirname, './exampleData/.pnpmfile.cjs'));
  const parsedPackage = readPackage(packageJson);
  res.send(parsedPackage);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
