[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [ipmt](local.excel_functions.ipmt.md)

# Excel\_Functions.ipmt method

Returns the interest payment for a given period for an investment, based on periodic, constant payments and a constant interest rate. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
ipmt(rate: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, per: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, nper: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, pv: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, fv?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, type?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `rate` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `per` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `nper` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `pv` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `fv` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `type` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

