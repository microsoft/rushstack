import { default as DefaultClass_namedImport } from 'api-extractor-lib2-test';
import { DefaultClass_reExport } from './re-export.ts';

/** @public */
export interface DefaultImportTypes {
  namedImport: DefaultClass_namedImport;
  reExport: DefaultClass_reExport;
  dynamicImport: import('api-extractor-lib2-test').default;
}
