<!-- docId=sp-webpart-base.ipropertypanetextfieldprops -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md)

# IPropertyPaneTextFieldProps interface

PropertyPaneTextField component props.

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`ariaLabel`](./sp-webpart-base.ipropertypanetextfieldprops.arialabel.md) | `string` | Aria Label for textfield, if any. |
|  [`deferredValidationTime`](./sp-webpart-base.ipropertypanetextfieldprops.deferredvalidationtime.md) | `number` | Text field will start to validate after users stop typing for `deferredValidationTime` milliseconds. Default value is 200. |
|  [`description`](./sp-webpart-base.ipropertypanetextfieldprops.description.md) | `string` | The textfield input description. |
|  [`disabled`](./sp-webpart-base.ipropertypanetextfieldprops.disabled.md) | `boolean` | Whether the property pane textfield is enabled or not. |
|  [`errorMessage`](./sp-webpart-base.ipropertypanetextfieldprops.errormessage.md) | `string` | If set, this will be displayed as an error message. When onGetErrorMessage returns empty string, if this property has a value set then this will be displayed as the error message. So, make sure to set this only if you want to see an error message dispalyed for the text field. |
|  [`label`](./sp-webpart-base.ipropertypanetextfieldprops.label.md) | `string` | Label for the textfield. |
|  [`maxLength`](./sp-webpart-base.ipropertypanetextfieldprops.maxlength.md) | `number` | Maximum number of characters that the PropertyPaneTextField can have. (If the value is set to a negative number, an exception will be thrown.) |
|  [`multiline`](./sp-webpart-base.ipropertypanetextfieldprops.multiline.md) | `boolean` | Whether or not the textfield is a multiline textfield. Default value is false. |
|  [`onGetErrorMessage`](./sp-webpart-base.ipropertypanetextfieldprops.ongeterrormessage.md) | `(value: string) => string | Promise<string>` | The method is used to get the validation error message and determine whether the input value is valid or not. When it returns string: - If valid, it returns empty string. - If invalid, it returns the error message string and an error message is displayed below the text field. When it returns Promise&lt;string&gt;: - The resolved value is display as error message. - The rejected, the value is thrown away. |
|  [`placeholder`](./sp-webpart-base.ipropertypanetextfieldprops.placeholder.md) | `string` | placeholder text to be displayed in the Textfield. |
|  [`resizable`](./sp-webpart-base.ipropertypanetextfieldprops.resizable.md) | `boolean` | Whether or not the multiline textfield is resizable. Default value is true. |
|  [`rows`](./sp-webpart-base.ipropertypanetextfieldprops.rows.md) | `number` | Specifies the visible height of a text area(multiline text TextField), in lines. This prop is used only when the multiline prop is set to true. |
|  [`underlined`](./sp-webpart-base.ipropertypanetextfieldprops.underlined.md) | `boolean` | Whether or not the textfield is underlined. Default value is false. |
|  [`validateOnFocusIn`](./sp-webpart-base.ipropertypanetextfieldprops.validateonfocusin.md) | `boolean` | Run validation when the PropertyPaneTextField is focused. default value is false |
|  [`validateOnFocusOut`](./sp-webpart-base.ipropertypanetextfieldprops.validateonfocusout.md) | `boolean` | Run validation when the PropertyPaneTextField is out of focus or on blur. default value is false |
|  [`value`](./sp-webpart-base.ipropertypanetextfieldprops.value.md) | `string` | Value to be displayed in the textfield when the value of the targetProperty in the manifest's property bag is empty or contains null value. |

