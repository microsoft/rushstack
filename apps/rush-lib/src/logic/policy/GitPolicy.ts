// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushPolicy } from './RushPolicy';
import { RushConfiguration } from '../../api/RushConfiguration';
import { Git } from '../Git';

export abstract class GitPolicy extends RushPolicy {
  public validate(rushConfiguration: RushConfiguration): void {
    const gitPath: string | undefined = Git.getGitPath();
    if (gitPath) {
      this.innerValidate(gitPath, rushConfiguration);
    }
  }

  protected abstract innerValidate(gitPath: string, rushConfiguration: RushConfiguration): void;
}
