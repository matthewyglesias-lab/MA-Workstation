const retryCount = 12;
const retryDelayMs = 5_000;
const deployedUrl = String(process.env.DEPLOYED_URL || "").trim();
const productionFallbackUrl = String(
  process.env.PRODUCTION_FALLBACK_URL || "",
).trim();
const isProduction = String(process.env.IS_PRODUCTION || "") === "true";
const target = deployedUrl || (isProduction ? productionFallbackUrl : "");

if (!target) {
  throw new Error(
    "Azure did not return a preview URL, so the deployed workstation could not be smoke-tested.",
  );
}

const baseUrl = new URL(target);

const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: { "user-agent": "clinical-desktop-deployment-smoke/1.0" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return { response, text: await response.text() };
};

let finalError;
let passedUrl = "";
for (let attempt = 1; attempt <= retryCount; attempt += 1) {
  try {
    const { response, text: html } = await fetchText(baseUrl);
    if (!/<div\s+id=["']app["']><\/div>/i.test(html)) {
      throw new Error("The deployed HTML does not contain the application mount point.");
    }
    if (!/<title>IPMG MA Workstation<\/title>/i.test(html)) {
      throw new Error("The deployed HTML is not the expected workstation bundle.");
    }

    const scriptMatch = html.match(
      /<script[^>]+src=["']([^"']*\/assets\/[^"']+\.js)["']/i,
    );
    const styleMatch = html.match(
      /<link[^>]+href=["']([^"']*\/assets\/[^"']+\.css)["']/i,
    );
    if (!scriptMatch?.[1] || !styleMatch?.[1]) {
      throw new Error("The deployed HTML is missing its built JavaScript or CSS asset.");
    }

    const [script, style, runtime] = await Promise.all([
      fetchText(new URL(scriptMatch[1], response.url)),
      fetchText(new URL(styleMatch[1], response.url)),
      fetchText(new URL("/legacy/legacy-runtime.js", response.url)),
    ]);
    if (script.text.length < 25_000 || style.text.length < 10_000) {
      throw new Error("A deployed workstation asset appears unexpectedly small.");
    }
    if (!runtime.text.includes("ipmgMedAssistInjectionRecordsV1")) {
      throw new Error("The deployed compatibility runtime is not the expected build.");
    }

    passedUrl = response.url;
    break;
  } catch (error) {
    finalError = error;
    if (attempt < retryCount) await pause(retryDelayMs);
  }
}

if (passedUrl) {
  console.log(`Deployment smoke passed: ${passedUrl}`);
} else {
  throw new Error(
    `Deployment smoke failed for ${baseUrl.href}: ${
      finalError instanceof Error ? finalError.message : String(finalError)
    }`,
  );
}
