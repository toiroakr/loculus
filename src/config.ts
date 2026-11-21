import type { ErrorCustomization } from "./index.js";

export type StringLength = (value: string) => number;
export interface Config {
  readonly stringLength?: StringLength | undefined;
  readonly customError?: ErrorCustomization | undefined;
}
export let configuration: Config = {};
export function config(options?: Config): Readonly<Config> {
  if (options !== undefined) {
    const next = { ...configuration, ...options };
    if (next.stringLength !== undefined && typeof next.stringLength !== "function")
      throw new TypeError("Expected stringLength to be a function");
    configuration = next;
  }
  return configuration;
}
