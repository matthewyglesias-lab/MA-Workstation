import { readFile, writeFile, readdir } from "node:fs/promises";
const root = new URL("../dist/preview/", import.meta.url);
let html = await readFile(new URL("index.html", root), "utf8");
const assets = await readdir(new URL("assets/", root));
const js = assets.filter((name) => name.endsWith(".js"));
const css = assets.filter((name) => name.endsWith(".css"));
if (js.length !== 1 || css.length !== 1)
  throw new Error("Expected one self-contained script and stylesheet.");
const script = await readFile(new URL(`assets/${js[0]}`, root), "utf8");
const style = await readFile(new URL(`assets/${css[0]}`, root), "utf8");
html = html.replace(
  /<script[^>]*src="[^"]+"[^>]*><\/script>/,
  () =>
    `<script type="module">${script.replace(/<\/script/gi, "<\\/script")}</script>`,
);
html = html.replace(
  /<link[^>]*rel="stylesheet"[^>]*>/,
  () => `<style>${style}</style>`,
);
const icon = assets.find((name) => /^favicon-[\w-]+\.svg$/.test(name));
if (!icon) throw new Error("Expected the console SVG favicon.");
const iconSvg = await readFile(new URL(`assets/${icon}`, root), "utf8");
html = html.replace(
  /(<link[^>]*rel="icon"[^>]*href=")[^"]+("[^>]*>)/,
  (_, prefix, suffix) =>
    `${prefix}data:image/svg+xml,${encodeURIComponent(iconSvg)}${suffix}`,
);
await writeFile(new URL("Clinic-Console-Interactive-Demo.html", root), html);
console.log(
  "Standalone demo: dist/preview/Clinic-Console-Interactive-Demo.html",
);
