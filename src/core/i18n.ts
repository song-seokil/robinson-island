import { ITEMS, ItemKey, Family, FAMILIES, LEVEL_MAX } from './config';

/** 아이템 표기 헬퍼 — 나중에 다국어 확장 시 이 파일만 고치면 된다 */
export function itemName(k: ItemKey): string { return ITEMS[k]?.name ?? k; }
export function itemIcon(k: ItemKey): string { return ITEMS[k]?.icon ?? '❔'; }
export function itemLabel(k: ItemKey): string { return `${itemIcon(k)} ${itemName(k)}`; }

export function familyName(f: Family): string { return FAMILIES[f]?.name ?? f; }
export function familyIcon(f: Family): string { return FAMILIES[f]?.icon ?? '❔'; }

/** 자원 부족 문구: "🌳 -3 ⛰️ -2" */
export function shortList(cost: Partial<Record<ItemKey, number>>, have: (k: ItemKey) => number): string {
  const out: string[] = [];
  for (const k of Object.keys(cost) as ItemKey[]) {
    const need = cost[k] ?? 0;
    const h = have(k);
    if (h < need) out.push(`${itemIcon(k)}-${need - h}`);
  }
  return out.join(' ');
}

export function levelTag(level: number): string {
  return `Lv.${Math.max(1, Math.min(LEVEL_MAX, level))}`;
}
