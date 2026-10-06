// Тестовый набор для проверки единого файла execution-module.js

import assert from "node:assert";
import {
  runScenario,
  executeScenario,
  normalizeInput,
  validateInput,
  validateCityAndProcedure,
  getProcedureMeta,
  handleOfficeSelection,
  extractAvailableSlots,
  detectSiteError,
} from "../execution-module.js";

console.log("=== НАЧАЛО ТЕСТИРОВАНИЯ ЕДИНОГО EXECUTION МОДУЛЯ ===");

// ТЕСТ 1: Нормализация и валидация SHORT/FULL данных
{
  const inputShort = normalizeInput({
    mode: "SHORT",
    client: {
      name: "ivan petrov",
      documentType: "NIE",
      nie: "y1234567x",
      birthYear: "1990",
      phone: "612345678",
      email: "TEST@EXAMPLE.COM",
    },
    target: {
      city: "Madrid",
      procedure: 4036,
      offices: ["4"],
      officeMode: "prefer",
    },
  });

  assert.strictEqual(inputShort.mode, "SHORT");
  assert.strictEqual(inputShort.client.name, "IVAN PETROV");
  assert.strictEqual(inputShort.client.nie, "Y1234567X");
  assert.strictEqual(inputShort.client.email, "test@example.com");

  const valShort = validateInput(inputShort);
  assert.strictEqual(valShort.valid, true, "Valid SHORT payload");
  console.log("✓ ТЕСТ 1 PASSED: Нормализация и валидация данных");
}

// ТЕСТ 2: Ошибка валидации при неверном NIE
{
  const valErr = validateInput({
    mode: "SHORT",
    client: {
      name: "IVAN PETROV",
      documentType: "NIE",
      nie: "INVALID_NIE",
    },
    target: {
      city: "Madrid",
      procedure: 4036,
    },
  });

  assert.strictEqual(valErr.valid, false);
  assert.strictEqual(valErr.errors.length > 0, true);
  console.log("✓ ТЕСТ 2 PASSED: Распознавание ошибки валидации NIE");
}

// ТЕСТ 3: Проверка валидации параметров провинции и процедуры
{
  const validCheck = validateCityAndProcedure("Madrid", 4036);
  assert.strictEqual(validCheck.valid, true);

  const invalidProc = validateCityAndProcedure("Madrid", "invalid_proc");
  assert.strictEqual(invalidProc.valid, false);
  assert.strictEqual(invalidProc.code, "UNSUPPORTED_PROCEDURE");

  console.log("✓ ТЕСТ 3 PASSED: Валидация города и процедуры");
}

// ТЕСТ 4: Проверка Метаданных
{
  const meta = getProcedureMeta(4036, "Madrid");
  assert.strictEqual(meta.status, "SUCCESS");
  assert.strictEqual(typeof meta.has_nie, "boolean");
  console.log("✓ ТЕСТ 4 PASSED: Метаданные процедур (PROCEDURE_META)");
}

// ТЕСТ 5: Обработка офисов (Strict vs Prefer)
{
  const mockSelect = {
    options: [
      { value: "1", text: "Office 1" },
      { value: "2", text: "Office 2" },
      { value: "3", text: "Office 3" },
    ],
    value: "",
    dispatchEvent: () => {},
  };

  const strictFail = handleOfficeSelection(mockSelect, ["99"], "strict");
  assert.strictEqual(strictFail.success, false);
  assert.strictEqual(strictFail.error, "OFFICE_NOT_AVAILABLE");

  const preferOk = handleOfficeSelection(mockSelect, ["99"], "prefer");
  assert.strictEqual(preferOk.success, true);
  assert.strictEqual(preferOk.selectedValue, "1");

  console.log("✓ ТЕСТ 5 PASSED: Strict vs Prefer логика офисов");
}

// ТЕСТ 6: Парсер доступных слотов (extractAvailableSlots)
{
  const mockDoc = {
    querySelectorAll: (selector) => {
      if (selector === 'input[type="radio"]') {
        return [
          { id: "cita_1", value: "2026-10-10 10:00", disabled: false, closest: () => null },
          { id: "cita_2", value: "2026-10-10 10:30", disabled: false, closest: () => null },
        ];
      }
      return [];
    },
    querySelector: (sel) => {
      if (sel === 'label[for="cita_1"]') return { textContent: "10/10/2026 10:00 Sede Central" };
      if (sel === 'label[for="cita_2"]') return { textContent: "10/10/2026 10:30 Sede Central" };
      return null;
    },
  };

  const slots = extractAvailableSlots(mockDoc);
  assert.strictEqual(slots.length, 2);
  assert.strictEqual(slots[0].id, "cita_1");
  assert.strictEqual(slots[0].date, "10/10/2026");
  assert.strictEqual(slots[0].time, "10:00");
  console.log("✓ ТЕСТ 6 PASSED: Извлечение слотов (extractAvailableSlots)");
}

// ТЕСТ 7: Ошибки сайта (429, 403, 503)
{
  const mockDoc429 = { body: { innerText: "Too Many Requests HTTP 429" } };
  const err429 = detectSiteError(mockDoc429);
  assert.strictEqual(err429.status, "RATE_LIMITED");

  const mockDoc503 = { body: { innerText: "Service Unavailable ERROR [503]" } };
  const err503 = detectSiteError(mockDoc503);
  assert.strictEqual(err503.status, "SITE_ERROR");

  console.log("✓ ТЕСТ 7 PASSED: Детекция ошибок сайта (429, 503)");
}

// ТЕСТ 8: Наличие aliases runScenario и executeScenario
{
  assert.strictEqual(typeof runScenario, "function");
  assert.strictEqual(typeof executeScenario, "function");
  console.log("✓ ТЕСТ 8 PASSED: Наличие экспортов runScenario и executeScenario");
}

console.log("=== ВСЕ ТЕСТЫ ЕДИНОГО ФАЙЛА УСПЕШНО ПРОЙДЕНЫ ===");
