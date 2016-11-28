///<reference types="mocha" />

import * as path from 'path';
import { assert } from 'chai';
import { EOL } from 'os';

import {
  SchemaValidator,
  ISchemaValidatorResult
} from '../SchemaValidator';

const nonexistentFile: string = path.join(__dirname, 'thisfileshouldneverexist.json');
const basicSchema: string = path.join(__dirname, 'basicSchema.json');
const exampleValid: string = path.join(__dirname, 'example_valid.json');
const exampleSyntaxError: string = path.join(__dirname, 'example_syntaxerror.json');
const exampleInvalid: string = path.join(__dirname, 'example_invalid.json');

describe('SchemaValidator', () => {
  describe('readCommentedJsonFile', () => {
    it('reads a well-formatted JSON file', (done: MochaDone) => {
      assert.doesNotThrow(() => {
        SchemaValidator.readCommentedJsonFile(basicSchema);
      });
      done();
    });

    it('throws when the JSON file doesn\'t exist', (done: MochaDone) => {
      assert.throws(() => {
        SchemaValidator.readCommentedJsonFile(nonexistentFile);
      });
      done();
    });

    it('throws when the JSON file is malformed', (done: MochaDone) => {
      assert.throws(() => {
        SchemaValidator.readCommentedJsonFile(exampleSyntaxError);
      });
      done();
    });

    it('the file does not contain the $schema value', (done: MochaDone) => {
      const data: Object = SchemaValidator.readCommentedJsonFile(basicSchema);
      assert.isUndefined(data['$schema']); // tslint:disable-line:no-string-literal
      done();
    });
  });

  describe('getFormattedErrorMessage', () => {
    it('can properly format a simple error', (done: MochaDone) => {
      const error: ISchemaValidatorResult = {
        'name': 'z-schema validation error',
        'message': 'JSON_OBJECT_VALIDATION_FAILED',
        'details': [
          {
            'code': 'OBJECT_MISSING_REQUIRED_PROPERTY',
            'params': [
              'bar'
            ],
            'message': 'Missing required property: bar',
            'path': '#/',
            'description': 'An example schema with 2 properties'
          }
        ]
      };
      assert.equal(
        SchemaValidator.getFormattedErrorMessage(error),
        ['',
          'ERROR: (#/) Missing required property: bar',
          '',
          ''
        ].join(EOL)
      );
      done();
    });
  });

  describe('validateObject', () => {
    const schema: Object = {
      'title': 'basic schema',
      'description': 'An example schema with 2 properties',

      'type': 'object',
      'required': [
        'bar'
      ],
      'properties': {
        'bar': {
          'title': 'The bar string',
          'description': 'A string of bar',
          'type': 'string'
        }
      }
    };

    it('passes validation for a valid object', (done: MochaDone) => {
      assert.doesNotThrow(() => {
        SchemaValidator.validate({
          'bar': 'foo'
        }, schema);
      });
      done();
    });

    it('throws when passed an invalid object', (done: MochaDone) => {
      assert.throws(() => {
        SchemaValidator.validate({
          'foo': ['123', '345']
        }, 'file.js');
      });
      done();
    });
  });

  describe('validate', () => {
    it('passes validation for a valid object/schema file', (done: MochaDone) => {
      assert.doesNotThrow(() => {
        SchemaValidator.readAndValidateJson(exampleValid, basicSchema);
      });
      done();
    });

    it('throws when passed an invalid filepath for object', (done: MochaDone) => {
      assert.throws(() => {
        SchemaValidator.readAndValidateJson(nonexistentFile, basicSchema);
      });
      done();
    });

    it('throws when passed an invalid filepath for schema', (done: MochaDone) => {
      assert.throws(() => {
        SchemaValidator.readAndValidateJson(exampleValid, nonexistentFile);
      });
      done();
    });

    it('throws when the object file is malformed', (done: MochaDone) => {
      assert.throws(() => {
        SchemaValidator.readAndValidateJson(exampleSyntaxError, basicSchema);
      });
      done();
    });

    it('throws when the schema file is malformed', (done: MochaDone) => {
      assert.throws(() => {
        SchemaValidator.readAndValidateJson(exampleValid, exampleSyntaxError);
      });
      done();
    });

    it('throws when the object doesn\'t pass validation', (done: MochaDone) => {
      assert.throws(() => {
        SchemaValidator.readAndValidateJson(exampleValid, exampleInvalid);
      });
      done();
    });
  });
});
