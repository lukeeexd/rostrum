import type { ReactNode } from "react";
import type { ChannelStream } from "@/api/types";
import { ToneChip } from "@/components/shared/tone";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table/table";
import { formatAgo, formatKbps } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE, streamStatus } from "@/lib/streamStatus";
import {
  formatAudio,
  formatAudioCodec,
  formatChannels,
  formatCodec,
  formatFps,
  formatResolution,
  formatSampleRate,
} from "./lib/media";
import { formatSoak, soakNeedsAttention } from "@/lib/soak";
import { SoakButton } from "@/features/soak/SoakButton";
import { isFlaky } from "@/lib/flips";

interface Column {
  id: string;
  label: string;
  /** Classes for header and cells; `num` right-aligns. */
  className?: string;
  rowHeader?: boolean;
  cell: (s: ChannelStream, ctx: CellContext) => ReactNode;
}

interface CellContext {
  now: number;
  /** Flips over the panel's history range, by stream id; absent without a probe log. */
  flips?: ReadonlyMap<number, number>;
}

const twoLines = (top: string, bottom?: string | null) => (
  <span className="flex min-w-0 flex-col">
    <span className="truncate text-text-primary" title={top}>
      {top}
    </span>
    {bottom && <span className="truncate text-caption-1-medium text-text-tertiary">{bottom}</span>}
  </span>
);

const COLUMNS = {
  rank: { id: "rank", label: "#", className: "num w-10 text-text-tertiary", cell: (s) => s.rank },
  status: {
    id: "status",
    label: "Status",
    className: "w-32",
    cell: (s) => {
      const status = streamStatus(s);
      return <ToneChip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</ToneChip>;
    },
  },
  streamWithProvider: {
    id: "stream",
    label: "Stream",
    rowHeader: true,
    cell: (s) => twoLines(s.name, [s.provider, s.providerGroup].filter(Boolean).join(" · ")),
  },
  stream: { id: "stream", label: "Stream", className: "w-72", rowHeader: true, cell: (s) => twoLines(s.name) },
  provider: { id: "provider", label: "Provider", className: "w-56", cell: (s) => twoLines(s.provider, s.providerGroup) },
  resolution: { id: "resolution", label: "Resolution", className: "num w-28 whitespace-nowrap", cell: (s) => formatResolution(s) },
  fps: { id: "fps", label: "FPS", className: "num w-16", cell: (s) => formatFps(s.media?.fps) },
  bitrate: {
    id: "bitrate",
    label: "Bitrate",
    className: "num w-24 whitespace-nowrap",
    cell: (s) => formatKbps(s.media?.videoBitrateKbps ?? s.bitrateKbps),
  },
  video: { id: "video", label: "Video", className: "w-24 ps-6! whitespace-nowrap", cell: (s) => formatCodec(s.media?.videoCodec) },
  hdr: { id: "hdr", label: "HDR", className: "w-16 whitespace-nowrap", cell: (s) => s.media?.hdr ?? "—" },
  audio: { id: "audio", label: "Audio", className: "whitespace-nowrap", cell: (s) => formatAudio(s.media) },
  audioCodec: { id: "audio-codec", label: "Audio", className: "w-24 whitespace-nowrap", cell: (s) => formatAudioCodec(s.media?.audioCodec) },
  channels: { id: "channels", label: "Ch", className: "num w-14", cell: (s) => formatChannels(s.media) },
  audioBitrate: {
    id: "audio-bitrate",
    label: "Audio rate",
    className: "num w-24 whitespace-nowrap",
    cell: (s) => formatKbps(s.media?.audioBitrateKbps),
  },
  sampleRate: { id: "sample-rate", label: "Sample", className: "num w-20 whitespace-nowrap", cell: (s) => formatSampleRate(s.media?.sampleRate) },
  soak: {
    id: "soak",
    label: "Soak",
    className: "w-56 ps-6! whitespace-nowrap",
    cell: (s) => (
      <span className="flex flex-col items-start gap-0.5">
        <span className={soakNeedsAttention(s.soak) ? "text-status-yellow-text" : undefined}>{formatSoak(s.soak)}</span>
        <SoakButton target={{ scope: "stream", id: s.id }} name={s.name || `stream ${s.id}`} compact />
      </span>
    ),
  },
  probed: {
    id: "probed",
    label: "Probed",
    className: "num w-28 whitespace-nowrap text-text-secondary",
    cell: (s, { now }) => (s.probedAt ? formatAgo(s.probedAt, now) : "never"),
  },
  flips: {
    id: "flips",
    label: "Flips",
    className: "num w-16",
    // From Rostrum's probe log over the history range below; a dash when there is no log.
    cell: (s, { flips }) => {
      const n = flips?.get(s.id);
      return n == null ? "—" : <span className={isFlaky(n) ? "font-semibold text-status-yellow-text" : undefined}>{n}</span>;
    },
  },
} satisfies Record<string, Column>;

const C = COLUMNS;
/** Fits a narrow pane: provider under the name, audio in one cell. */
const COMPACT: Column[] = [C.rank, C.status, C.streamWithProvider, C.resolution, C.fps, C.bitrate, C.video, C.hdr, C.audio, C.soak, C.probed, C.flips];
/** Wide screens: every measurement in its own aligned column instead of empty gutters. */
const FULL: Column[] = [
  C.rank, C.status, C.stream, C.provider, C.resolution, C.fps, C.bitrate, C.video, C.hdr,
  C.audioCodec, C.channels, C.audioBitrate, C.sampleRate, C.soak, C.probed, C.flips,
];

/**
 * A channel's streams in Dispatcharr's order, with what Podium measured for
 * each, and (`flips`, by stream id) how often each flipped over the range.
 */
export function StreamsTable({
  streams,
  now,
  wide,
  flips,
}: {
  streams: ChannelStream[];
  now: number;
  wide: boolean;
  flips?: ReadonlyMap<number, number>;
}) {
  const columns = wide ? FULL : COMPACT;
  return (
    // Remount when the layout flips: React Aria keeps built rows, and old
    // rows with the other layout's cell count would not match the header.
    <Table key={wide ? "full" : "compact"} aria-label="Streams on this channel" size="sm">
      <TableHeader columns={columns}>
        {(col) => (
          <TableColumn id={col.id} isRowHeader={col.rowHeader} className={col.className}>
            {col.label}
          </TableColumn>
        )}
      </TableHeader>
      <TableBody items={streams}>
        {(s) => (
          <TableRow columns={columns}>
            {(col) => <TableCell className={col.className}>{col.cell(s, { now, flips })}</TableCell>}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
