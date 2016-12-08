import test from './test.scss';
import testFunction from './pre-copy-test';

export function log(message: string): void {
  console.log(test.foo);
}

export function add(num1: number, num2: number): number {
  return num1 + num2;
}
