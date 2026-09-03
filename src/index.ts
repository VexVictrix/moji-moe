import TegakiMoe from "./TegakiMoe.svelte";

if (!customElements.get("tegaki-moe")) {
	customElements.define("tegaki-moe", TegakiMoe);
}

export { TegakiMoe };
export type { Candidate } from "./core";
export type { TegakiConfig } from "./config";
export { DEFAULT_CONFIG } from "./config";