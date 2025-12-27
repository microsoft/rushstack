// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Label } from '@fluentui/react';
import type { AnyAction, Dispatch } from '@reduxjs/toolkit';
import * as React from 'react';
import { type CSSProperties, useEffect } from 'react';

import { useAppDispatch } from '../store/hooks';
import { type ICommandLineParameter, useFilteredParameters } from '../store/slices/parameter';
import {
  setUserSelectedParameterName,
  useCurrentParameterName,
  useUserSelectedParameterName
} from '../store/slices/ui';

const navStyle: CSSProperties = {
  width: '160px',
  height: 'auto',
  boxSizing: 'border-box',
  overflowY: 'auto'
};

const NAV_LABEL_PREFIX: string = 'parameter-nav-label-';

export const ParameterNav = (): React.ReactElement => {
  const parameters: ICommandLineParameter[] = useFilteredParameters();
  const currentParameterName: string = useCurrentParameterName();
  const userSelectdParameterName: string = useUserSelectedParameterName();
  const dispatch: Dispatch<AnyAction> = useAppDispatch();

  useEffect(() => {
    const $el: HTMLElement | null = document.getElementById(`${NAV_LABEL_PREFIX}${currentParameterName}`);
    if ($el) {
      $el.scrollIntoView({
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [currentParameterName]);

  return (
    <div style={navStyle}>
      {parameters.map((parameter: ICommandLineParameter) => {
        const { longName } = parameter;
        const text: string = longName
          .replace(/^--([a-z])/, (matches) => {
            return matches[2].toUpperCase();
          })
          .replace(/-([a-z])/g, (matches) => {
            return matches[1].toUpperCase();
          });
        let fontWeight: string = 'normal';
        if (userSelectdParameterName) {
          if (userSelectdParameterName === longName) {
            fontWeight = 'bold';
          }
        } else if (currentParameterName === longName) {
          fontWeight = 'bold';
        }
        return (
          <Label
            id={`${NAV_LABEL_PREFIX}${longName}`}
            styles={{
              root: {
                fontWeight,
                cursor: 'pointer'
              }
            }}
            key={text}
            required={parameter.required}
            onClick={() => {
              dispatch(setUserSelectedParameterName(longName));
            }}
          >
            {text}
          </Label>
        );
      })}
    </div>
  );
};
