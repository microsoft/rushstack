// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CONFIGURATION_FILE_FIELD_ANNOTATION, type IAnnotatedField } from './ConfigurationFileBase.ts';

/**
 * Returns an object with investigative annotations stripped, useful for snapshot testing.
 *
 * @beta
 */
export function stripAnnotations<TObject>(obj: TObject): TObject {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  } else if (Array.isArray(obj)) {
    const result: unknown[] = [];
    for (const value of obj) {
      result.push(stripAnnotations(value));
    }

    return result as TObject;
  } else {
    const clonedObj: TObject = { ...obj } as TObject;
    delete (clonedObj as Partial<IAnnotatedField<unknown>>)[CONFIGURATION_FILE_FIELD_ANNOTATION];
    for (const [name, value] of Object.entries(clonedObj as object)) {
      clonedObj[name as keyof TObject] = stripAnnotations<TObject[keyof TObject]>(
        value as TObject[keyof TObject]
      );
    }

    return clonedObj;
  }
}
