[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [logNorm\_Inv](local.excel_functions.lognorm_inv.md)

# Excel\_Functions.logNorm\_Inv method

Returns the inverse of the lognormal cumulative distribution function of x, where ln(x) is normally distributed with parameters Mean and Standard\_dev. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
logNorm_Inv(probability: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, mean: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, standardDev: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `probability` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `mean` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `standardDev` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

