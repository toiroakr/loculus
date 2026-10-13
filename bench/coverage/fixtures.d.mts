export interface Profile {
  id: string;
  feature: string;
  expressions: readonly string[];
  valid: readonly unknown[];
  invalid: readonly unknown[];
  probes: readonly unknown[];
  format?: "url" | "form";
  method?: "parse" | "safeParse";
  nativeValibot?: boolean;
  note?: string;
}
export const profiles: readonly Profile[];
export const libraries: readonly string[];
export const imports: Readonly<Record<string, string>>;
export const prelude: string;
export const coverage: Readonly<Record<string, unknown>>;
