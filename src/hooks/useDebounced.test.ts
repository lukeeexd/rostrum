import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounced } from "./useDebounced";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDebounced", () => {
  it("only settles once the value stops changing", () => {
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 300), { initialProps: { v: "s" } });
    rerender({ v: "sk" });
    act(() => vi.advanceTimersByTime(200));
    rerender({ v: "arena" });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("s");
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("arena");
  });
});
