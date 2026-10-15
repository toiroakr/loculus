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
export const prelude: string;
