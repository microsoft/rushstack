[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [if](local.excel_functions.if.md)

# Excel\_Functions.if method

Checks whether a condition is met, and returns one value if TRUE, and another value if FALSE. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
if(logicalTest: boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, valueIfTrue?: Excel.Range | number | string | boolean | Excel.RangeReference | Excel.FunctionResult<any>, valueIfFalse?: Excel.Range | number | string | boolean | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number | string | boolean>;
```
**Returns:** `FunctionResult<number | string | boolean>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `logicalTest` | `boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `valueIfTrue` | `Excel.Range | number | string | boolean | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `valueIfFalse` | `Excel.Range | number | string | boolean | Excel.RangeReference | Excel.FunctionResult<any>` |  |

