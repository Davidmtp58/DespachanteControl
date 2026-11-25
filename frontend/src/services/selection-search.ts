export interface SearchOption {
  id: string;
  label: string;
  selectedLabel?: string;
  search: string[];
  preferred?: boolean;
}
// Search-only normalization: never modifies IDs or persisted values.
export function searchKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}
export const suggestionLimit = 20;
export function searchOptions(options: SearchOption[], query: string) {
  const key = searchKey(query);
  const preferred: SearchOption[] = [],
    others: SearchOption[] = [];
  for (const option of options) {
    if (!key || option.search.some((text) => text.includes(key))) {
      (option.preferred ? preferred : others).push(option);
    }
  }
  return {
    total: preferred.length + others.length,
    visible: [...preferred, ...others].slice(0, suggestionLimit),
  };
}
