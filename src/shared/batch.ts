export type SettledBatchResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

export type BatchSettledEvent<T> = {
  index: number;
  completed: number;
  total: number;
  result: SettledBatchResult<T>;
};

export async function runConcurrentBatch<Input, Output>(
  items: readonly Input[],
  concurrency: number,
  worker: (item: Input, index: number) => Promise<Output>,
  onSettled?: (event: BatchSettledEvent<Output>) => void | Promise<void>
): Promise<SettledBatchResult<Output>[]> {
  if (items.length === 0) {
    return [];
  }

  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  const results = new Array<SettledBatchResult<Output>>(items.length);
  let nextIndex = 0;
  let completed = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;

        let result: SettledBatchResult<Output>;
        try {
          result = { status: "fulfilled", value: await worker(items[index], index) };
        } catch (reason) {
          result = { status: "rejected", reason };
        }

        results[index] = result;
        completed += 1;
        await onSettled?.({ index, completed, total: items.length, result });
      }
    })
  );

  return results;
}
