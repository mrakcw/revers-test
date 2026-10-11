import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { firefox } from "playwright";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const contentScriptPath = path.join(sourceDirectory, "portal-automation.js");
const intermediateCertificatePath = path.resolve(
  sourceDirectory,
  "..",
  "certs",
  "RapidSSLTLSRSACAG1.crt.pem",
);
const targetUrlDefault =
  "https://icp.administracionelectronica.gob.es/icpplustiem/index.html";
function createBridgeScript(contentScript, payload) {
  return `(async () => {
    // Chrome content_scripts default to the top frame; Playwright init scripts run in every frame.
    if (window !== window.top) return;
    if (!/^(icp\\.administracionelectronica\\.gob\\.es|sede\\.administracionespublicas\\.gob\\.es)$/.test(location.hostname)) return;
    if (globalThis.__citaBotBridgeInstalled) return;
    globalThis.__citaBotBridgeInstalled = true;
    const initialState = await globalThis.__citaBotGetState();
    const listeners = [];
    const storage = initialState;
    const notify = (event) => globalThis.__citaBotEvent?.({ ...event, url: location.href }).catch(() => {});
    globalThis.citaBot = {
      storage: {
        async get(keys) {
          if (keys == null) return { ...storage };
          if (typeof keys === "string") return { [keys]: storage[keys] };
          if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, storage[key]]));
          return { ...keys, ...Object.fromEntries(Object.keys(keys).map((key) => [key, storage[key] ?? keys[key]])) };
        },
        async set(values) {
          Object.assign(storage, values);
          await globalThis.__citaBotSetState(values);
        }
      },
      onMessage(listener) { listeners.push(listener); },
      async sendMessage(message, callback) {
          let response = {};
          if (message?.action === "IS_ACTIVE_TAB") response = { ok: true };
          else if (message?.action === "AUTOMATION_RESULT") {
            await notify({ type: "automation_result", resultType: message.resultType, data: message.data });
            response = { ok: true };
          }
          else if (message?.action === "AUTOMATION_STATUS") {
            await notify({ type: "automation_status", status: message.status, data: message.data });
            response = { ok: true };
          }
          else if (message?.action === "WAIT_FOR_CODE") {
            const code = await globalThis.__citaBotEvent?.({
              type: "code_required",
              codeType: message.codeType,
              image: message.image || null,
              url: location.href,
            });
            response = { ok: Boolean(code), code: code || null };
          }
          else if (message?.action === "PORTAL_ERROR") {
            await notify({ type: "portal_error", reason: message.reason || "Ошибка портала" });
            response = { ok: true };
          }
          else if (message?.action === "STOP_AUTOMATION") {
            storage.isEnabled = false;
            await globalThis.__citaBotSetState({ isEnabled: false });
            notify({ type: "stopped", reason: message.reason || "automation_stopped" });
          } else if (message?.action === "START_AUTOMATION") response = { ok: true };
          for (const listener of listeners) {
            try { listener(message, {}, () => {}); } catch (error) { console.error(error); }
          }
          if (typeof callback === "function") callback(response);
          return response;
      }
    };
    const startContentScript = () => {
      if (globalThis.__citaBotScriptLoaded) return;
      const documentURI = document.documentURI || "";
      const browserErrorPage =
        /^(about:certerror|about:neterror)/.test(documentURI) ||
        document.documentElement?.id === "errorPageContainer" ||
        /Potential Security Risk Ahead|SEC_ERROR_UNKNOWN_ISSUER|SEC_ERROR_BAD_CERT_DOMAIN/.test(
          document.body?.innerText || "",
        );
      if (browserErrorPage) {
        globalThis.__citaBotEvent?.({
          type: "browser_interstitial",
          url: location.href,
          documentURI,
          reason: (document.body?.innerText || "").slice(0, 500),
        });
        return;
      }
      globalThis.__citaBotScriptLoaded = true;
      // Embed the extension source in a normal function body. eval() is blocked
      // by Firefox's page CSP, while this code is compiled with the init script.
      (function () {
${contentScript}
      }).call(window);
    };
    // Match the extension's default document_idle timing and ensure document.body exists
    // before checkPageStatus() reads it. performSteps() still waits for the full load event.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startContentScript, { once: true });
    } else {
      startContentScript();
    }
  })();`;
}

function createRejectedPageWatcher() {
  return `(() => {
    if (window !== window.top) return;
    let reported = false;
    const reportIfRejected = () => {
      if (reported) return;
      const bodyText = document.body?.innerText || "";
      if (!bodyText.includes("The requested URL was rejected")) return;

      reported = true;
      const supportId = bodyText.match(/Support ID is:\\s*<?([^\\s<>]+)/i)?.[1] || null;
      globalThis.__citaBotAccessRejected?.(supportId, location.href);
    };

    new MutationObserver(reportIfRejected).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    reportIfRejected();
  })();`;
}

// Запускает Firefox в приватном persistent-контексте и подключает исполнитель до навигации.
export async function launchAutomationBrowser(
  payload,
  onEvent = () => {},
  { targetUrl = process.env.TARGET_LINK?.trim() || targetUrlDefault, beforeNavigate } = {},
) {
  const browserUserDataDirectory = "";
  let context;
  let policyDirectory;
  let stopped = false;
  let enabled = true;

  try {
    const contentScript = await readFile(contentScriptPath, "utf8");
    policyDirectory = await mkdtemp(path.join(os.tmpdir(), "cita-firefox-policy-"));
    const policyPath = path.join(policyDirectory, "policies.json");
    await writeFile(
      policyPath,
      JSON.stringify({
        policies: {
          Certificates: { Install: [intermediateCertificatePath] },
        },
      }),
      "utf8",
    );
    context = await firefox.launchPersistentContext(browserUserDataDirectory, {
      headless: false,
      env: {
        ...process.env,
        PLAYWRIGHT_FIREFOX_POLICIES_JSON: policyPath,
      },
      firefoxUserPrefs: {
        "browser.privatebrowsing.autostart": true,
      },
    });
    let activePage = context.pages()[0] || (await context.newPage());

    await context.exposeFunction("__citaBotGetState", async () => ({
      isEnabled: enabled,
      userData: payload,
    }));
    await context.exposeFunction("__citaBotSetState", async (values) => {
      if (values && Object.hasOwn(values, "isEnabled")) {
        enabled = Boolean(values.isEnabled);
      }
    });
    await context.exposeFunction("__citaBotEvent", async (event) => {
      return await onEvent(event);
    });
    await context.exposeFunction("__citaBotAccessRejected", async (supportId, url) => {
      if (stopped) return;
      await onEvent({ type: "access_rejected", supportId, url });
    });

    await context.addInitScript({ content: createRejectedPageWatcher() });
    await context.addInitScript({ content: createBridgeScript(contentScript, payload) });

    const watchedErrors = [
      "net::ERR_CERT_DATE_INVALID",
      "net::ERR_CONNECTION_TIMED_OUT",
      "net::ERR_EMPTY_RESPONSE",
      "ERR_CONNECTION_TIMED_OUT",
    ];
    const attachedPages = new WeakSet();
    const attachPageHandlers = (page) => {
      if (attachedPages.has(page)) return;
      attachedPages.add(page);

      page.on("requestfailed", async (request) => {
        if (stopped || !request.url().includes("administracionelectronica.gob.es")) return;
        const failure = request.failure()?.errorText || "";
        if (!watchedErrors.some((error) => failure.includes(error))) return;
        await onEvent({ type: "network_error", reason: failure, url: page.url() });
      });
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) {
          onEvent({ type: "page_navigated", url: frame.url() });
        }
      });
      page.on("pageerror", (error) =>
        onEvent({ type: "page_error", reason: error.message, url: page.url() }),
      );
      page.on("console", (message) => {
        const reason = message.text();
        const isUnavailableChromeExtensionProbe =
          /chrome-extension:\/\/[^\s]+.*Reason: CORS request not http/i.test(reason);
        if (message.type() === "error" && isUnavailableChromeExtensionProbe) {
          return;
        }
        const isAutomationMessage = /Script запущен|content\.js loaded|Выполняем шаги|Ждем|Кнопка|Выбрана опция|Данные введены|Ошибка:/i.test(reason);
        if (message.type() === "error" || isAutomationMessage) {
          onEvent({
            type: message.type() === "error" ? "page_console_error" : "page_console",
            level: message.type(),
            reason,
            url: page.url(),
          });
        }
      });
    };
    context.on("page", (page) => {
      activePage = page;
      attachPageHandlers(page);
      page.bringToFront().catch((error) => {
        onEvent({ type: "page_error", reason: error.message, url: page.url() });
      });
    });
    for (const page of context.pages()) attachPageHandlers(page);
    context.once("close", () => {
      stopped = true;
    });

    await activePage.bringToFront();
    if (beforeNavigate) await beforeNavigate({ context, page: activePage });
    let initialNavigationError = null;
    try {
      await activePage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (error) {
      // Keep the visible browser open so the operator can inspect or retry a
      // startup failure. Closing here made TLS/network diagnostics invisible.
      initialNavigationError = error;
      await onEvent({ type: "navigation_error", reason: error.message, url: activePage.url() });
    }
    await activePage.bringToFront();

    return {
      context,
      get page() {
        return activePage;
      },
      initialNavigationError,
      async stop(reason = "stopped_by_user") {
        if (stopped) return;
        stopped = true;
        await onEvent({ type: "stopped", reason });
        await context.close();
        await rm(policyDirectory, { recursive: true, force: true });
      },
      async close() {
        stopped = true;
        await context.close();
        await rm(policyDirectory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (context) await context.close().catch(() => {});
    if (policyDirectory) await rm(policyDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
