import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
	plugins: [
		svelte({
			compilerOptions: {
				runes: true,
				customElement: true
			}
		})
	],

	build: {
		lib: {
			entry: "src/index.ts",
			formats: ["es"],
			fileName: `moji-moe-${pkg.version}.min`,
		},
		minify: "terser",
	},
});