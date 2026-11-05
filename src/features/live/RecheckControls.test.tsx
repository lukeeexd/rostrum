import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecheckControls } from "./RecheckControls";

function renderControls(queuedAt: number | null) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RecheckControls queuedAt={queuedAt} due={12} now={Date.now()} />
    </QueryClientProvider>,
  );
}

const fetchMock = vi.fn(async () => Response.json({ queued: true, scope: "the whole catalogue", forcedAt: 1 }));

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("RecheckControls", () => {
  it("asks for confirmation before queuing anything", async () => {
    vi.stubGlobal("fetch", fetchMock);
    renderControls(null);

    await userEvent.click(screen.getByRole("button", { name: /re-check everything/i }));
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /keep current verdicts/i }));
    expect(screen.queryByRole("button", { name: /queue re-check/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /re-check everything/i }));
    await userEvent.click(screen.getByRole("button", { name: /queue re-check/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/refresh");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"scope":"all"}');
  });

  it("offers cancel while a re-check is queued", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ cancelled: true, scope: "all" })));
    renderControls(Date.now() - 60_000);
    expect(screen.getByText(/12 streams still to go/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancel re-check/i }));
    const [url, init] = vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/refresh?scope=all");
    expect(init.method).toBe("DELETE");
  });

  it("shows why a queue failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "upstream_unreachable" }, { status: 502 })));
    renderControls(null);
    await userEvent.click(screen.getByRole("button", { name: /re-check everything/i }));
    await userEvent.click(screen.getByRole("button", { name: /queue re-check/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Podium is unreachable from Rostrum.");
  });
});
