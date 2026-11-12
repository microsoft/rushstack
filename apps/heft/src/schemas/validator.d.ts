declare module '*.validator.js' {
  const validator: import('@rushstack/node-core-library').IJsonSchemaCompiledValidator;
  export default validator;
}
