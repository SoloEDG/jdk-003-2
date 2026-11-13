import type { JourneyContext } from "@/shared/domain";
import { shuffle, hash } from "@/shared/random";
export interface StockItem {
  id: string;
  card: string;
  basePrice: number;
  sold: boolean;
  /** 契约专属货物：仅在有效契约期间上架，违约后撤下。 */
  exclusive: boolean;
}
export function makeStock(
  c: JourneyContext,
  exclusiveCards: string[] = [],
): StockItem[] {
  const regular = shuffle(
    ["venom", "focus", "fury", "burst", "shelter", "guard"],
    hash(c.nodeId),
  )
    .slice(0, 3)
    .map((card, i) => ({
      id: `${c.nodeId}-stock-${i}`,
      card,
      basePrice: ["fury", "burst", "focus"].includes(card) ? 48 : 32,
      sold: false,
      exclusive: false,
    }));
  const exclusive = shuffle(
    [...new Set(exclusiveCards)],
    hash(`${c.nodeId}-contract`),
  )
    .slice(0, 2)
    .map((card, i) => ({
      id: `${c.nodeId}-contract-stock-${i}`,
      card,
      basePrice: 26,
      sold: false,
      exclusive: true,
    }));
  return [...regular, ...exclusive];
}
