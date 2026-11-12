import {
  RiAlarmWarningLine,
  RiBarChartGroupedLine,
  RiDashboardLine,
  RiHeartPulseLine,
  RiHistoryLine,
  RiLineChartLine,
  RiListCheck2,
  RiPulseLine,
  RiSearchLine,
  RiTimerLine,
  RiSkullLine,
} from "@remixicon/react";

export const NAV = [
  { to: "/", label: "Overview", icon: RiDashboardLine, title: "Overview" },
  { to: "/live", label: "Live pass", icon: RiHeartPulseLine, title: "Live pass" },
  { to: "/history", label: "History", icon: RiHistoryLine, title: "History" },
  { to: "/trends", label: "Trends", icon: RiLineChartLine, title: "Trends" },
  { to: "/channels", label: "Channels", icon: RiListCheck2, title: "Channels" },
  { to: "/streams", label: "Streams", icon: RiSearchLine, title: "Streams" },
  { to: "/problems", label: "Problem channels", icon: RiAlarmWarningLine, title: "Problem channels" },
  { to: "/flaky", label: "Flaky streams", icon: RiPulseLine, title: "Flaky streams" },
  { to: "/soak", label: "Soak tests", icon: RiTimerLine, title: "Soak tests" },
  { to: "/providers", label: "Providers", icon: RiBarChartGroupedLine, title: "Providers" },
  { to: "/dead", label: "Dead & black", icon: RiSkullLine, title: "Dead & black streams" },
] as const;
