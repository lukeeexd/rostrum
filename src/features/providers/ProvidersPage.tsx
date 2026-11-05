import { useProviders } from "@/api/queries";
import type { ProviderStats } from "@/api/types";
import { Card, Empty } from "@/components/shared/Card";
import { QueryState } from "@/components/shared/QueryState";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table/table";
import { cx } from "@/utils/cx";
import { bestIndexes } from "@/lib/best";
import { orUnnamed } from "@/lib/format";
import { cellText, comparisonSections, type Section } from "./lib/comparison";

/**
 * Providers side by side, from Podium's own metrics: who serves channels
 * first and how well, what their streams are like, and why the broken ones
 * broke. The best value on each row is marked.
 */
export function ProvidersPage() {
  const query = useProviders();
  return (
    <QueryState query={query}>
      {({ providers }) =>
        providers.length === 0 ? (
          <Card>
            <Empty>Podium has not reported any providers yet.</Empty>
          </Card>
        ) : (
          <>
            <p className="px-1 text-body-2-medium text-text-tertiary">
              From Podium&apos;s metrics, refreshed every minute. Counts are distinct streams Podium manages; the best value on
              each row is marked.
            </p>
            <div className="grid items-start gap-4 2xl:grid-cols-2">
              {comparisonSections(providers).map((section) => (
                <SectionCard key={section.id} section={section} providers={providers} />
              ))}
            </div>
          </>
        )
      }
    </QueryState>
  );
}

/**
 * Column ids are positional ("metric", "p0", "p1", …), never provider names,
 * so an empty or odd provider name cannot collide with the metric column.
 */
type Column = { id: "metric" } | { id: string; provider: ProviderStats; index: number };

function SectionCard({ section, providers }: { section: Section; providers: ProviderStats[] }) {
  const columns: Column[] = [{ id: "metric" }, ...providers.map((provider, index) => ({ id: `p${index}`, provider, index }))];
  return (
    <Card title={section.title}>
      <Table aria-label={`${section.title}, by provider`} size="sm">
        <TableHeader columns={columns}>
          {(col) =>
            "provider" in col ? (
              <TableColumn id={col.id} className="num">
                <span className="text-text-primary">{orUnnamed(col.provider.name)}</span>
              </TableColumn>
            ) : (
              <TableColumn id={col.id} isRowHeader className="w-56">
                Metric
              </TableColumn>
            )
          }
        </TableHeader>
        <TableBody items={section.rows}>
          {(row) => {
            const best = bestIndexes(providers.map(row.value), row.better);
            return (
              <TableRow columns={columns}>
                {(col) => {
                  if (!("provider" in col)) {
                    return (
                      <TableCell>
                        <span className="flex flex-col">
                          <span className="text-text-primary">{row.label}</span>
                          {row.hint && <span className="text-caption-1-medium text-text-tertiary">{row.hint}</span>}
                        </span>
                      </TableCell>
                    );
                  }
                  const isBest = best.has(col.index);
                  return (
                    <TableCell className={cx("num relative whitespace-nowrap", isBest && "font-semibold! text-status-lime-text!")}>
                      {isBest && <span className="sr-only">Best: </span>}
                      {cellText(row, col.provider)}
                    </TableCell>
                  );
                }}
              </TableRow>
            );
          }}
        </TableBody>
      </Table>
    </Card>
  );
}
