// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PrimaryButton } from '@fluentui/react/lib/Button';
import * as React from 'react';
import { useCallback } from 'react';

import { sendMessageToExtension } from '../Message/toExtension';
import { useAppSelector } from '../store/hooks';
import { useParameterArgs } from '../store/slices/parameter';

export const RunButton = (): React.ReactElement => {
  const commandName: string = useAppSelector((state) => state.parameter.commandName);
  const formValidateAsync: (() => Promise<boolean>) | undefined = useAppSelector(
    (state) => state.ui.formValidateAsync
  );
  const args: string[] = useParameterArgs();
  const onClickRunButton: () => void = useCallback(async () => {
    // eslint-disable-next-line no-console
    console.log('onCLickRun', commandName, formValidateAsync);
    if (!commandName || !formValidateAsync) {
      return;
    }
    const isValid: boolean = await formValidateAsync();
    // eslint-disable-next-line no-console
    console.log('isValid', isValid);
    if (isValid) {
      sendMessageToExtension({
        command: 'commandInfo',
        commandName,
        args
      });
    }
  }, [args, commandName, formValidateAsync]);
  return <PrimaryButton text="Run" onClick={onClickRunButton} allowDisabledFocus />;
};
