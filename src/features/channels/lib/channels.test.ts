import { describe, expect, it } from "vitest";
import type { ChannelGroup, ChannelStream, StreamMedia } from "@/api/types";
import { filterGroups, groupOf } from "./groups";
import { formatKbps } from "@/lib/format";
import { formatAudio, formatAudioCodec, formatChannels, formatCodec, formatFps, formatResolution, formatSampleRate } from "./media";
import { streamStatus } from "@/lib/streamStatus";

const media = (over: Partial<StreamMedia> = {}): StreamMedia => ({
  source: "dispatcharr", width: 1920, height: 1080, fps: 25, scanType: "progressive", videoCodec: "h264",
  videoBitrateKbps: 4509, hdr: "SDR", audioCodec: "aac", audioChannels: 2, channelLayout: "stereo",
  audioBitrateKbps: 128, sampleRate: 48000, ...over,
});

const verdict = { probedAt: 1, alive: true, black: false, lowBitrate: null, bitrateKbps: 4000 };

describe("streamStatus", () => {
  it.each<[Partial<ChannelStream>, string]>([
    [{ probedAt: null }, "unprobed"],
    [{ alive: null }, "unprobed"],
    [{ alive: false, black: true }, "dead"],
    [{ black: true }, "black"],
    [{ bitrateKbps: 499 }, "low_bitrate"],
    [{ bitrateKbps: 500 }, "alive"],
    [{ bitrateKbps: 200, lowBitrate: false }, "alive"],
    [{ bitrateKbps: 9000, lowBitrate: true }, "low_bitrate"],
    [{ bitrateKbps: null }, "alive"],
    [{}, "alive"],
  ])("%o → %s", (over, status) => expect(streamStatus({ ...verdict, ...over })).toBe(status));
});

describe("formatters", () => {
  it("formats resolution, marking interlaced and falling back to Podium's height", () => {
    expect(formatResolution({ height: 1080, media: media() })).toBe("1920×1080");
    expect(formatResolution({ height: 1080, media: media({ scanType: "interlaced" }) })).toBe("1920×1080i");
    expect(formatResolution({ height: 576, media: null })).toBe("576p");
    expect(formatResolution({ height: null, media: null })).toBe("—");
  });

  it.each([
    [25, "25"],
    [29.97, "29.97"],
    [59.940059, "59.94"],
    [0, "—"],
    [null, "—"],
  ])("fps %s → %s", (fps, out) => expect(formatFps(fps)).toBe(out));

  it.each([
    [850, "850 kbps"],
    [999, "999 kbps"],
    [1000, "1.0 Mbps"],
    [4509, "4.5 Mbps"],
    [11511.4, "11.5 Mbps"],
    [null, "—"],
  ])("bitrate %s → %s", (kbps, out) => expect(formatKbps(kbps)).toBe(out));

  it.each([
    ["h264", "H.264"],
    ["mpeg2video", "MPEG-2"],
    ["HEVC", "HEVC"],
    ["prores", "PRORES"],
    [null, "—"],
  ])("codec %s → %s", (codec, out) => expect(formatCodec(codec)).toBe(out));

  it("formats the separate audio columns", () => {
    expect(formatAudioCodec("eac3")).toBe("E-AC-3");
    expect(formatAudioCodec("flac")).toBe("FLAC");
    expect(formatAudioCodec(null)).toBe("—");
    expect(formatChannels(media({ channelLayout: "5.1(side)" }))).toBe("5.1");
    expect(formatChannels(media({ channelLayout: null, audioChannels: 6 }))).toBe("6ch");
    expect(formatChannels(null)).toBe("—");
    expect(formatSampleRate(44100)).toBe("44.1 kHz");
    expect(formatSampleRate(null)).toBe("—");
  });

  it("formats audio from whatever parts Podium reported", () => {
    expect(formatAudio(media())).toBe("AAC 2.0 · 128 kbps · 48 kHz");
    expect(formatAudio(media({ audioCodec: "eac3", channelLayout: "5.1(side)", audioBitrateKbps: 384, sampleRate: 44100 }))).toBe(
      "E-AC-3 5.1 · 384 kbps · 44.1 kHz",
    );
    expect(formatAudio(media({ channelLayout: null, audioChannels: 6, audioBitrateKbps: null, sampleRate: null }))).toBe("AAC 6ch");
    expect(formatAudio(media({ audioCodec: null, channelLayout: null, audioChannels: null, audioBitrateKbps: null, sampleRate: null }))).toBe("—");
    expect(formatAudio(null)).toBe("—");
    expect(formatAudio(media({ channelLayout: "quad", audioBitrateKbps: null, sampleRate: null }))).toBe("AAC quad");
  });
});

describe("groups", () => {
  const groups: ChannelGroup[] = [
    { id: 1, name: "Sports", channels: [{ id: 10, name: "Arena Sports F1", assigned: 3 }, { id: 11, name: "Harbour 1", assigned: 2 }] },
    { id: 2, name: "Movies", channels: [{ id: 20, name: "Arena Cinema", assigned: 4 }] },
  ];

  it("keeps whole groups whose name matches, and only matching channels otherwise", () => {
    expect(filterGroups(groups, "")).toEqual(groups);
    expect(filterGroups(groups, "   ")).toEqual(groups);
    expect(filterGroups(groups, "movies")).toEqual([groups[1]]);
    expect(filterGroups(groups, "ARENA").map((g) => g.channels.map((c) => c.id))).toEqual([[10], [20]]);
    expect(filterGroups(groups, "zz")).toEqual([]);
  });

  it("finds a channel's group", () => {
    expect(groupOf(groups, 20)?.id).toBe(2);
    expect(groupOf(groups, 99)).toBeUndefined();
  });
});
