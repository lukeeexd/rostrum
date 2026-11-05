import { createBrowserRouter } from "react-router";
import { ChannelsPage } from "@/features/channels/ChannelsPage";
import { DeadPage } from "@/features/dead/DeadPage";
import { HistoryPage } from "@/features/history/HistoryPage";
import { TrendsPage } from "@/features/trends/TrendsPage";
import { LivePage } from "@/features/live/LivePage";
import { OverviewPage } from "@/features/overview/OverviewPage";
import { ProvidersPage } from "@/features/providers/ProvidersPage";
import { ProblemsPage } from "@/features/problems/ProblemsPage";
import { SoakPage } from "@/features/soak/SoakPage";
import { StreamsPage } from "@/features/streams/StreamsPage";
import { AppShell } from "./AppShell";
import { RouteError } from "./RouteError";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    // A pathless layout route catches page errors below the shell, so the nav stays usable.
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: "live", element: <LivePage /> },
          { path: "history", element: <HistoryPage /> },
          { path: "trends", element: <TrendsPage /> },
          { path: "channels", element: <ChannelsPage /> },
          { path: "streams", element: <StreamsPage /> },
          { path: "problems", element: <ProblemsPage /> },
          { path: "soak", element: <SoakPage /> },
          { path: "providers", element: <ProvidersPage /> },
          { path: "dead", element: <DeadPage /> },
          { path: "*", element: <OverviewPage /> },
        ],
      },
    ],
  },
]);
