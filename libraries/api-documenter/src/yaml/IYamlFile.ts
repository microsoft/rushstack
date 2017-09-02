// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface IYamlFile {
  items: IYamlItem[];
  references?: IYamlReference;
}

export interface IYamlException {
  description?: string;
  tupe?: string;
}

export interface IYamlItem {
  type: 'class' | 'constructor' | 'enum' | 'field' | 'interface' | 'method' | 'package' | 'property';

  children?: string[];
  exceptions?: IYamlException[];
  fullName?: string;
  langs?: string[];
  name?: string;
  numericValue?: number;
  package?: string;
  source?: IYamlSource;
  summary?: string;
  syntax?: IYamlSyntax;
  uid: string;
}

export interface IYamlParameter {
  description?: string;
  id?: string;
  type?: string[];
}

export interface IYamlReference {
  name?: string;
  uid?: string;
}

export interface IYamlRemote {
  branch?: string;
  path?: string;
  repo?: string;
}

export interface IYamlReturn {
  description?: string;
  type?: string[];
}

export interface IYamlSource {
  id?: string;
  path?: string;
  remote?: IYamlRemote;
  startLine?: number;
}

export interface IYamlSyntax {
  content?: string;
  parameters?: IYamlParameter[];
  return?: IYamlReturn;
}
