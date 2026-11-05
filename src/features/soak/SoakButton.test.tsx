import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SoakTarget } from "@/api/types";
import { queuedText, SoakButton } from "./SoakButton";

type Call = [string, RequestInit | undefined];

/** Serves the soak queue (with `queued` stream ids) and answers writes. */
function stubFetch(queued: number[], write: () => Response = () => Response.json({ status: "queued", label: "x", requested: 3, queued: 2, skippedDead: 1, source: "manual" })) {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
    !init?.method || init.method === "GET" ? Response.json({ total: queued.length, manual: queued.length, now: 0, sweep: 0, streamIds: queued }) : write(),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const writes = (fetch: ReturnType<typeof stubFetch>) => (fetch.mock.calls as unknown as Call[]).filter(([, init]) => init?.method && init.method !== "GET");

function renderIt(target: SoakTarget, compact = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SoakButton target={target} name="Arena Sports Golf" compact={compact} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("SoakButton", () => {
  it("asks before queuing a channel soak, then says what Podium queued", async () => {
    const fetch = stubFetch([]);
    renderIt({ scope: "channel", id: 462 });
    await userEvent.click(screen.getByRole("button", { name: /soak this channel/i }));
    expect(writes(fetch)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Queue a soak of Arena Sports Golf" }));
    await waitFor(() => expect(writes(fetch)).toHaveLength(1));
    const [url, init] = writes(fetch)[0];
    expect([url, init?.method, init?.body]).toEqual(["/api/soak", "POST", '{"scope":"channel","id":462}']);
    expect(await screen.findByText(/Queued 2 streams, 1 already waiting, 1 dead one left out/)).toBeInTheDocument();
  });

  it("backs out without queuing", async () => {
    const fetch = stubFetch([]);
    renderIt({ scope: "stream", id: 8135 }, true);
    await userEvent.click(screen.getByRole("button", { name: "Soak Arena Sports Golf…" }));
    expect(screen.getByRole("status")).toHaveTextContent("Soak?");
    // Focus moves to the confirmation, then back to the control after backing out.
    expect(screen.getByRole("button", { name: "Queue a soak of Arena Sports Golf" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Keep: do not soak Arena Sports Golf" }));
    expect(screen.getByRole("button", { name: "Soak Arena Sports Golf…" })).toHaveFocus();
    expect(writes(fetch)).toHaveLength(0);
  });

  it("backs out on Escape, putting focus back on the control", async () => {
    const fetch = stubFetch([]);
    renderIt({ scope: "stream", id: 8135 }, true);
    await userEvent.click(screen.getByRole("button", { name: "Soak Arena Sports Golf…" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Soak Arena Sports Golf…" })).toHaveFocus();
    expect(writes(fetch)).toHaveLength(0);
  });

  it("shows a queued stream and cancels just that stream", async () => {
    const fetch = stubFetch([8135], () => Response.json({ status: "cleared", cleared: 1 }));
    renderIt({ scope: "stream", id: 8135 }, true);
    await userEvent.click(await screen.findByRole("button", { name: "Cancel the soak of Arena Sports Golf" }));
    await waitFor(() => expect(writes(fetch)).toHaveLength(1));
    const [url, init] = writes(fetch)[0];
    expect([url, init?.method]).toEqual(["/api/soak?streamId=8135", "DELETE"]);
  });

  it("shows Podium's reason when it refuses", async () => {
    stubFetch([], () => Response.json({ error: "every stream on channel 462 was dead at its last probe" }, { status: 404 }));
    renderIt({ scope: "channel", id: 462 });
    await userEvent.click(screen.getByRole("button", { name: /soak this channel/i }));
    await userEvent.click(screen.getByRole("button", { name: "Queue a soak of Arena Sports Golf" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("every stream on channel 462 was dead at its last probe");
  });
});

describe("SoakButton after queuing a stream", () => {
  it("shows it as queued from Podium's answer when the queue cannot be read again", async () => {
    let queued = false;
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        queued = true;
        return Response.json({ status: "queued", label: "stream 8135", requested: 1, queued: 1, skippedDead: 0, source: "manual" });
      }
      // The first read works; once queued, reading the queue fails.
      return queued ? Response.json({ error: "upstream_unreachable" }, { status: 502 }) : Response.json({ total: 0, manual: 0, now: 0, sweep: 0, streamIds: [] });
    });
    vi.stubGlobal("fetch", fetch);
    renderIt({ scope: "stream", id: 8135 }, true);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Soak Arena Sports Golf…" }));
    await userEvent.click(screen.getByRole("button", { name: "Queue a soak of Arena Sports Golf" }));
    expect(queued).toBe(true);
    expect(await screen.findByText("Soak queued")).toBeInTheDocument();
  });
});

describe("queuedText", () => {
  it("reads naturally", () => {
    expect(queuedText({ requested: 1, queued: 1, skippedDead: 0 })).toBe("Queued 1 stream; Podium runs them when there is room and nobody is watching.");
  });
});
