import MojiMoe from "./MojiMoe.svelte";

if (!customElements.get("moji-moe")) {
	customElements.define("moji-moe", MojiMoe as unknown as CustomElementConstructor);
}

export { MojiMoe };
export type { Candidate } from "./core";
export type { MojiConfig } from "./config";
export { DEFAULT_CONFIG } from "./config";