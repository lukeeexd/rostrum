import { Button } from "@/components/ui/buttons/button";

/** "Show 25 more" under a paged list, while there is more to show. */
export function ShowMore({ shown, total, page, onMore }: { shown: number; total: number; page: number; onMore: () => void }) {
  if (total <= shown) return null;
  return (
    <Button variant="ghost" size="small" className="self-center" onClick={onMore}>
      Show {Math.min(page, total - shown)} more
    </Button>
  );
}
