// Обработчик метаданных процедур и провинций (PROCEDURE_META).
// Учитывает, что список процедур и провинций запрашивается из внешней БД/связей.

import { PROCEDURE_META } from "../../procedures.js";

/**
 * Возвращает метаданные полей формы для пары «процедура + провинция».
 */
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

  // Дефолтные метаданные, если процедура добавлена из БД и отсутствует в статическом PROCEDURE_META
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

/**
 * Проверяет сочетание провинции и процедуры по PROCEDURE_META.
 * Не блокирует новые связи из БД.
 */
export function validateCityAndProcedure(city, procedureId) {
  const numProcedure = Number(procedureId);

  if (!city || typeof city !== "string") {
    return {
      valid: false,
      code: "UNSUPPORTED_CITY",
      message: "Не указана провинция.",
    };
  }

  if (!numProcedure || isNaN(numProcedure)) {
    return {
      valid: false,
      code: "UNSUPPORTED_PROCEDURE",
      message: "Некорректный ID процедуры.",
    };
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
