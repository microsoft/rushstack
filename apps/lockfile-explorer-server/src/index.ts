const express = require('express');
const cors = require('cors');
const yaml = require('js-yaml');
const app = express();
const fs = require('fs');
// const exampleData = require('./exampleData/pnpm-lock.yaml');
const port = 8091;

app.use(cors());

app.get('/', (req: any, res: any) => {
  const doc = yaml.load(
    fs.readFileSync(
      '/Users/williamhuang/Developer/rushstack/apps/lockfile-explorer-server/src/exampleData/pnpm-lock.yaml'
    )
  );
  res.send(doc);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
