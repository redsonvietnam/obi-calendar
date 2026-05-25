import esbuild from "esbuild";
import process from "node:process";

const isProduction = process.argv.includes("production");

/**
 * Build script tối thiểu cho Obsidian plugin.
 * - Entry: src/main.ts
 * - Output: main.js ở root plugin folder
 */
const context = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    format: "cjs",
    platform: "browser",
    target: "es2020",
    sourcemap: isProduction ? false : "inline",
    minify: isProduction,
    logLevel: "info",
    external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view"],
    outfile: "main.js"
});

if (isProduction) {
    await context.rebuild();
    await context.dispose();
} else {
    await context.watch();
}