// Распознавание ошибок сайта, блокировок WAF и нестандартных страниц.

/**
 * Анализирует текст страницы на наличие внешних ошибок.
 * Возвращает null или объект { status: string, code: string, message: string }
 */
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
