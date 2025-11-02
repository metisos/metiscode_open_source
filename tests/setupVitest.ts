import { describe as vitestDescribe, it as vitestIt, test, suite } from "vitest";

type TestCallback = Parameters<typeof vitestIt>[1];

type MochaStyle = {
  timeout(ms: number): MochaStyle;
  skip: (...args: Parameters<typeof vitestIt.skip>) => void;
  only: (...args: Parameters<typeof vitestIt.only>) => void;
};

function createTimedRegistrar(
  register: (timeout?: number) => void
): MochaStyle {
  let timeoutMs: number | undefined;

  const api: MochaStyle = {
    timeout(ms: number) {
      timeoutMs = ms;
      return api;
    },
    skip: (...args) => {
      return vitestIt.skip(...args);
    },
    only: (...args) => {
      return vitestIt.only(...args);
    }
  };

  queueMicrotask(() => register(timeoutMs));

  return api;
}

function mochaIt(name: string, fn: TestCallback) {
  return createTimedRegistrar(timeout => {
    if (timeout !== undefined) {
      vitestIt(name, fn, timeout);
    } else {
      vitestIt(name, fn);
    }
  });
}

function mochaDescribe(name: string, fn: Parameters<typeof vitestDescribe>[1]) {
  return createTimedRegistrar(timeout => {
    if (timeout !== undefined) {
      vitestDescribe(name, fn, timeout);
    } else {
      vitestDescribe(name, fn);
    }
  });
}

globalThis.it = Object.assign(mochaIt, {
  skip: vitestIt.skip,
  only: vitestIt.only,
  todo: vitestIt.todo
});

globalThis.describe = Object.assign(mochaDescribe, {
  skip: vitestDescribe.skip,
  only: vitestDescribe.only,
  todo: vitestDescribe.todo
});

globalThis.test = Object.assign(mochaIt, {
  skip: test.skip,
  only: test.only,
  todo: test.todo
});

globalThis.suite = Object.assign(mochaDescribe, {
  skip: suite.skip,
  only: suite.only,
  todo: suite.todo
});
