<!-- docId=sp-webpart-base.ipropertypanetextfieldprops.ongeterrormessage -->

[Home](./index.md) &gt; [sp-webpart-base](./sp-webpart-base.md) &gt; [IPropertyPaneTextFieldProps](./sp-webpart-base.ipropertypanetextfieldprops.md)

# IPropertyPaneTextFieldProps.onGetErrorMessage property

The method is used to get the validation error message and determine whether the input value is valid or not. When it returns string: - If valid, it returns empty string. - If invalid, it returns the error message string and an error message is displayed below the text field. When it returns Promise&lt;string&gt;: - The resolved value is display as error message. - The rejected, the value is thrown away.

**Signature:**
```javascript
onGetErrorMessage: (value: string) => string | Promise<string>
```
