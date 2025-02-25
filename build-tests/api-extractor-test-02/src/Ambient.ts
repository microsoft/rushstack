import { AmbientConsumer } from 'api-extractor-test-01';

// Test that the ambient types are accessible even though api-extractor-02 doesn't
// import Jest
const x = new AmbientConsumer();
const y = x.definitelyTyped();
const z = y.results;
