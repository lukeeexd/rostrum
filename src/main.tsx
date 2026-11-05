import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./app/router";
import { ThemeProvider } from "./hooks/useTheme";
import { DirectionProvider } from "./components/ui/foundations/direction";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchIntervalInBackground: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DirectionProvider locale={navigator.language || "en-US"}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ThemeProvider>
    </DirectionProvider>
  </StrictMode>,
);
