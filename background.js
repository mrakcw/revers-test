// Локально обрабатывает тестовые API-команды без обращения к внешнему серверу.
import { registerMockApiHandler } from "./api-handler.js";

registerMockApiHandler();

// Адрес сайта и шаблон URL, на которых расширение запускает поиск записей.
const TARGET_HOST = "icp.administracionelectronica.gob.es";
const TARGET_URL =
  "https://icp.administracionelectronica.gob.es/icpplus/index.html";
const TARGET_MATCH = "*://*.administracionelectronica.gob.es/*";

// Сетевые ошибки, после которых активная вкладка переводится на экран ожидания.
const watchedErrors = [
  "net::ERR_CERT_DATE_INVALID",
  "net::ERR_CONNECTION_TIMED_OUT",
  "net::ERR_EMPTY_RESPONSE",
  "ERR_CONNECTION_TIMED_OUT",
];

// При установке или обновлении сбрасывает состояние автоматизации в хранилище.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isEnabled: false,
    activeTabId: null,
  });
});

// Принимает команды запуска и остановки от popup и скриптов страницы.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "START_AUTOMATION") {
    startAutomation(msg.payload);
  }

  if (msg.action === "STOP_AUTOMATION") {
    stopAutomation(msg.reason || "остановлено пользователем");
  }
});

// Сохраняет введенные данные и открывает либо активирует вкладку целевого сайта.
function startAutomation(payload) {
  chrome.storage.local.set({
    isEnabled: true,
    userData: payload,
  });

  chrome.storage.local.get("activeTabId", ({ activeTabId }) => {
    chrome.tabs.query({ url: TARGET_MATCH }, (tabs) => {
      if (activeTabId) {
        const existing = tabs.find((t) => t.id === activeTabId);

        if (existing) {
          console.log("[BG] Using existing active tab");

          chrome.storage.local.set({ activeTabId: existing.id });
          chrome.windows.update(existing.windowId, { focused: true });
          chrome.tabs.update(existing.id, { active: true });
          chrome.tabs.update(existing.id, { url: TARGET_URL, active: true });

          return;
        }
      }

      if (tabs.length > 0) {
        const tab = tabs[0];

        console.log("[BG] Assigning active tab:", tab.id);

        chrome.storage.local.set({ activeTabId: tab.id });

        chrome.windows.update(tab.windowId, { focused: true });
        chrome.tabs.update(tab.id, { active: true });
        chrome.tabs.update(tab.id, { url: TARGET_URL, active: true });

        return;
      }

      chrome.tabs.create({ url: TARGET_URL, active: true }, (tab) => {
        console.log("[BG] Created new active tab:", tab.id);
        chrome.storage.local.set({ activeTabId: tab.id });
      });
    });
  });
}

// Выключает автоматизацию, уведомляет активную вкладку и очищает ее идентификатор.
function stopAutomation(reason) {
  console.log("[BG] STOP:", reason);

  chrome.storage.local.set({ isEnabled: false });

  chrome.storage.local.get("activeTabId", ({ activeTabId }) => {
    if (!activeTabId) return;

    chrome.tabs.sendMessage(activeTabId, {
      action: "STOP",
      reason,
    });

    chrome.storage.local.remove("activeTabId");
  });
}

// Перехватывает выбранные сетевые ошибки только у активной вкладки автоматизации.
chrome.webRequest.onErrorOccurred.addListener(
  function (details) {
    try {
      if (
        details.tabId < 0 ||
        !watchedErrors.includes(details.error) ||
        !details.url.includes(TARGET_HOST)
      ) {
        return;
      }

      chrome.storage.local.get(
        ["isEnabled", "activeTabId"],
        ({ isEnabled, activeTabId }) => {
          if (!isEnabled) return;
          if (details.tabId !== activeTabId) return;

          console.warn("[BG] Network error on active tab:", details.error);

          chrome.tabs.update(activeTabId, {
            url: chrome.runtime.getURL("redirect.html"),
          });
        },
      );
    } catch (e) {
      console.error("[BG] Error handler failed:", e);
    }
  },
  { urls: ["*://*.administracionelectronica.gob.es/*"] },
);

// Позволяет content.js проверить, является ли его вкладка текущей активной вкладкой.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "IS_ACTIVE_TAB") {
    chrome.storage.local.get("activeTabId", ({ activeTabId }) => {
      sendResponse({
        ok: sender.tab && sender.tab.id === activeTabId,
      });
    });
    return true;
  }
});
