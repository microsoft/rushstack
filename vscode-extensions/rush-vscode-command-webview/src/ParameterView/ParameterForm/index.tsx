// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';
import { CSSProperties, ReactNode, useCallback, useEffect, useMemo } from 'react';
import { CommandLineParameterKind } from '@rushstack/ts-command-line/lib/parameters/BaseClasses';
import { CommandLineChoiceListParameter } from '@rushstack/ts-command-line/lib/parameters/CommandLineChoiceListParameter';
import { CommandLineChoiceParameter } from '@rushstack/ts-command-line/lib/parameters/CommandLineChoiceParameter';
import { CommandLineIntegerParameter } from '@rushstack/ts-command-line/lib/parameters/CommandLineIntegerParameter';
import { FieldValues, FormProvider, UseControllerProps, useForm, UseFormReturn } from 'react-hook-form';
import { DefaultButton, Label } from '@fluentui/react';

import { ControlledTextField } from '../../ControlledFormComponents/ControlledTextField';
import { ControlledComboBox } from '../../ControlledFormComponents/ControlledComboBox';
import { ControlledTextFieldArray } from '../../ControlledFormComponents/ControlledTextFieldArray';
import {
  ICommandLineParameter,
  onChangeFormDefaultValues,
  onChangeSearchText,
  useArgsTextList,
  useFilteredParameters,
  useParameters
} from '../../store/slices/parameter';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { ParameterFormWatcher } from './Watcher';

import type { AnyAction, Dispatch } from '@reduxjs/toolkit';
import { ControlledToggle } from '../../ControlledFormComponents/ControlledToggle';
import { FIELD_ANCHOR_CLASSNAME } from '../../hooks/parametersFormScroll';
import { setFormValidateAsync, useUserSelectedParameterName } from '../../store/slices/ui';
import { RunButton } from '../../Toolbar/RunButton';

const formStyle: CSSProperties = {
  // width: '430px'
};

export const ParameterForm = (): JSX.Element => {
  const commandName: string = useAppSelector((state) => state.parameter.commandName);
  const parameters: ICommandLineParameter[] = useParameters();
  const filteredParameters: ICommandLineParameter[] = useFilteredParameters();
  const argsTextList: string[] = useArgsTextList();
  const dispatch: Dispatch<AnyAction> = useAppDispatch();
  const userSelectdParameterName: string = useUserSelectedParameterName();

  const isListTypeParameter: (parameter: ICommandLineParameter) => boolean = useCallback(
    (parameter: ICommandLineParameter) => {
      return (
        parameter.kind === CommandLineParameterKind.ChoiceList ||
        parameter.kind === CommandLineParameterKind.IntegerList ||
        parameter.kind === CommandLineParameterKind.StringList
      );
    },
    []
  );

  const defaultValues: FieldValues = useMemo(() => {
    return parameters.reduce((acc: FieldValues, parameter: ICommandLineParameter) => {
      const parameterHasDefaultValue: ICommandLineParameter & { defaultValue?: string } =
        parameter as ICommandLineParameter & { defaultValue?: string };
      const fieldName: string = parameterHasDefaultValue.longName;
      if ('defaultValue' in parameterHasDefaultValue) {
        acc[fieldName] = parameterHasDefaultValue.defaultValue;
      } else if (isListTypeParameter(parameter)) {
        acc[fieldName] = [{ value: '' }];
      } else {
        switch (parameter.kind) {
          case CommandLineParameterKind.Flag: {
            acc[fieldName] = false;
            break;
          }
          default: {
            acc[fieldName] = '';
          }
        }
      }
      return acc;
    }, {});
  }, [commandName, parameters, isListTypeParameter]);

  const form: UseFormReturn = useForm({
    defaultValues,
    shouldFocusError: true,
    shouldUnregister: true
  });
  useEffect(() => {
    dispatch(
      setFormValidateAsync(() => {
        return form.trigger();
      })
    );
  }, [form]);
  const { control, watch, reset } = form;

  // const defaultValuesRef: MutableRefObject<FieldValues> = useRef<FieldValues>({});
  // useEffect(() => {
  //   // deep clone
  //   const clonedValues: FieldValues = JSON.parse(JSON.stringify(defaultValues));
  //   defaultValuesRef.current = clonedValues;
  //   console.log('change default values', defaultValues);
  // }, [defaultValues]);

  useEffect(() => {
    // const defaultValues: FieldValues = defaultValuesRef.current;
    console.log('rest', defaultValues);
    reset(defaultValues);
    dispatch(onChangeFormDefaultValues(defaultValues));
  }, [commandName, reset, defaultValues]);

  useEffect(() => {
    if (!userSelectdParameterName) {
      return;
    }
    const $el: HTMLElement | null = document.getElementById(userSelectdParameterName);
    if ($el) {
      $el.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'start'
      });
    }
  }, [userSelectdParameterName]);

  return (
    <FormProvider {...form}>
      <div style={formStyle}>
        <h3>
          rush {commandName} {argsTextList.join(' ')}
        </h3>
        {parameters.length === 0 ? (
          <div>
            No parameters, just click <RunButton />
          </div>
        ) : filteredParameters.length === 0 ? (
          <div>
            No search results{' '}
            <DefaultButton
              text="Clear search"
              onClick={() => {
                dispatch(onChangeSearchText(''));
              }}
            />
          </div>
        ) : null}
        {filteredParameters.map((parameter: ICommandLineParameter) => {
          let fieldNode: ReactNode = null;
          const baseControllerProps: Pick<Required<UseControllerProps>, 'name' | 'control'> &
            UseControllerProps = {
            name: parameter.longName,
            control
          };
          if (parameter.required) {
            console.log('required param', parameter.longName);
            baseControllerProps.rules = {
              validate: (value: undefined | string | number | boolean) => {
                console.log('validating', value, parameter.longName);

                if (typeof value === 'undefined' || !String(value)) {
                  return 'This field is required';
                }
              }
            };
          }

          switch (parameter.kind) {
            case CommandLineParameterKind.Choice: {
              const commandLineChoiceParameter: CommandLineChoiceParameter =
                parameter as CommandLineChoiceParameter;
              fieldNode = (
                <ControlledComboBox
                  {...baseControllerProps}
                  defaultValue={commandLineChoiceParameter.defaultValue}
                  options={commandLineChoiceParameter.alternatives.map((alternative: string) => ({
                    key: alternative,
                    text: alternative
                  }))}
                />
              );
              break;
            }
            case CommandLineParameterKind.ChoiceList: {
              const commandLineChoiceListParameter: CommandLineChoiceListParameter =
                parameter as CommandLineChoiceListParameter;
              fieldNode = (
                <ControlledComboBox
                  {...baseControllerProps}
                  multiSelect={true}
                  options={commandLineChoiceListParameter.alternatives.map((alternative: string) => ({
                    key: alternative,
                    text: alternative
                  }))}
                />
              );
              break;
            }
            case CommandLineParameterKind.Flag: {
              // const commandLineFlagParameter: CommandLineFlagParameter = parameter as CommandLineFlagParameter;
              fieldNode = <ControlledToggle {...baseControllerProps} />;
              break;
            }
            case CommandLineParameterKind.Integer: {
              const commandLineIntegerParameter: CommandLineIntegerParameter =
                parameter as CommandLineIntegerParameter;
              fieldNode = (
                <ControlledTextField
                  {...baseControllerProps}
                  type="number"
                  defaultValue={String(commandLineIntegerParameter.defaultValue)}
                />
              );
              break;
            }
            case CommandLineParameterKind.IntegerList: {
              fieldNode = <ControlledTextFieldArray {...baseControllerProps} type="number" />;
              break;
            }
            case CommandLineParameterKind.String: {
              fieldNode = <ControlledTextField {...baseControllerProps} type="string" />;
              break;
            }
            case CommandLineParameterKind.StringList: {
              fieldNode = <ControlledTextFieldArray {...baseControllerProps} type="string" />;
              break;
            }
            default: {
              console.error(`Unhandled parameter kind: ${parameter.kind}`);
              return null;
            }
          }

          return (
            <div key={`${commandName}_${parameter.longName}`}>
              <Label id={parameter.longName} className={FIELD_ANCHOR_CLASSNAME} required={parameter.required}>
                {parameter.longName}
              </Label>
              {parameter.description ? <p>{parameter.description}</p> : null}
              <div style={{ width: 400 }}>{fieldNode}</div>
            </div>
          );
        })}
        <ParameterFormWatcher watch={watch} />
      </div>
    </FormProvider>
  );
};
