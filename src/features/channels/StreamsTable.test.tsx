import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelStream } from "@/api/types";
import { StreamsTable } from "./StreamsTable";

const stream = (id: number): ChannelStream => ({
  id, rank: id, name: `Stream ${id}`, provider: "Provider A", providerGroup: "Group 1", probedAt: 1, alive: true,
  black: false, lowBitrate: null, height: 1080, bitrateKbps: 4500,
  media: {
    source: "dispatcharr", width: 1920, height: 1080, fps: 50, scanType: "progressive", videoCodec: "h264",
    videoBitrateKbps: 4500, hdr: "SDR", audioCodec: "eac3", audioChannels: 6, channelLayout: "5.1",
    audioBitrateKbps: 384, sampleRate: 48000,
  },
  soak: id === 1 ? { completedAt: 1, heldMs: 90_000, drops: 2, failedDials: 0, unreachable: false } : null,
});

/** The Soak cell's button reads the soak queue, so the table needs a query client. */
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => Response.json({ total: 0, manual: 0, now: 0, sweep: 0, streamIds: [] }))));
afterEach(() => vi.unstubAllGlobals());

describe("StreamsTable", () => {
  it("switches between the compact and full layouts without breaking (regression)", () => {
    const streams = [stream(1), stream(2)];
    const { rerender } = render(<StreamsTable streams={streams} now={2} wide={false} />, { wrapper });
    expect(screen.getAllByRole("columnheader")).toHaveLength(12);
    expect(screen.getAllByText("E-AC-3 5.1 · 384 kbps · 48 kHz")).toHaveLength(2);

    rerender(<StreamsTable streams={streams} now={2} wide />);
    expect(screen.getAllByRole("columnheader")).toHaveLength(16);
    expect(screen.getAllByText("E-AC-3")).toHaveLength(2);
    expect(screen.getAllByText("48 kHz")).toHaveLength(2);

    rerender(<StreamsTable streams={streams} now={2} wide={false} />);
    expect(screen.getAllByRole("columnheader")).toHaveLength(12);
  });

  it("right-aligns the numeric columns", () => {
    render(<StreamsTable streams={[stream(1)]} now={2} wide />, { wrapper });
    const num = screen.getAllByRole("columnheader").filter((h) => h.classList.contains("num")).map((h) => h.textContent);
    expect(num).toEqual(["#", "Resolution", "FPS", "Bitrate", "Ch", "Audio rate", "Sample", "Probed", "Flips"]);
  });
});

describe("StreamsTable flips", () => {
  it("shows each stream's flips over the history range, marking flaky ones, and a dash without a log", () => {
    render(<StreamsTable streams={[stream(1), stream(2), stream(3)]} now={2} wide={false} flips={new Map([[1, 3], [2, 0]])} />, { wrapper });
    const cells = screen.getAllByRole("row").slice(1).map((r) => r.lastElementChild!);
    expect(cells.map((c) => c.textContent)).toEqual(["3", "0", "—"]);
    expect(cells[0].querySelector(".font-semibold")).not.toBeNull();
  });
});
