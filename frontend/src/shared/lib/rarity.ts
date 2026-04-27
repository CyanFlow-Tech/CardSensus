export type RarityTier = "mythic" | "legendary" | "epic" | "rare" | "common" | "basic";

interface RarityMeta {
  tier: RarityTier;
  label: string;
  colorToken: "red" | "orange" | "purple" | "green" | "blue" | "white";
}

const rarityScale: Array<{ min: number; meta: RarityMeta }> = [
  // Higher rarity_index means more common; lower means rarer.
  { min: 0.84, meta: { tier: "common", label: "普通", colorToken: "blue" } },
  { min: 0.68, meta: { tier: "rare", label: "稀有", colorToken: "green" } },
  { min: 0.52, meta: { tier: "epic", label: "史诗", colorToken: "purple" } },
  { min: 0.36, meta: { tier: "legendary", label: "传说", colorToken: "orange" } },
  { min: 0.2, meta: { tier: "mythic", label: "神话", colorToken: "red" } },
  { min: 0, meta: { tier: "basic", label: "基础", colorToken: "white" } }
];

export function getRarityMeta(rarityIndex: number): RarityMeta {
  return rarityScale.find((item) => rarityIndex >= item.min)?.meta ?? rarityScale[rarityScale.length - 1].meta;
}
