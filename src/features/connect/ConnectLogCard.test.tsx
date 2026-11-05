import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectEventsResponse, ConnectLogResponse } from "@/api/types";
import { summariseConnect } from "../../../server/connect-summary";
import { ConnectLogCard } from "./ConnectLogCard";

const now = Date.now();
const events = [
  {
    id: 2,
    event: "stream_switch",
    reason: "health_monitor",
    receivedAt: now - 60_000,
    accepted: true,
    error: null,
    channelName: "Arena Sports Golf",
    channelId: 40,
    from: { id: 8135, name: "Golf HD", provider: "Provider B" },
    to: { id: 7653, name: "Golf FHD", provider: "Provider A" },
  },
];

const log = (over: Partial<ConnectLogResponse> = {}): ConnectLogResponse => ({
  enabled: true,
  range: "7d",
  from: now - 7 * 86_400_000,
  to: now,
  since: now - 86_400_000,
  ...summariseConnect(events),
  ...over,
});

function renderWith(reply: (url: string) => unknown) {
  const fetch = vi.fn(async (url: string) => Response.json(reply(url)));
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ConnectLogCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("ConnectLogCard", () => {
  it("shows the log's events, then the rankings by tab and range", async () => {
    const fetch = renderWith(() => log());
    expect(await screen.findByText("Golf HD · Provider B")).toBeInTheDocument();
    expect(fetch.mock.calls[0][0]).toBe("/api/rostrum/connect-log?range=7d");

    await userEvent.click(screen.getByRole("radio", { name: "Streams" }));
    expect(screen.getByRole("list", { name: "Streams switched away from most" })).toHaveTextContent("1 switch");

    await userEvent.click(screen.getByRole("radio", { name: "Providers" }));
    expect(screen.getByRole("grid", { name: "Connect switches by provider" })).toHaveTextContent("Provider B");

    await userEvent.click(screen.getByRole("radio", { name: "30 days" }));
    expect(fetch.mock.calls.at(-1)![0]).toBe("/api/rostrum/connect-log?range=30d");
  });

  it("falls back to Podium's own 25 without a history database", async () => {
    const recent: ConnectEventsResponse = {
      status: { state: "listening", enabled: true, pending: 0, summary: { accepted: 1, rejected: 0, lastReceivedAt: null, lastSyncAt: null, syncError: null } },
      events,
      named: true,
    };
    renderWith((url) => (url.includes("connect-log") ? log({ enabled: false, reason: "History is off." }) : recent));
    expect(await screen.findByText(/Podium keeps the last 25/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Range" })).toBeNull();
    expect(screen.getByText("Golf HD · Provider B")).toBeInTheDocument();
  });
});
