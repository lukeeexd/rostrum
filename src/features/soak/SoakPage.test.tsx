import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SoakRecord, SoaksResponse } from "@/api/types";
import { soakVerdict } from "@/lib/soak";
import { summariseSoaks } from "../../../server/soak-summary";
import { SoakPage } from "./SoakPage";

const now = Date.now();
const record = (over: Partial<SoakRecord>): SoakRecord => {
  const r = {
    streamId: 1,
    completedAt: now - 60_000,
    name: "Arena Sports 1",
    provider: "Provider A",
    channelId: 10,
    channelName: "Arena Sports",
    heldMs: 180_000,
    drops: 0,
    failedDials: 0,
    unreachable: false,
    ...over,
  };
  return { ...r, verdict: soakVerdict(r) };
};

const response = (records: SoakRecord[], over: Partial<SoaksResponse> = {}): SoaksResponse => ({
  enabled: true,
  range: "24h",
  from: now - 86_400_000,
  to: now,
  since: records.at(-1)?.completedAt ?? null,
  ...summariseSoaks(records),
  ...over,
});

function renderWith(body: SoaksResponse) {
  const fetch = vi.fn(async (_url: string) => Response.json(body));
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SoakPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("SoakPage", () => {
  const records = [
    record({ streamId: 4, name: "Northgate News", provider: "Provider B", channelId: 12, channelName: "Northgate News", unreachable: true, failedDials: 3, heldMs: 1000 }),
    record({ streamId: 3, name: "Arena Sports 1 C", drops: 7, heldMs: 112_000, completedAt: now - 120_000 }),
    record({ streamId: 1, completedAt: now - 180_000 }),
    record({ streamId: 2, provider: "Provider C", name: "Arena Sports 1 B", completedAt: now - 240_000 }),
  ];

  it("shows totals, providers, the streams that were not clean, and the latest soaks", async () => {
    const fetch = renderWith(response(records));
    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(fetch.mock.calls[0][0]).toBe("/api/rostrum/soaks?range=24h");

    const providers = screen.getByRole("grid", { name: "Soak results by provider" });
    expect(within(providers).getAllByRole("row")).toHaveLength(4); // header + three providers

    const failing = screen.getByText(/Streams that were not clean · 2/).closest("section")!;
    const items = within(failing).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      // Each failed once; the one that dropped seven times ranks first.
      expect.stringContaining("Arena Sports 1 C"),
      expect.stringContaining("Northgate News"),
    ]);
    expect(within(items[0]).getByText(/1 of 1 soak not clean · 7 drops/)).toBeInTheDocument();
    expect(within(items[1]).getByRole("link", { name: "Northgate News" })).toHaveAttribute("href", "/channels?channel=12");

    const latest = screen.getByRole("grid", { name: "Latest soak results" });
    expect(within(latest).getAllByRole("row")).toHaveLength(5);
  });

  it("asks for another range when one is picked", async () => {
    const fetch = renderWith(response(records));
    await screen.findByText("50%");
    await userEvent.click(screen.getByRole("radio", { name: "7 days" }));
    expect(fetch.mock.calls.at(-1)![0]).toBe("/api/rostrum/soaks?range=7d");
  });

  it("says when nothing finished in the range", async () => {
    renderWith(response([], { since: now - 3 * 86_400_000 }));
    expect(await screen.findByText(/No soak tests finished in the last 24 hours/)).toBeInTheDocument();
  });

  it("explains how to turn the log on", async () => {
    renderWith(response([], { enabled: false, reason: "History is off: set HISTORY_DB to a writable file." }));
    expect(await screen.findByText(/History is off/)).toBeInTheDocument();
  });
});
