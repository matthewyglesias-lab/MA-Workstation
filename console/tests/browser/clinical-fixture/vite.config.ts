import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFile, readdir, writeFile } from "node:fs/promises";

const fixtureRoot = fileURLToPath(new URL("./", import.meta.url));
const outputRoot = fileURLToPath(
  new URL("../../../dist/clinical-fixture/", import.meta.url),
);
const adapterPath = fileURLToPath(new URL("./api.ts", import.meta.url));

/** Test-only entry: production main/auth are never imported or modified. */
export default defineConfig({
  root: fixtureRoot,
  base: "./",
  publicDir: false,
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  build: {
    outDir: outputRoot,
    emptyOutDir: true,
    assetsInlineLimit: 1000000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  plugins: [
    {
      name: "standalone-clinical-component-fixture",
      resolveId(source, importer) {
        if (
          source === "./api.js" &&
          importer?.replaceAll("\\", "/").includes("/src/web/")
        )
          return adapterPath;
        return null;
      },
      async writeBundle() {
        const assetRoot = `${outputRoot}/assets`;
        const assets = await readdir(assetRoot);
        const scripts = assets.filter((name) => name.endsWith(".js"));
        const styles = assets.filter((name) => name.endsWith(".css"));
        if (scripts.length !== 1 || styles.length !== 1)
          throw new Error(
            "Clinical fixture expects one script and one stylesheet.",
          );
        const script = await readFile(`${assetRoot}/${scripts[0]}`, "utf8");
        const style = await readFile(`${assetRoot}/${styles[0]}`, "utf8");
        let html = await readFile(`${outputRoot}/index.html`, "utf8");
        html = html.replace(
          /<script[^>]*src="[^"]+"[^>]*><\/script>/,
          () =>
            `<script type="module">${script.replace(/<\/script/gi, "<\\/script")}</script>`,
        );
        html = html.replace(
          /<link[^>]*rel="stylesheet"[^>]*>/,
          () => `<style>${style}</style>`,
        );
        await writeFile(`${outputRoot}/Clinical-Workflow-Fixture.html`, html);
        console.log(
          "Standalone component fixture: dist/clinical-fixture/Clinical-Workflow-Fixture.html",
        );
      },
    },
  ],
});
