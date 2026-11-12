import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FlakyResponse, FlakyStream } from "@/api/types";
import { FlakyPage } from "./FlakyPage";

const stream = (streamId: number, name: string, provider: string, over: Partial<FlakyStream> = {}): FlakyStream => ({
  streamId,
  name,
  provider,
  channelId: streamId * 10,
  channelName: `${name} channel`,
  status: "dead",
  probes: 12,
  flips: 4,
  brokenShare: 0.25,
  lastFlipAt: Date.now() - 3600_000,
  ...over,
});

const base: FlakyResponse = {
  enabled: true,
  range: "30d",
  from: 0,
  to: 1,
  since: Date.now() - 20 * 86_400_000,
  podiumHistory: true,
  streams: [stream(1, "Arena 1 HD", "Provider B"), stream(2, "Northgate News SD", "Provider C", { flips: 1, status: "alive", channelId: null })],
  flipping: 2,
  flaky: 1,
  probed: 40,
  providers: [
    { name: "Provider B", probed: 20, flaky: 1, share: 0.05 },
    { name: "Provider C", probed: 20, flaky: 0, share: 0 },
  ],
};

function renderIt(data: FlakyResponse = base) {
  const fetch = vi.fn(async (_url: string) => Response.json(data));
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FlakyPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("FlakyPage", () => {
  it("reads 30 days by default and lists streams worst first, linked to their channel", async () => {
    const fetch = renderIt();
    const list = await screen.findByRole("list", { name: "Streams that flipped" });
    expect(fetch.mock.calls[0][0]).toBe("/api/rostrum/flaky?range=30d");
    const [first, second] = within(list).getAllByRole("listitem");
    expect(within(first).getByText("Arena 1 HD")).toBeInTheDocument();
    expect(within(first).getByText(/4 flips · 12 probes · broken 25% of the time · Provider B/)).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "Arena 1 HD channel" })).toHaveAttribute("href", "/channels?channel=10");
    expect(within(first).getByText("now dead")).toBeInTheDocument();
    expect(within(second).queryByRole("link")).toBeNull();
    expect(screen.getByText("Podium's probe history, read every 5 minutes", { exact: false })).toBeInTheDocument();
  });

  it("shows each provider's flaky share, and the share overall", async () => {
    renderIt();
    const providers = await screen.findByRole("list", { name: "Flaky streams by provider" });
    expect(within(providers).getByText("5% flaky")).toBeInTheDocument();
    expect(within(providers).getByText("0% flaky")).toBeInTheDocument();
    expect(screen.getByText("3%")).toBeInTheDocument(); // 1 of 40
  });

  it("filters by stream, provider or channel", async () => {
    renderIt();
    await screen.findByRole("list", { name: "Streams that flipped" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Filter streams" }), "provider c");
    expect(screen.getByText("Streams that flipped · 1 of 2")).toBeInTheDocument();
    expect(screen.queryByText("Arena 1 HD")).toBeNull();
  });

  it("explains a Podium without probe history, and a log with nothing in range", async () => {
    renderIt({ ...base, podiumHistory: false });
    expect(await screen.findByText(/This Podium has no probe history/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("says why when history is off", async () => {
    renderIt({ ...base, enabled: false, reason: "History is off: set HISTORY_DB.", probed: 0, streams: [] });
    expect(await screen.findByText(/History is off: set HISTORY_DB/)).toBeInTheDocument();
  });
});
