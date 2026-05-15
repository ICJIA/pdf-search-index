import pLimit from 'p-limit';

export type LimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

export function createLimiter(concurrency: number): LimitFn {
  const limit = pLimit(Math.max(1, concurrency));
  return <T>(fn: () => Promise<T>) => limit(fn);
}
