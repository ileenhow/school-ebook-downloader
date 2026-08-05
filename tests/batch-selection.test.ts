import { describe, expect, it } from "vitest";
import { runConcurrentBatch } from "../src/shared/batch";
import { BookSelection } from "../src/popup/selection";

describe("batch download scheduling", () => {
  it("limits concurrency, preserves result order, and continues after failures", async () => {
    let active = 0;
    let maxActive = 0;
    const completed: number[] = [];
    const results = await runConcurrentBatch(
      [0, 1, 2, 3, 4, 5],
      3,
      async (value) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, value % 2 === 0 ? 8 : 2));
        active -= 1;
        if (value === 2) {
          throw new Error("expected failure");
        }
        return value * 10;
      },
      ({ completed: count }) => {
        completed.push(count);
      }
    );

    expect(maxActive).toBe(3);
    expect(completed).toEqual([1, 2, 3, 4, 5, 6]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
      "rejected",
      "fulfilled",
      "fulfilled",
      "fulfilled"
    ]);
    expect(results[3]).toEqual({ status: "fulfilled", value: 30 });
  });
});

describe("popup book selection", () => {
  it("keeps selections across filter views and retains only current catalog entries", () => {
    const selection = new BookSelection();
    selection.setMany(["math-1", "math-2"], true);

    expect(selection.has("math-1")).toBe(true);
    expect(selection.size).toBe(2);

    selection.set("chinese-1", true);
    expect(selection.size).toBe(3);

    selection.retain(["math-1", "chinese-1"]);
    expect(selection.has("math-2")).toBe(false);
    expect(selection.size).toBe(2);

    selection.deleteMany(["math-1"]);
    expect(selection.has("chinese-1")).toBe(true);
    selection.clear();
    expect(selection.size).toBe(0);
  });
});
