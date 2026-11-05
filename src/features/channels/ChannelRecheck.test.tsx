import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RefreshMarks } from "@/api/types";
import { recheckCovering } from "@/lib/recheck";
import { ChannelRecheck } from "./ChannelRecheck";

type Call = [string, RequestInit | undefined];

function stubFetch(marks: RefreshMarks, write: () => Response = () => Response.json({ queued: true, scope: "channel 462", forcedAt: 1 })) {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => (!init?.method || init.method === "GET" ? Response.json(marks) : write()));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const writes = (fetch: ReturnType<typeof stubFetch>) => (fetch.mock.calls as unknown as Call[]).filter(([, init]) => init?.method && init.method !== "GET");

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ChannelRecheck channelId={462} groupId={643} name="Arena Sports Golf" />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("recheckCovering", () => {
  it("finds the widest re-check already covering a channel", () => {
    expect(recheckCovering({ all: 5, groups: { "643": 6 }, channels: { "462": 7 } }, { channelId: 462, groupId: 643 })).toEqual({ by: "all", at: 5 });
    expect(recheckCovering({ all: null, groups: { "643": 6 }, channels: {} }, { channelId: 462, groupId: 643 })).toEqual({ by: "group", at: 6 });
    expect(recheckCovering({ all: null, groups: {}, channels: { "462": 7 } }, { channelId: 462, groupId: null })).toEqual({ by: "channel", at: 7 });
    expect(recheckCovering({ all: null, groups: {} }, { channelId: 462, groupId: 643 })).toBeNull();
  });
});

describe("ChannelRecheck", () => {
  it("stays hidden on a Podium that cannot re-check a single channel", async () => {
    const fetch = stubFetch({ all: null, groups: {} });
    renderIt();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("asks, then queues exactly that channel, with focus following", async () => {
    const fetch = stubFetch({ all: null, groups: {}, channels: {} });
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: /re-check this channel/i }));
    expect(screen.getByRole("status")).toHaveTextContent("Measure every stream on Arena Sports Golf again?");
    expect(screen.getByRole("button", { name: "Queue a re-check of Arena Sports Golf" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Queue a re-check of Arena Sports Golf" }));
    await waitFor(() => expect(writes(fetch)).toHaveLength(1));
    const [url, init] = writes(fetch)[0];
    expect([url, init?.method, init?.body]).toEqual(["/api/refresh", "POST", '{"scope":"channel","channelId":462}']);
  });

  it("keeps focus with the control when the queued state arrives after Queue (regression)", async () => {
    let queuedAt: number | null = null;
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        queuedAt = Date.now();
        return Response.json({ queued: true, scope: "channel 462", forcedAt: queuedAt });
      }
      return Response.json({ all: null, groups: {}, channels: queuedAt ? { "462": queuedAt } : {} });
    });
    vi.stubGlobal("fetch", fetch);
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: /re-check this channel/i }));
    await userEvent.click(screen.getByRole("button", { name: "Queue a re-check of Arena Sports Golf" }));
    const cancel = await screen.findByRole("button", { name: "Cancel the re-check of Arena Sports Golf" });
    await waitFor(() => expect(cancel).toHaveFocus());
  });

  it("does not take focus when a background refresh changes it", async () => {
    stubFetch({ all: null, groups: {}, channels: {} });
    renderIt();
    await screen.findByRole("button", { name: /re-check this channel/i });
    expect(document.body).toHaveFocus();
  });

  it("shows a queued channel and cancels just that channel", async () => {
    const fetch = stubFetch({ all: null, groups: {}, channels: { "462": Date.now() - 120_000 } }, () => Response.json({ cancelled: true }));
    renderIt();
    expect(await screen.findByText(/Re-check queued 2m ago/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel the re-check of Arena Sports Golf" }));
    await waitFor(() => expect(writes(fetch)).toHaveLength(1));
    expect(writes(fetch)[0][0]).toBe("/api/refresh?scope=channel&channelId=462");
  });

  it("says so instead of offering a second request when its group is already queued", async () => {
    stubFetch({ all: null, groups: { "643": 1 }, channels: {} });
    renderIt();
    expect(await screen.findByText("Its group is queued for a re-check.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("backs out on Escape", async () => {
    const fetch = stubFetch({ all: null, groups: {}, channels: {} });
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: /re-check this channel/i }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /re-check this channel/i })).toHaveFocus();
    expect(writes(fetch)).toHaveLength(0);
  });
});
