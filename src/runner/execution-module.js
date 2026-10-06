// Единая главная функция запуска автономного сценария (runScenario / executeScenario).

import { validateInput } from "../schema/input-validator.js";
import { validateCityAndProcedure } from "../handlers/meta-handler.js";

/**
 * Единая точечная функция запуска выполнения сценария (SHORT или FULL).
 * 
 * @param {Object} rawInput - Объект входных данных
 * @returns {Promise<Object>} Структурированный результат выполнения
 */
export async function runScenario(rawInput) {
  // 1. Валидация входных данных
  const validation = validateInput(rawInput);
  if (!validation.valid) {
    return {
      ok: false,
      status: "VALIDATION_ERROR",
      error: {
        code: "VALIDATION_ERROR",
        message: validation.errors.join(" "),
      },
    };
  }

  const input = validation.input;

  // 2. Валидация города и процедуры
  const cityProcCheck = validateCityAndProcedure(input.target.city, input.target.procedure);
  if (!cityProcCheck.valid) {
    return {
      ok: false,
      status: cityProcCheck.code === "CLAVE_ONLY" ? "CLAVE_ONLY" : "VALIDATION_ERROR",
      error: {
        code: cityProcCheck.code,
        message: cityProcCheck.message,
      },
    };
  }

  // 3. Передача выполнения в background service worker через messaging
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        {
          action: "RUN_SCENARIO_EXECUTION",
          payload: input,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              ok: false,
              status: "ERROR",
              error: {
                code: "RUNTIME_ERROR",
                message: chrome.runtime.lastError.message,
              },
            });
            return;
          }

          if (response) {
            resolve(response);
          } else {
            resolve({
              ok: false,
              status: "ERROR",
              error: {
                code: "NO_RESPONSE",
                message: "Не получен ответ от background сервиса.",
              },
            });
          }
        },
      );
    } catch (e) {
      resolve({
        ok: false,
        status: "ERROR",
        error: {
          code: "EXECUTION_EXCEPTION",
          message: e.message || String(e),
        },
      });
    }
  });
}

// Альтернативный alias для максимального удобства
export const executeScenario = runScenario;
