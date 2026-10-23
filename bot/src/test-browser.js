import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  browserSettings,
  defaultProfile,
  getBrowserProfile,
} from "./fingerprint-profiles.js";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(sourceDirectory, "..", "..");

const diagnosticHtml = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chromium fingerprint lab</title>
  <style>
    :root { color-scheme: light dark; font: 15px/1.5 system-ui, sans-serif; }
    body { max-width: 1100px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.5rem; }
    p { opacity: .8; }
    button { padding: .6rem .9rem; cursor: pointer; }
    pre { padding: 1rem; border: 1px solid #8888; border-radius: .5rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <h1>Chromium fingerprint lab</h1>
  <p>Read-only диагностика. Значения собираются локально в этой вкладке и никуда не отправляются.</p>
  <p id="status">Сбор данных…</p>
  <button id="refresh" type="button">Обновить диагностику</button>
  <button id="copy" type="button">Копировать JSON</button>
  <pre id="output">Loading…</pre>
  <script>
    const output = document.querySelector("#output");
    const status = document.querySelector("#status");
    let latest = null;

    async function collect() {
      const gl = document.createElement("canvas").getContext("webgl");
      let webgl = null;
      if (gl) {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        webgl = {
          vendor: gl.getParameter(gl.VENDOR),
          renderer: gl.getParameter(gl.RENDERER),
          unmaskedVendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : "unavailable",
          unmaskedRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable",
          version: gl.getParameter(gl.VERSION),
          shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
        };
      }

      let mediaDevices = "unavailable";
      try {
        mediaDevices = (await navigator.mediaDevices.enumerateDevices()).map(d => ({
          kind: d.kind,
          label: d.label || "(label hidden until permission)",
          deviceIdPresent: Boolean(d.deviceId),
          groupIdPresent: Boolean(d.groupId)
        }));
      } catch (error) {
        mediaDevices = { error: String(error) };
      }

      let battery = "unsupported";
      try {
        if (navigator.getBattery) {
          const b = await navigator.getBattery();
          battery = { charging: b.charging, level: b.level, chargingTime: b.chargingTime, dischargingTime: b.dischargingTime };
        }
      } catch (error) {
        battery = { error: String(error) };
      }

      let voices = [];
      try {
        voices = speechSynthesis.getVoices().map(v => ({
          name: v.name, lang: v.lang, localService: v.localService, default: v.default
        }));
      } catch (error) {
        voices = [{ error: String(error) }];
      }

      return {
        collectedAt: new Date().toISOString(),
        browser: {
          userAgent: navigator.userAgent,
          appVersion: navigator.appVersion,
          vendor: navigator.vendor,
          webdriver: navigator.webdriver,
          userAgentData: navigator.userAgentData ? {
            brands: navigator.userAgentData.brands,
            mobile: navigator.userAgentData.mobile,
            platform: navigator.userAgentData.platform
          } : "unsupported"
        },
        operatingSystem: {
          platform: navigator.platform,
          language: navigator.language,
          languages: navigator.languages,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          timezoneOffsetMinutes: new Date().getTimezoneOffset()
        },
        display: {
          innerWidth: innerWidth, innerHeight: innerHeight,
          outerWidth: outerWidth, outerHeight: outerHeight,
          screenWidth: screen.width, screenHeight: screen.height,
          availWidth: screen.availWidth, availHeight: screen.availHeight,
          colorDepth: screen.colorDepth, pixelDepth: screen.pixelDepth,
          devicePixelRatio
        },
        hardware: {
          hardwareConcurrency: navigator.hardwareConcurrency,
          deviceMemoryGB: navigator.deviceMemory ?? "unsupported",
          maxTouchPoints: navigator.maxTouchPoints
        },
        graphics: { webgl },
        mediaDevices,
        battery,
        speechVoices: voices,
        APIs: {
          webRTC: typeof RTCPeerConnection !== "undefined",
          webGPU: "gpu" in navigator,
          bluetooth: "bluetooth" in navigator,
          geolocation: "geolocation" in navigator,
          permissions: "permissions" in navigator,
          canvas: Boolean(document.createElement("canvas").getContext("2d"))
        },
        privacy: {
          doNotTrack: navigator.doNotTrack,
          globalPrivacyControl: navigator.globalPrivacyControl ?? "unsupported",
          cookieEnabled: navigator.cookieEnabled
        }
      };
    }

    async function refresh() {
      status.textContent = "Сбор данных…";
      try {
        latest = await collect();
        output.textContent = JSON.stringify(latest, null, 2);
        status.textContent = "Готово. Результат остаётся в этом браузере.";
      } catch (error) {
        status.textContent = "Ошибка диагностики: " + error;
      }
    }

    document.querySelector("#refresh").addEventListener("click", refresh);
    document.querySelector("#copy").addEventListener("click", async () => {
      if (!latest) return;
      try {
        await navigator.clipboard.writeText(JSON.stringify(latest, null, 2));
        status.textContent = "JSON скопирован.";
      } catch {
        status.textContent = "Буфер обмена недоступен; выделите JSON вручную.";
      }
    });
    refresh();
    if ("speechSynthesis" in window) {
      speechSynthesis.addEventListener("voiceschanged", refresh, { once: true });
    }
  </script>
</body>
</html>`;

function makeContextOptions(profile) {
  const options = {
    locale: profile.locale,
    viewport: profile.viewport,
    screen: profile.screen,
    colorScheme: profile.colorScheme,
    reducedMotion: profile.reducedMotion,
    acceptDownloads: true,
  };

  if (profile.timezoneId) options.timezoneId = profile.timezoneId;
  if (profile.userAgent) options.userAgent = profile.userAgent;
  if (profile.geolocation) options.geolocation = profile.geolocation;
  if (profile.permissions?.length) options.permissions = profile.permissions;

  return options;
}

// Открывает Chromium с чистым временным профилем, расширением и локальной диагностикой.
export async function launchTestBrowser() {
  await access(path.join(extensionPath, "manifest.json"));

  const selectedName = process.env.BROWSER_PROFILE || defaultProfile;
  const profile = getBrowserProfile(selectedName);
  const profileDirectory = await mkdtemp(path.join(tmpdir(), "fingerprint-lab-"));

  try {
    const context = await chromium.launchPersistentContext(profileDirectory, {
      ...makeContextOptions(profile),
      headless: browserSettings.headless,
      timeout: browserSettings.launchTimeout,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    context.on("close", () => {
      rm(profileDirectory, { recursive: true, force: true }).catch((error) => {
        console.warn("Не удалось удалить временный профиль Chromium:", error);
      });
    });

    const page = await context.newPage();
    await page.setContent(diagnosticHtml, { waitUntil: "domcontentloaded" });
    await page.evaluate((name) => {
      document.title = "Fingerprint lab — " + name;
      const heading = document.querySelector("h1");
      heading.textContent += " (" + name + ")";
    }, profile.name);

    return context;
  } catch (error) {
    await rm(profileDirectory, { recursive: true, force: true });
    throw error;
  }
}
