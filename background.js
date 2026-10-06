// Service Worker фонового скрипта (background.js).
// Отвечает за управление вкладкой, хранение текущего состояния вызова (activeJob)
// и передачу структурированного результата вызывающему модулю.

import { registerMockApiHandler } from "./api-handler.js";

registerMockApiHandler();

const TARGET_URL = "https://icp.administracionelectronica.gob.es/icpplus/index.html";
const TARGET_MATCH = "*://*.administracionelectronica.gob.es/*";

// Активные резолверы для ожидающих сценариев (jobId -> resolveFunction)
const pendingRunResolvers = new Map();

// Сброс состояния при установке
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isEnabled: false,
    activeTabId: null,
    activeJob: null,
  });
});

// Слушатель сообщений
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "RUN_SCENARIO_EXECUTION") {
    handleRunScenarioExecution(msg.payload, sendResponse);
    return true; // Асинхронный ответ
  }

  if (msg.action === "JOB_FINISHED") {
    handleJobFinished(msg.result);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === "START_AUTOMATION") {
    // Совместимость с popup
    const payload = msg.payload;
    const scenarioInput = {
      jobId: String(Date.now()),
      mode: payload.mode || "SHORT",
      client: {
        name: payload.name,
        documentType: payload.documentType,
        nie: payload.nie,
        passport: payload.passport,
        birthYear: payload.birthYear || "1990",
        phone: payload.tel,
        email: payload.email,
      },
      target: {
        city: payload.city,
        procedure: payload.procedure,
        offices: payload.offices,
        officeMode: payload.officeMode,
      },
    };

    handleRunScenarioExecution(scenarioInput, (res) => {
      console.log("[BG] Manual Popup run completed:", res);
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === "STOP_AUTOMATION" || msg.action === "STOP_EXECUTION") {
    stopActiveScenario(msg.reason || "Остановлено по запросу.");
    sendResponse({ ok: true });
    return false;
  }
});

// Запуск сценария исполнения
function handleRunScenarioExecution(payload, sendResponse) {
  const jobId = payload.jobId;
  console.log(`[BG] Launching execution for Job ID: ${jobId}, mode: ${payload.mode}`);

  // Сохраняем резолвер в карту
  pendingRunResolvers.set(jobId, sendResponse);

  const activeJob = {
    payload,
    status: "RUNNING",
    startedAt: Date.now(),
  };

  chrome.storage.local.set({
    isEnabled: true,
    activeJob,
  });

  // Устанавливаем защитный тайм-аут (60 секунд на сценарий)
  setTimeout(() => {
    if (pendingRunResolvers.has(jobId)) {
      console.warn(`[BG] Timeout reached for Job ID: ${jobId}`);
      handleJobFinished({
        ok: false,
        status: "NETWORK_ERROR",
        jobId,
        mode: payload.mode,
        error: {
          code: "SCENARIO_TIMEOUT",
          message: "Время выполнения одного прохода сценария истекло (60 сек).",
        },
      });
    }
  }, 60000);

  // Открываем или перенаправляем вкладку
  chrome.tabs.query({ url: TARGET_MATCH }, (tabs) => {
    if (tabs.length > 0) {
      const tab = tabs[0];
      chrome.storage.local.set({ activeTabId: tab.id });
      chrome.windows.update(tab.windowId, { focused: true });
      chrome.tabs.update(tab.id, { url: TARGET_URL, active: true });
    } else {
      chrome.tabs.create({ url: TARGET_URL, active: true }, (tab) => {
        chrome.storage.local.set({ activeTabId: tab.id });
      });
    }
  });
}

// Завершение сценария
function handleJobFinished(result) {
  const jobId = result.jobId;
  console.log(`[BG] Job ID ${jobId} finished with status: ${result.status}`);

  chrome.storage.local.set({
    isEnabled: false,
    activeJob: null,
  });

  if (pendingRunResolvers.has(jobId)) {
    const resolve = pendingRunResolvers.get(jobId);
    pendingRunResolvers.delete(jobId);
    resolve(result);
  }
}

// Остановка выполнения
function stopActiveScenario(reason) {
  console.log("[BG] Stopping scenario:", reason);
  chrome.storage.local.get("activeJob", ({ activeJob }) => {
    if (activeJob && activeJob.payload) {
      handleJobFinished({
        ok: false,
        status: "STOPPED",
        jobId: activeJob.payload.jobId,
        mode: activeJob.payload.mode,
        error: {
          code: "STOPPED",
          message: reason,
        },
      });
    } else {
      chrome.storage.local.set({ isEnabled: false, activeJob: null });
    }
  });
}
