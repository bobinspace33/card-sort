import { categoryPastelAt } from '@/src/lib/categoryPastels';
import type { CardPlacementBreakdownRow } from '@/src/lib/classPlacementBreakdown';

type Props = {
  categoryOrder: string[];
  rows: CardPlacementBreakdownRow[];
  /** Screen-reader label for the list */
  listLabel?: string;
};

export function ClassPlacementBreakdownList({ categoryOrder, rows, listLabel }: Props) {
  return (
    <ul className="space-y-4" aria-label={listLabel}>
      {rows.map((row) => (
        <li key={row.cardId}>
          <p className="mb-1.5 truncate text-sm font-medium text-slate-800" title={row.label}>
            {row.label}
          </p>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80">
            {row.categories.map((cell) => {
              if (cell.percent <= 0) return null;
              const idx = Math.max(0, categoryOrder.indexOf(cell.category));
              const pastel = categoryPastelAt(idx);
              return (
                <div
                  key={cell.category}
                  className="h-full min-w-0 transition-[width] duration-300"
                  style={{
                    width: `${cell.percent}%`,
                    backgroundColor: pastel.border,
                  }}
                  title={`${cell.category}: ${cell.percent}%`}
                />
              );
            })}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 sm:text-xs">
            {row.categories.map((cell) => {
              const idx = Math.max(0, categoryOrder.indexOf(cell.category));
              const pastel = categoryPastelAt(idx);
              return (
                <li key={cell.category} className="flex items-center gap-1 tabular-nums">
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: pastel.border }}
                    aria-hidden
                  />
                  <span className="max-w-[10rem] truncate" title={cell.category}>
                    {cell.category}
                  </span>
                  <span className="text-slate-500">{cell.percent}%</span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
