[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [isError](local.excel_functions.iserror.md)

# Excel\_Functions.isError method

Checks whether a value is an error (\#N/A, \#VALUE!, \#REF!, \#DIV/0!, \#NUM!, \#NAME?, or \#NULL!), and returns TRUE or FALSE. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
isError(value: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<boolean>;
```
**Returns:** `FunctionResult<boolean>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `value` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

