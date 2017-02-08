import * as os from 'os';
import * as path from 'path';

import Validator = require('z-schema');

function _formatZSchemaError(error: Validator.SchemaErrorDetail): string[] {
  const innerErrors: string[] = [];

  error.inner.forEach((innerErr: Validator.SchemaErrorDetail) => {
    innerErrors.push(..._formatZSchemaError(innerErr));
  });

  return [`(${error.path}) ${error.message}`].concat(innerErrors);
}

function _extractInnerErrorMessages(errors: Validator.SchemaErrorDetail[]): string[] {
  const errorList: string[] = [];
  errors.map((error) => { errorList.push(..._formatZSchemaError(error)); });
  return errorList;
}

export function GetFormattedErrorMessage(errors: Validator.SchemaErrorDetail[], dataFilePath?: string): string {
  const errorMessage: string =
    (dataFilePath ? `Error parsing file '${path.basename(dataFilePath)}'${os.EOL}` : '') +
    _extractInnerErrorMessages(errors).join(os.EOL);

  return os.EOL + 'ERROR: ' + errorMessage + os.EOL + os.EOL;
}
