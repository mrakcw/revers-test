// Добавляет последовательный прогон тестовых payload на страницу портала.
(() => {
  const userDataFields = globalThis.CITA_TEST_USER_DATA_FIELDS;
  const userDataCases = globalThis.CITA_TEST_USER_DATA_CASES;
  if (!Array.isArray(userDataFields) || !Array.isArray(userDataCases)) return;

  const queueKey = "citaTestQueue";
  let queueTimer = null;

  function createUserData(values) {
    return Object.fromEntries(userDataFields.map((field, index) => [field, values[index]]));
  }

  function setButtonState(text, disabled) {
    const button = document.getElementById("cita-test-run-button");
    if (!button) return;
    button.textContent = text;
    button.disabled = disabled;
  }

  function getProgressLabel(index) {
    return `Тест ${index + 1}/${userDataCases.length}`;
  }

  async function startCase(queue, index) {
    if (queue.status !== "running") return;
    const userData = createUserData(userDataCases[index]);
    await chrome.storage.local.set({ isEnabled: true, userData });
    await chrome.runtime.sendMessage({ action: "START_AUTOMATION", payload: userData });
    setButtonState(`${getProgressLabel(index)} запущен`, true);
  }

  async function completeQueue(queue) {
    queue.status = "complete";
    await chrome.storage.local.set({ [queueKey]: queue, isEnabled: false });
    setButtonState("Тестовый прогон завершен", false);
  }

  async function advanceQueue(runId, index) {
    const state = await chrome.storage.local.get([queueKey, "isEnabled"]);
    const queue = state[queueKey];
    if (!queue || queue.runId !== runId || queue.status !== "running") return;
    if (state.isEnabled) return;
    const nextIndex = index + 1;
    if (nextIndex >= userDataCases.length) {
      await completeQueue(queue);
      return;
    }
    queue.index = nextIndex;
    await chrome.storage.local.set({ [queueKey]: queue });
    await startCase(queue, nextIndex);
  }

  function monitorQueue(queue) {
    if (queueTimer) clearInterval(queueTimer);
    queueTimer = setInterval(async () => {
      const state = await chrome.storage.local.get([queueKey, "isEnabled"]);
      const currentQueue = state[queueKey];
      if (!currentQueue || currentQueue.runId !== queue.runId || currentQueue.status !== "running") {
        clearInterval(queueTimer);
        queueTimer = null;
        return;
      }
      if (!state.isEnabled) {
        clearInterval(queueTimer);
        queueTimer = null;
        await advanceQueue(queue.runId, currentQueue.index);
      }
    }, 1000);
  }

  async function handleStorageChange(changes, areaName) {
    if (areaName !== "local" || !changes[queueKey]) return;
    const queue = changes[queueKey].newValue;
    if (queue?.status === "running") monitorQueue(queue);
  }

  function createButton() {
    if (document.getElementById("cita-test-run-button")) return;
    const button = document.createElement("button");
    button.id = "cita-test-run-button";
    button.textContent = "Запустить последовательный тест";
    button.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:12px;background:#2457d6;color:white;border:0;border-radius:8px;cursor:pointer";
    button.addEventListener("click", async () => {
      const state = await chrome.storage.local.get([queueKey, "isEnabled"]);
      if (state.isEnabled || state[queueKey]?.status === "running") {
        await chrome.runtime.sendMessage({ action: "STOP_AUTOMATION", reason: "test_queue_stopped" });
        await chrome.storage.local.set({ [queueKey]: { ...state[queueKey], status: "stopped" } });
        setButtonState("Тест остановлен", false);
        return;
      }
      const queue = { runId: `${Date.now()}`, index: 0, status: "running" };
      await chrome.storage.local.set({ [queueKey]: queue });
      await startCase(queue, 0);
      monitorQueue(queue);
    });
    document.body.appendChild(button);
  }

  async function initializeQueue() {
    const state = await chrome.storage.local.get([queueKey, "isEnabled"]);
    if (state[queueKey]?.status === "running") monitorQueue(state[queueKey]);
    if (document.body) createButton();
    else document.addEventListener("DOMContentLoaded", createButton, { once: true });
  }

  chrome.storage.onChanged.addListener(handleStorageChange);
  initializeQueue();
})();
