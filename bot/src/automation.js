import { launchAutomationBrowser } from "./playwright-runner.js";

const activeRuns = new Map();
const requiredStrings = ["name", "city", "tel", "email"];

export function validateAutomationPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Payload должен быть объектом.");
  }
  for (const field of requiredStrings) {
    if (typeof payload[field] !== "string" || !payload[field].trim()) {
      throw new TypeError(`Поле payload.${field} обязательно и должно быть строкой.`);
    }
  }
  if (
    payload.procedure == null ||
    String(payload.procedure).trim() === "" ||
    !Number.isInteger(Number(payload.procedure))
  ) {
    throw new TypeError("Поле payload.procedure должно содержать числовой ID процедуры.");
  }
  if (!Array.isArray(payload.offices ?? [])) {
    throw new TypeError("Поле payload.offices должно быть массивом ID офисов.");
  }
  if (payload.officeMode && !["prefer", "strict"].includes(payload.officeMode)) {
    throw new TypeError('Поле payload.officeMode должно быть "prefer" или "strict".');
  }
  if (payload.checkMode && !["offices", "dates"].includes(payload.checkMode)) {
    throw new TypeError('Поле payload.checkMode должно быть "offices" или "dates".');
  }
  if (payload.documentType === "PASSPORT" && !payload.passport) {
    throw new TypeError("Для documentType PASSPORT требуется passport.");
  }
  if (payload.documentType !== "PASSPORT" && !payload.nie) {
    throw new TypeError("Для documentType NIE требуется nie.");
  }
  return {
    ...payload,
    procedure: Number(payload.procedure),
    offices: (payload.offices ?? []).map(String),
    officeMode: payload.officeMode || "prefer",
    checkMode: payload.checkMode || "offices",
    documentType: payload.documentType === "PASSPORT" ? "PASSPORT" : "NIE",
  };
}

// Единая точка запуска для Telegram-обработчиков и других модулей бота.
export async function startAutomation(
  payload,
  onEvent = () => {},
  options = {},
) {
  const normalizedPayload = validateAutomationPayload(payload);
  return launchAutomationBrowser(normalizedPayload, onEvent, options);
}

export async function stopAutomation(run, reason = "stopped_by_user") {
  if (run) await run.stop(reason);
}

export function registerRun(chatId, run) {
  if (activeRuns.has(chatId)) throw new Error("В этом чате уже выполняется запуск.");

  activeRuns.set(chatId, run);
  run.context.once("close", () => {
    if (activeRuns.get(chatId) === run) activeRuns.delete(chatId);
  });
  return run;
}

export function getRun(chatId) {
  return activeRuns.get(chatId) ?? null;
}

export async function stopAllRuns() {
  const runs = [...activeRuns.values()];
  activeRuns.clear();
  await Promise.allSettled(runs.map((run) => run.close()));
}
