const MAX_STACK_LENGTH = 4096;
// Same URL/coordinate handling as the browser SDK's exception-stack scrubber.
const URL_IN_STACK = /((?:https?:\/\/|\/)[^\s?#()]*)[?#][^\s()]*?(:\d+(?::\d+)?)?(?=[\s)]|$)/g;

/** Component stacks always omit URL queries/fragments, even if general URL collection is enabled. */
export function componentStack(stack: string): string {
  return stack.replace(URL_IN_STACK, '$1$2').slice(0, MAX_STACK_LENGTH);
}
