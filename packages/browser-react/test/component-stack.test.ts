import { describe, expect, it } from 'vitest';
import { componentStack } from '../src/component-stack';

describe('componentStack', () => {
  it.each([
    ['an empty stack', '', ''],
    ['a whitespace-only stack', '\n    \n', ''],
    [
      'leading newlines',
      '\n\n    at Product (https://shop.example.com/app.js:12:34)',
      'at Product (https://shop.example.com/app.js:12:34)',
    ],
    [
      'trailing newlines',
      '    at Product (https://shop.example.com/app.js:12:34)\n\n',
      'at Product (https://shop.example.com/app.js:12:34)',
    ],
    [
      'a multi-frame stack',
      '\n    at Product (https://shop.example.com/app.js?v=1:12:34)\n    at App (https://shop.example.com/app.js:1:2)\n',
      'at Product (https://shop.example.com/app.js:12:34)\n    at App (https://shop.example.com/app.js:1:2)',
    ],
  ])('trims %s', (_, stack, expected) => {
    expect(componentStack(stack)).toBe(expected);
  });

  it('truncates to 4096 characters after trimming', () => {
    const stack = `${' '.repeat(100)}${'x'.repeat(5000)}`;
    expect(componentStack(stack)).toBe('x'.repeat(4096));
  });
});
