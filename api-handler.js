// Локальный ответчик для отладки. В этом модуле нет сетевых запросов.
const MOCK_ATTEMPT_ID = "local-test-attempt";
const MOCK_USER = {
  ok: true,
  userId: "local-test-user",
  hash: "local-test-session",
  username: "local-test",
  first_name: "Локальный тест",
};

const ALLOWED_MODES = new Set([
  "check_auth",
  "verify_access",
  "start_attempt",
  "consume_run",
  "poll_codes",
  "booking_confirmed",
  "book_date",
  "sms_send",
  "already_has_booking",
]);

// Возвращает стабильные тестовые данные; коды CAPTCHA и SMS намеренно не подставляются.
function getMockResponse(mode, payload = {}) {
  switch (mode) {
    case "check_auth":
      return { ...MOCK_USER };
    case "verify_access":
      return {
        ok: true,
        access: "test",
      };
    case "start_attempt":
      return { ok: true, attemptId: MOCK_ATTEMPT_ID };
    case "consume_run":
      return { ok: true, attemptId: payload.attemptId || MOCK_ATTEMPT_ID };
    case "poll_codes":
      return { ok: true, sms: null, captcha: null };
    case "booking_confirmed":
    case "book_date":
    case "sms_send":
    case "already_has_booking":
      return { ok: true, mode, received: payload };
    default:
      return { ok: false, error: "unknown_mock_mode" };
  }
}

// Обрабатывает только известные команды от контекстов этого расширения.
export function registerMockApiHandler() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      sender.id !== chrome.runtime.id ||
      message?.action !== "MOCK_API_REQUEST"
    ) {
      return false;
    }

    if (!ALLOWED_MODES.has(message.mode)) {
      sendResponse({ ok: false, error: "unsupported_mock_mode" });
      return false;
    }

    sendResponse(getMockResponse(message.mode, message.payload));
    return false;
  });
}
