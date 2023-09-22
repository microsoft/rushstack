const fs = require('fs');
// Verify that the coverage folder exists, since it would only exist
// if the preset was used.
if (!fs.existsSync(`${__dirname}/../coverage`)) {
  throw new Error('Coverage folder does not exist');
}
