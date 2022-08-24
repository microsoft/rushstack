// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export class Constants {
  public static projectConfigFolderName: string = 'config';

  public static cacheFolderName: string = '.cache';

  public static tempFolderName: string = 'temp';

  public static cleanParameterLongName: string = '--clean';

  public static cleanCacheParameterLongName: string = '--clean-cache';

  public static debugParameterLongName: string = '--debug';

  public static localesParameterLongName: string = '--locales';

  public static productionParameterLongName: string = '--production';

  public static serveParameterLongName: string = '--serve';

  public static unmanagedParameterLongName: string = '--unmanaged';

  public static verboseParameterLongName: string = '--verbose';

  public static verboseParameterShortName: string = '-v';

  public static maxParallelism: number = 100;
}
