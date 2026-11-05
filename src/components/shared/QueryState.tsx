import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/buttons/button";
import { useNow } from "@/hooks/useNow";
import { formatAgo } from "@/lib/format";
import { Notice } from "./Notice";

/** A card-sized placeholder while a query first loads. */
export function CardSkeleton() {
  return <div className="h-24 animate-pulse rounded-2lg bg-background-inner-default" />;
}

/**
 * Loading / error / data for one query. When a refetch fails but earlier
 * data exists, the data stays on screen under a "showing data from …" banner
 * rather than vanishing, since a monitor going blank is worse than a stale one.
 */
export function QueryState<T>({
  query,
  children,
  skeleton,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
}) {
  const now = useNow(5000);
  if (query.data === undefined) {
    if (query.isError) {
      return (
        <Notice
          tone="bad"
          action={
            <Button variant="secondary" size="xs" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        >
          {query.error.message}
        </Notice>
      );
    }
    return skeleton ?? <Skeleton />;
  }
  return (
    <>
      {query.isError && (
        <Notice tone="warn">
          {query.error.message} Showing data from {formatAgo(query.dataUpdatedAt, now)}.
        </Notice>
      )}
      {children(query.data)}
    </>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[124px] animate-pulse rounded-2xl bg-background-secondary-default" />
        ))}
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-2xl bg-background-secondary-default" />
      ))}
    </div>
  );
}
