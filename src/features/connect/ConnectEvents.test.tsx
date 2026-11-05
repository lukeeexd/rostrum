import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { ConnectEvent } from "@/api/types";
import { ConnectEventList } from "./ConnectEvents";

const now = 1_000_000;
const events: ConnectEvent[] = [
  {
    id: 2,
    event: "stream_switch",
    reason: "health_monitor",
    receivedAt: now - 9 * 60_000,
    accepted: true,
    error: null,
    channelName: "Arena Sports Golf",
    channelId: 40,
    from: { id: 8135, name: "Arena Sports Golf HD", provider: "Provider A" },
    to: { id: 7653, name: null, provider: null },
  },
  {
    id: 1,
    event: "channel_error",
    reason: "",
    receivedAt: now - 60 * 60_000,
    accepted: false,
    error: "bad payload",
    channelName: "Gone",
    channelId: null,
    from: { id: 9, name: "Old Stream", provider: "Provider C" },
    to: null,
  },
];

describe("ConnectEventList", () => {
  it("shows the channel, the switch with names (or ids), the reason and rejections", () => {
    render(
      <MemoryRouter>
        <ConnectEventList events={events} now={now} />
      </MemoryRouter>,
    );
    const [switched, errored] = screen.getAllByRole("listitem");

    expect(within(switched).getByRole("link", { name: "Arena Sports Golf" })).toHaveAttribute("href", "/channels?channel=40");
    expect(within(switched).getByText("Health monitor")).toBeInTheDocument();
    expect(within(switched).getByText("Arena Sports Golf HD · Provider A")).toBeInTheDocument();
    expect(within(switched).getByText("switched to")).toHaveClass("sr-only");
    expect(within(switched).getByText("stream 7653")).toBeInTheDocument();
    expect(within(switched).getByText("9m ago")).toBeInTheDocument();
    expect(within(switched).queryByText("Rejected")).toBeNull();

    expect(within(errored).queryByRole("link")).toBeNull();
    expect(within(errored).getByText("Channel error")).toBeInTheDocument();
    expect(within(errored).getByText("Rejected")).toBeInTheDocument();
    expect(within(errored).getByText("failed")).toBeInTheDocument();
    expect(within(errored).getByText("bad payload")).toBeInTheDocument();
  });
});
