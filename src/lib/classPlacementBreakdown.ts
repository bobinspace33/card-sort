import type { CardData } from '../types';

export type CategoryPlacementShare = {
  category: string;
  percent: number;
  count: number;
};

export type CardPlacementBreakdownRow = {
  cardId: string;
  label: string;
  categories: CategoryPlacementShare[];
};

export function computeClassPlacementByCard(
  categories: string[],
  cards: Pick<CardData, 'id' | 'frontText'>[],
  resps: { placements?: Record<string, string> }[],
): CardPlacementBreakdownRow[] {
  const n = resps.length;
  return cards.map((card) => {
    const counts: Record<string, number> = Object.fromEntries(categories.map((c) => [c, 0]));
    if (n > 0) {
      for (const r of resps) {
        const cat = r.placements?.[card.id];
        if (cat != null && cat in counts) {
          counts[cat] = (counts[cat] ?? 0) + 1;
        }
      }
    }
    const categoriesOut = categories.map((cat) => {
      const count = counts[cat] ?? 0;
      const percent = n > 0 ? Math.round((count / n) * 100) : 0;
      return { category: cat, count, percent };
    });
    return {
      cardId: card.id,
      label: card.frontText.trim() || 'Untitled card',
      categories: categoriesOut,
    };
  });
}

/** Legacy / default: scored sorts unless explicitly disabled. */
export function isScoredSort(activity: { scoredSort?: boolean }): boolean {
  return activity.scoredSort !== false;
}
