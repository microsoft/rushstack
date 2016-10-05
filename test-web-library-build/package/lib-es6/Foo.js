import { autobind } from 'office-ui-fabric-react';

export class Foo {
    @autobind
    say() {
        console.log('hi');
    }
}
