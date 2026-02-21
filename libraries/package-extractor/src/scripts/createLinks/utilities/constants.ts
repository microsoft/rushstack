// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import os from 'node:os';
import path from 'node:path';

import type { TARGET_ROOT_SCRIPT_RELATIVE_PATH_TEMPLATE_STRING as TargetRootScriptRelativePathTemplateString } from '../../../PackageExtractor.ts';

/**
 * The maximum number of concurrent operations to perform.
 */
export const MAX_CONCURRENCY: number = (os.availableParallelism?.() ?? os.cpus().length) * 2;

/**
 * The name of the action to create symlinks.
 */
export const CREATE_ACTION_NAME: 'create' = 'create';

/**
 * The name of the action to remove symlinks.
 */
export const REMOVE_ACTION_NAME: 'remove' = 'remove';

/**
 * The name of the parameter to realize files when creating symlinks.
 */
export const REALIZE_FILES_PARAMETER_NAME: '--realize-files' = '--realize-files';

/**
 * The name of the parameter to link bins when creating symlinks.
 */
export const LINK_BINS_PARAMETER_NAME: '--link-bins' = '--link-bins';

/**
 * The name of the parameter to link packages when creating symlinks. The actual value of this
 * export is modified after bundling the script to ensure that the extracted version of the script
 * contains the relative path from the extraction target folder to the script. Generally, this
 * value should not be used directly, but rather the `TARGET_ROOT_FOLDER` export should be used
 * instead.
 */
export const TARGET_ROOT_SCRIPT_RELATIVE_PATH: typeof TargetRootScriptRelativePathTemplateString =
  '{TARGET_ROOT_SCRIPT_RELATIVE_PATH}';

/**
 * The path to the root folder where symlinks are created.
 */
export const TARGET_ROOT_FOLDER: string = path.resolve(__dirname, TARGET_ROOT_SCRIPT_RELATIVE_PATH);
