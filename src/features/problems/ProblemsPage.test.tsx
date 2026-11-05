import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProblemChannel, ProblemChannelsResponse } from "@/api/types";
import { ProblemsPage } from "./ProblemsPage";

const channel = (id: number, name: string, group: string, over: Partial<ProblemChannel> = {}): ProblemChannel => ({
  id,
  name,
  group,
  groupId: 1,
  streams: 2,
  healthy: 0,
  first: { id: id * 10, name: `${name} HD`, provider: "Provider A", status: "dead" },
  providers: ["Provider A", "Provider B"],
  ...over,
});

const data: ProblemChannelsResponse = {
  checkedAt: Date.now() - 60_000,
  channels: 10,
  problems: {
    noHealthy: [channel(1, "Rovers v United", "Tennis"), channel(2, "Athletic v City", "Tennis")],
    badFirst: [],
    oneProvider: [channel(3, "Arena Sports Golf", "Sport", { healthy: 2, providers: ["Provider A"], first: { id: 30, name: "Golf", provider: "Provider A", status: "alive" } })],
    empty: [channel(4, "Spare", "Misc", { streams: 0, first: null, providers: [] })],
    unmeasured: [channel(5, "New event", "Events")],
  },
};

function renderIt() {
  // The page's own data; the re-check and soak controls on each row read their queues too.
  const reply = (url: string) =>
    url.startsWith("/api/refresh") ? { all: null, groups: {} } : url.startsWith("/api/soak") ? { total: 0, manual: 0, now: 0, sweep: 0, streamIds: [] } : data;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(reply(url))));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProblemsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("ProblemsPage", () => {
  it("lists each section with linked channels, what is served first, and the providers", async () => {
    renderIt();
    expect(await screen.findByText(/4 of 10 channels need a look/)).toBeInTheDocument();
    const none = screen.getByRole("list", { name: "No playable stream" });
    const [first] = within(none).getAllByRole("listitem").filter((li) => li.parentElement === none);
    expect(within(first).getByRole("link", { name: "Rovers v United" })).toHaveAttribute("href", "/channels?channel=1");
    expect(within(first).getByText("0 of 2 playable")).toBeInTheDocument();
    expect(within(first).getByText("Rovers v United HD · Provider A")).toBeInTheDocument();
    expect(within(first).getByText("dead")).toBeInTheDocument();
    expect(screen.getByText("Dead or black served first · 0")).toBeInTheDocument();
  });

  it("filters by channel or group, and keeps the unmeasured ones folded until asked", async () => {
    renderIt();
    await screen.findByText(/need a look/);
    await userEvent.type(screen.getByRole("searchbox", { name: "Filter channels" }), "golf");
    expect(screen.getByText("No playable stream · 0 of 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Arena Sports Golf" })).toBeInTheDocument();

    await userEvent.clear(screen.getByRole("searchbox", { name: "Filter channels" }));
    expect(screen.queryByRole("link", { name: "New event" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show not measured yet" }));
    expect(screen.getByRole("button", { name: "Hide not measured yet" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "New event" })).toBeInTheDocument();
  });
});
