import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupRecheck } from "./GroupRecheck";

type Marks = { all: number | null; groups: Record<string, number> };

/** A fetch that serves the marks and records (and answers) writes. */
function stubFetch(marks: Marks, write: () => Response = () => Response.json({ queued: true })) {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
    !init?.method || init.method === "GET" ? Response.json(marks) : write(),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const writes = (fetch: ReturnType<typeof stubFetch>) =>
  fetch.mock.calls.filter(([, init]) => init?.method && init.method !== "GET") as unknown as [string, RequestInit][];

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GroupRecheck groupId={643} groupName="Entertainment" channels={26} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("GroupRecheck", () => {
  it("asks before queuing, then queues exactly that group", async () => {
    const fetch = stubFetch({ all: null, groups: {} });
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: /re-check group/i }));
    expect(screen.getByText(/Measure every stream in Entertainment \(26 channels\) again\?/)).toBeInTheDocument();
    expect(writes(fetch)).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Queue" }));
    await waitFor(() => expect(writes(fetch)).toHaveLength(1));
    const [url, init] = writes(fetch)[0];
    expect([url, init.method, init.body]).toEqual(["/api/refresh", "POST", '{"scope":"group","groupId":643}']);
  });

  it("offers cancel while the group is queued", async () => {
    const fetch = stubFetch({ all: null, groups: { "643": Date.now() - 120_000 } }, () => Response.json({ cancelled: true }));
    renderIt();
    expect(await screen.findByText(/Re-check queued 2m ago/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(writes(fetch)).toHaveLength(1));
    expect(writes(fetch)[0][0]).toBe("/api/refresh?scope=group&groupId=643");
    expect(writes(fetch)[0][1].method).toBe("DELETE");
  });

  it("says so when the whole catalogue is already queued, and offers nothing", async () => {
    stubFetch({ all: Date.now(), groups: {} });
    renderIt();
    expect(await screen.findByText(/whole catalogue is already queued/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("clears a failed queue's error when backing out (regression)", async () => {
    stubFetch({ all: null, groups: {} }, () => Response.json({ error: "upstream_unreachable" }, { status: 502 }));
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: /re-check group/i }));
    await userEvent.click(screen.getByRole("button", { name: "Queue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Podium is unreachable from Rostrum.");
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
