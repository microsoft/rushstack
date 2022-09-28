const express = require('express');
const cors = require('cors');
const app = express();
const port = 8091;

app.use(cors());

app.get('/', (req: any, res: any) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
