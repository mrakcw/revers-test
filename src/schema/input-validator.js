// Слой нормализации и валидации входного объекта для единого execution-модуля.

/**
 * Нормализует входной объект данных к единообразному формату.
 */
export function normalizeInput(rawInput = {}) {
  const mode = (rawInput.mode || "SHORT").toUpperCase();

  const client = rawInput.client || {};
  const target = rawInput.target || {};

  const documentType = (client.documentType || (client.nie ? "NIE" : "PASSPORT")).toUpperCase();

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
  const officeMode = (target.officeMode || "prefer").toLowerCase() === "strict" ? "strict" : "prefer";

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

/**
 * Проверяет нормализованные входные данные.
 * Возвращает { valid: boolean, errors: string[], input: object }
 */
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

  // Валидация режима
  if (!["SHORT", "FULL"].includes(input.mode)) {
    errors.push(`Недопустимый режим mode: '${input.mode}'. Ожидается 'SHORT' или 'FULL'.`);
  }

  // Валидация target
  if (!input.target.city) {
    errors.push("Укажите провинцию target.city.");
  }

  if (!input.target.procedure || isNaN(input.target.procedure)) {
    errors.push("Укажите корректный идентификатор процедуры target.procedure.");
  }

  // Валидация client
  if (!input.client.name) {
    errors.push("Укажите имя клиента client.name.");
  } else if (!/^[A-Z\s]+$/.test(input.client.name)) {
    errors.push("Имя client.name должно содержать только заглавные латинские буквы и пробелы.");
  }

  if (input.client.documentType === "NIE") {
    if (!input.client.nie) {
      errors.push("При выборе типа документа NIE поле client.nie обязательно.");
    } else if (!/^[A-Z][0-9]+[A-Z]$/.test(input.client.nie)) {
      errors.push("Формат NIE недействителен (ожидается формат Y1234567X).");
    }
  } else if (input.client.documentType === "PASSPORT") {
    if (!input.client.passport) {
      errors.push("При выборе типа документа PASSPORT поле client.passport обязательно.");
    }
  }

  if (input.mode === "FULL") {
    if (input.client.phone && !/^[67]\d{8}$/.test(input.client.phone)) {
      errors.push("Телефон client.phone должен содержать 9 цифр и начинаться с 6 или 7.");
    }
    if (input.client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.client.email)) {
      errors.push("Некорректный формат email client.email.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    input,
  };
}
