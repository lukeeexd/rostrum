import { NavLink, Outlet, useLocation } from "react-router";
import { useHealth, useProgress, useWorker } from "@/api/queries";
import { ToneChip } from "@/components/shared/tone";
import { isActivePhase, PHASE_LABEL, PHASE_TONE } from "@/lib/phase";
import { WORKER_LABEL, WORKER_TONE } from "@/lib/worker";
import { cx } from "@/utils/cx";
import { NAV } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

/**
 * BoardUI's page frame: a floating sidebar on wide screens (a scrolling tab
 * row on narrow ones), and content filling the rest of the width, with the
 * page heading and live status on top. (BoardUI caps content at 1300px; a
 * dashboard left open on a big screen should use the space instead.)
 */
export function AppShell() {
  const { pathname } = useLocation();
  const path = pathname.replace(/(.)\/+$/, "$1"); // "/live/" is the Live page too
  const page = NAV.find((n) => n.to === path) ?? NAV[0];

  return (
    <div className="flex h-dvh w-full gap-4 overflow-hidden bg-background-full p-3">
      <aside className="hidden w-[232px] shrink-0 flex-col justify-between rounded-3xl border border-border-button-white bg-background-secondary-default p-3 shadow-sidebar lg:flex">
        <div className="flex flex-col gap-4">
          <Brand />
          <nav aria-label="Main" className="flex flex-col gap-1">
            {NAV.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-3 px-1">
          <ThemeToggle />
          <Version />
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden sm:pt-3">
        <div className="flex w-full flex-col gap-4 pb-6">
          <header className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 lg:hidden">
              <Brand />
              <ThemeToggle />
            </div>
            <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:hidden">
              {NAV.map((item) => (
                <NavItem key={item.to} {...item} compact />
              ))}
            </nav>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h1 className="px-1 text-title-2-medium text-text-primary">{page.title}</h1>
              <StatusPills />
            </div>
          </header>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-1">
      <img src="/favicon.svg" alt="" className="size-7" />
      <span className="text-headline-semibold text-text-primary">Rostrum</span>
    </div>
  );
}

function NavItem({ to, label, icon: Icon, compact }: (typeof NAV)[number] & { compact?: boolean }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cx(
          "flex shrink-0 items-center gap-2 rounded-2lg p-2 text-body-medium whitespace-nowrap outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          compact && "pe-3",
          isActive
            ? "bg-linear-to-b from-accent-500 to-accent-600 text-white shadow-nav-selected"
            : "text-text-secondary hover:bg-background-secondary-hover",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cx("size-5 shrink-0", isActive ? "text-white" : "text-foreground-icon-secondary")} aria-hidden />
          {label}
        </>
      )}
    </NavLink>
  );
}

/** Worker + current phase, visible on every page. */
function StatusPills() {
  const progress = useProgress();
  const { worker, unreachable } = useWorker();
  const phase = progress.data?.progress.phase;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      {unreachable ? (
        <ToneChip tone="bad" dot>
          Podium unreachable
        </ToneChip>
      ) : (
        <>
          {worker && (
            <ToneChip tone={WORKER_TONE[worker]} dot>
              {WORKER_LABEL[worker]}
            </ToneChip>
          )}
          {phase && !progress.data?.stale && (
            <ToneChip tone={PHASE_TONE[phase]} dot pulse={isActivePhase(phase)}>
              {PHASE_LABEL[phase]}
            </ToneChip>
          )}
        </>
      )}
    </div>
  );
}

function Version() {
  const { data } = useHealth();
  return (
    <p className="text-caption-1-medium text-text-tertiary">
      Rostrum {__APP_VERSION__} · Podium {data?.version ?? "…"}
    </p>
  );
}
