import { useState, type ReactNode } from "react";
import { ShowMore } from "./ShowMore";

/**
 * The first `page` items, then "Show N more". Give it a `key` that changes
 * with the list's filter or range to start again from the first page.
 */
export function Paged<T>({ items, page = 25, children }: { items: T[]; page?: number; children: (visible: T[]) => ReactNode }) {
  const [shown, setShown] = useState(page);
  return (
    <>
      {children(items.slice(0, shown))}
      <ShowMore shown={shown} total={items.length} page={page} onMore={() => setShown(shown + page)} />
    </>
  );
}
