/**
 * ============================================================================
 * ЕДИНЫЙ АВТОНОМНЫЙ EXECUTION-МОДУЛЬ ICPPLUS (Single File Execution Module)
 * ============================================================================
 * 
 * Модуль отвечает ТОЛЬКО за один однократный проход сценария (Single Pass).
 * НЕ выполняет повторные циклы (retry/schedulers).
 * НИКОГДА не бронирует записи (Read-Only availability checker & slots extractor).
 * 
 * Поддерживает 2 режима:
 * - SHORT: минимальный быстрый проход для проверки наличия слотов (~6 шагов).
 * - FULL:  полный проход с извлечением всех доступных вариантов (~8 шагов).
 */

import { PROCEDURE_META } from "./procedures.js";

// ----------------------------------------------------------------------------
// 1. ВНУТРЕННИЕ ТАЙМИНГИ (Internal Timings)
// ----------------------------------------------------------------------------
export const TIMINGS = {
  pageLoadDelay: 1200,
  afterSelection: 500,
  elementWaitTimeout: 10000,
  scenarioTimeoutMs: 60000,
};

// ----------------------------------------------------------------------------
// 2. НОРМАЛИЗАЦИЯ И ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ
// ----------------------------------------------------------------------------
export function normalizeInput(rawInput = {}) {
  const mode = (rawInput.mode || "SHORT").toUpperCase();
  const client = rawInput.client || {};
  const target = rawInput.target || {};

  const documentType = (
    client.documentType || (client.nie ? "NIE" : "PASSPORT")
  ).toUpperCase();

  const name = (client.name || "").trim().toUpperCase();
  const nie = (client.nie || "").trim().toUpperCase();
  const passport = (client.passport || "").trim().toUpperCase();
  const birthYear = String(client.birthYear || "1990").trim();
  const phone = (client.phone || client.tel || "").replace(/\D/g, "");
  const email = (client.email || "").trim().toLowerCase();

  const city = (target.city || "").trim();
  const procedure = Number(target.procedure) || 0;
  const offices = Array.isArray(target.offices)
    ? target.offices.map((o) => String(o).trim()).filter(Boolean)
    : [];
  const officeMode =
    (target.officeMode || "prefer").toLowerCase() === "strict"
      ? "strict"
      : "prefer";

  return {
    jobId: String(rawInput.jobId || Date.now()),
    mode: mode === "FULL" ? "FULL" : "SHORT",
    client: {
      id: client.id || null,
      name,
      documentType: documentType === "PASSPORT" ? "PASSPORT" : "NIE",
      nie,
      passport,
      birthYear,
      phone,
      email,
    },
    target: {
      city,
      procedure,
      offices,
      officeMode,
    },
  };
}

export function validateInput(rawInput) {
  if (!rawInput || typeof rawInput !== "object") {
    return {
      valid: false,
      errors: ["Входные данные должны быть объектом."],
      input: null,
    };
  }

  const input = normalizeInput(rawInput);
  const errors = [];

  if (!["SHORT", "FULL"].includes(input.mode)) {
    errors.push(`Недопустимый режим mode: '${input.mode}'.`);
  }

  if (!input.target.city) {
    errors.push("Укажите провинцию target.city.");
  }

  if (!input.target.procedure || isNaN(input.target.procedure)) {
    errors.push("Укажите числовой ID процедуры target.procedure.");
  }

  if (!input.client.name) {
    errors.push("Укажите имя клиента client.name.");
  } else if (!/^[A-Z\s]+$/.test(input.client.name)) {
    errors.push("Имя client.name должно содержать только заглавные латинские буквы и пробелы.");
  }

  if (input.client.documentType === "NIE") {
    if (!input.client.nie) {
      errors.push("Поле client.nie обязательно при выборе NIE.");
    } else if (!/^[A-Z][0-9]+[A-Z]$/.test(input.client.nie)) {
      errors.push("Формат NIE недействителен (ожидается формат Y1234567X).");
    }
  } else if (input.client.documentType === "PASSPORT") {
    if (!input.client.passport) {
      errors.push("Поле client.passport обязательно при выборе PASSPORT.");
    }
  }

  if (input.mode === "FULL") {
    if (input.client.phone && !/^[67]\d{8}$/.test(input.client.phone)) {
      errors.push("Телефон client.phone должен содержать 9 цифр и начинаться с 6 или 7.");
    }
    if (input.client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.client.email)) {
      errors.push("Некорректный email client.email.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    input,
  };
}

// ----------------------------------------------------------------------------
// 3. МЕТАДАННЫЕ ФОРМ И ПРОВЕРКА CLAVE
// ----------------------------------------------------------------------------
export function getProcedureMeta(procedureId, city) {
  const numProcedure = Number(procedureId);
  const procMeta = PROCEDURE_META?.[numProcedure] || PROCEDURE_META?.[String(numProcedure)];
  const cityMeta = procMeta?.[city];

  if (cityMeta) {
    return {
      status: cityMeta.status || "SUCCESS",
      has_btnAccesoClave: Boolean(cityMeta.has_btnAccesoClave),
      has_btnEntrar: Boolean(cityMeta.has_btnEntrar),
      has_country: Boolean(cityMeta.has_country),
      has_date_doc: Boolean(cityMeta.has_date_doc),
      has_name: Boolean(cityMeta.has_name),
      has_nie: Boolean(cityMeta.has_nie),
      has_pas: Boolean(cityMeta.has_pas),
      has_year: Boolean(cityMeta.has_year),
    };
  }

  return {
    status: "SUCCESS",
    has_btnAccesoClave: false,
    has_btnEntrar: true,
    has_country: false,
    has_date_doc: false,
    has_name: true,
    has_nie: true,
    has_pas: true,
    has_year: true,
  };
}

export function validateCityAndProcedure(city, procedureId) {
  const numProcedure = Number(procedureId);

  if (!city || typeof city !== "string") {
    return { valid: false, code: "UNSUPPORTED_CITY", message: "Не указана провинция." };
  }

  if (!numProcedure || isNaN(numProcedure)) {
    return { valid: false, code: "UNSUPPORTED_PROCEDURE", message: "Некорректный ID процедуры." };
  }

  const meta = getProcedureMeta(numProcedure, city);
  if (meta.status === "entrar_onlyClave") {
    return {
      valid: false,
      code: "CLAVE_ONLY",
      message: `Процедура ${procedureId} в провинции ${city} доступна только через Clave (entrar_onlyClave).`,
    };
  }

  return { valid: true, meta };
}

// ----------------------------------------------------------------------------
// 4. ОБРАБОТЧИК ОФИСОВ (Strict vs Prefer)
// ----------------------------------------------------------------------------
export function handleOfficeSelection(selectElement, selectedOffices = [], officeMode = "prefer") {
  if (!selectElement) {
    return { success: false, error: "OFFICE_SELECT_NOT_FOUND" };
  }

  const validOptions = Array.from(selectElement.options).filter(
    (opt) => opt.value && opt.value !== "" && opt.value !== "99" && opt.value !== "-1",
  );

  if (validOptions.length === 0) {
    return { success: false, error: "NO_VALID_OFFICES_ON_PAGE" };
  }

  const isAnyMode = !selectedOffices || selectedOffices.length === 0;

  if (officeMode === "strict" && !isAnyMode) {
    const matchedOption = validOptions.find((opt) => selectedOffices.includes(opt.value.trim()));
    if (!matchedOption) {
      return {
        success: false,
        error: "OFFICE_NOT_AVAILABLE",
        message: `Нужный офис из списка [${selectedOffices.join(", ")}] недоступен в режиме strict.`,
      };
    }
    selectElement.value = matchedOption.value;
    selectElement.dispatchEvent(new Event("change", { bubbles: true }));
    return { success: true, selectedValue: matchedOption.value, selectedText: matchedOption.text.trim() };
  }

  if (officeMode === "prefer" && !isAnyMode) {
    const matchedOption = validOptions.find((opt) => selectedOffices.includes(opt.value.trim()));
    const targetOption = matchedOption || validOptions[0];
    selectElement.value = targetOption.value;
    selectElement.dispatchEvent(new Event("change", { bubbles: true }));
    return { success: true, selectedValue: targetOption.value, selectedText: targetOption.text.trim() };
  }

  const defaultOption = validOptions[0];
  selectElement.value = defaultOption.value;
  selectElement.dispatchEvent(new Event("change", { bubbles: true }));
  return { success: true, selectedValue: defaultOption.value, selectedText: defaultOption.text.trim() };
}

// ----------------------------------------------------------------------------
// 5. ПАРСЕР ДОСТУПНЫХ СЛОТОВ (extractAvailableSlots)
// ----------------------------------------------------------------------------
export function extractAvailableSlots(doc = document) {
  const slots = [];

  const radioButtons = Array.from(doc.querySelectorAll('input[type="radio"]'));
  if (radioButtons.length > 0) {
    radioButtons.forEach((radio, index) => {
      if (radio.disabled) return;
      const radioId = radio.id || `cita_${index + 1}`;
      const value = radio.value || "";

      let labelText = "";
      const labelEl = doc.querySelector(`label[for="${radioId}"]`);
      if (labelEl) {
        labelText = labelEl.textContent.trim();
      } else {
        const parentCell = radio.closest("td, div, li, tr");
        if (parentCell) labelText = parentCell.textContent.trim();
      }

      const dateMatch = labelText.match(/(\d{2}\/\d{2}\/\d{4})/);
      const timeMatch = labelText.match(/(\d{2}:\d{2})/);
      const officeMatch = labelText.match(/(?:Sede|Oficina|CNP):\s*([^\n\r]+)/i);

      slots.push({
        id: radioId,
        value,
        radioId,
        text: labelText,
        date: dateMatch ? dateMatch[1] : "",
        time: timeMatch ? timeMatch[1] : "",
        office: officeMatch ? officeMatch[1].trim() : "",
      });
    });

    if (slots.length > 0) return slots;
  }

  const libreElements = Array.from(doc.querySelectorAll("a, span, td, div")).filter(
    (el) => el.textContent.trim() === "LIBRE" || el.textContent.trim().includes("LIBRE"),
  );

  if (libreElements.length > 0) {
    libreElements.forEach((el, index) => {
      const row = el.closest("tr, div.row, div.fld");
      const text = row ? row.textContent.trim() : el.textContent.trim();
      const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
      const timeMatch = text.match(/(\d{2}:\d{2})/);

      slots.push({
        id: `libre_${index + 1}`,
        value: el.getAttribute("href") || `libre_${index + 1}`,
        radioId: null,
        text,
        date: dateMatch ? dateMatch[1] : "",
        time: timeMatch ? timeMatch[1] : "",
        office: "",
      });
    });

    if (slots.length > 0) return slots;
  }

  return slots;
}

// ----------------------------------------------------------------------------
// 6. ДЕТЕКТОР ОШИБОК САЙТА (detectSiteError)
// ----------------------------------------------------------------------------
export function detectSiteError(doc = document) {
  const bodyText = doc.body ? doc.body.innerText : "";
  if (!bodyText) return null;

  if (bodyText.includes("Too Many Requests") || bodyText.includes("HTTP 429")) {
    return {
      status: "RATE_LIMITED",
      code: "HTTP_429",
      message: "Сайт вернул ограничение по количеству запросов (Too Many Requests).",
    };
  }

  if (bodyText.includes("The requested URL was rejected") || bodyText.includes("Forbidden")) {
    return {
      status: "SITE_ERROR",
      code: "HTTP_403",
      message: "Доступ к странице заблокирован сайтом (Forbidden / URL rejected).",
    };
  }

  if (
    bodyText.includes("Service Unavailable") ||
    bodyText.includes("ERROR [503]") ||
    bodyText.includes("Internal Server Error") ||
    bodyText.includes("ERR_EMPTY_RESPONSE") ||
    bodyText.includes("ERR_CONNECTION_TIMED_OUT")
  ) {
    return {
      status: "SITE_ERROR",
      code: "HTTP_503",
      message: "Сервер недоступен или вернул ошибку обработки (Service Unavailable / 503 / 500).",
    };
  }

  if (
    bodyText.includes("Lo sentimos, pero has superado el máximo de citas en vigor") ||
    bodyText.includes("максимум активных записей")
  ) {
    return {
      status: "ERROR",
      code: "MAX_CITAS_EXCEEDED",
      message: "Превышен лимит активных записей для данного документа.",
    };
  }

  return null;
}

// ----------------------------------------------------------------------------
// 7. ЕДИНАЯ ТОЧЕЧНАЯ ФУНКЦИЯ ЗАПУСКА: runScenario(input) / executeScenario(input)
// ----------------------------------------------------------------------------
export async function runScenario(rawInput) {
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

export const executeScenario = runScenario;
