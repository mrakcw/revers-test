// Исполнитель получает уже разрешенный ботом payload.
console.log("Script запущен!");
const LOCAL_TEST_MODE = true;

// Находит поле по тексту подписи, заполняет его и сообщает странице об изменении.
function fillInputByLabel(labelText, value) {
  const labels = document.querySelectorAll("label");

  let labelFound = false;

  labels.forEach((label) => {
    const spans = label.querySelectorAll("span");

    spans.forEach((span) => {
      if (span.textContent.includes(labelText)) {
        const inputId = label.getAttribute("for");

        if (inputId) {
          const input = document.getElementById(inputId);

          if (input) {
            input.value = value.toLowerCase();
            input.dispatchEvent(new Event("input", { bubbles: true }));
            labelFound = true;
          } else {
            console.warn(`Инпут с id "${inputId}" не найден.`);
          }
        } else {
          console.warn("Атрибут for у label отсутствует.");
        }
      }
    });
  });

  if (!labelFound) {
    console.warn(`Метка с текстом "${labelText}" не найдена.`);
  }
}

// Заполняет найденный элемент по CSS-селектору, если передано значение.
async function fillIfExists(selector, value) {
  const el = document.querySelector(selector);
  if (el && value != null) {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

// Нажимает найденный элемент и выдерживает короткую паузу для реакции страницы.
async function clickIfExists(selector) {
  const el = document.querySelector(selector);
  if (el) {
    el.click();
    await sleep(500);
  }
}

// Выбирает в выпадающем списке первый пункт, текст которого содержит искомую строку.
function selectOptionByText(selectEl, text) {
  if (!selectEl) return false;
  const opt = [...selectEl.options].find((o) =>
    o.textContent.trim().includes(text),
  );
  if (opt) {
    opt.selected = true;
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

// При необходимости корректирует задержку так, чтобы завершение попало в заданное временное окно.
function adjustDuration(duration) {
  const now = new Date();
  const currentMinutes = now.getMinutes();
  const currentSeconds = now.getSeconds();

  const currentTimeInSeconds = currentMinutes * 60 + currentSeconds;

  const targetEndInSeconds = 59 * 60 + 36;

  const projectedEndTimeModuloSeconds =
    (currentTimeInSeconds + duration) % 3600;

  const windowStartSeconds = 57 * 60; // 3420
  const windowEndSeconds = 3 * 60; // 180

  const needsAdjustmentCheck =
    projectedEndTimeModuloSeconds >= windowStartSeconds ||
    projectedEndTimeModuloSeconds <= windowEndSeconds;

  if (needsAdjustmentCheck) {
    let secondsUntilTargetEnd;
    if (currentTimeInSeconds <= targetEndInSeconds) {
      secondsUntilTargetEnd = targetEndInSeconds - currentTimeInSeconds;
    } else {
      secondsUntilTargetEnd = 3600 - currentTimeInSeconds + targetEndInSeconds;
    }

    if (secondsUntilTargetEnd <= 0) {
      secondsUntilTargetEnd += 3600;
    }

    const potentialAdjustedDuration = secondsUntilTargetEnd;

    const adjustmentAmount = Math.abs(potentialAdjustedDuration - duration);

    const maxAdjustmentAllowed = 5 * 60;
    const minAdjustedDurationAllowed = 5;

    if (
      adjustmentAmount <= maxAdjustmentAllowed &&
      potentialAdjustedDuration >= minAdjustedDurationAllowed
    ) {
      console.log(
        `[adjustDuration] Adjustment applied: Original ${duration}s -> Adjusted ${potentialAdjustedDuration}s. Current time: ${currentMinutes}:${currentSeconds}. Original projected end ~ ${Math.floor(
          projectedEndTimeModuloSeconds / 60,
        )}:${projectedEndTimeModuloSeconds % 60}`,
      );
      return potentialAdjustedDuration;
    } else {
      console.log(
        `[adjustDuration] Adjustment needed but constraints failed: Original ${duration}s, Potential ${potentialAdjustedDuration}s, Diff ${adjustmentAmount}s. Keeping original. Current time: ${currentMinutes}:${currentSeconds}. Original projected end ~ ${Math.floor(
          projectedEndTimeModuloSeconds / 60,
        )}:${projectedEndTimeModuloSeconds % 60}`,
      );
    }
  }

  return duration;
}

// Создает Promise-паузу; используется функциями, которым нужно дождаться интерфейса сайта.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Вычисляет задержку до заданной точки повторяющегося пятиминутного интервала.
function getMillisecondsUntilNextTarget() {
  const FIVE_MINUTES_MS = 5 * 60 * 1000; // 300 000 миллисекунд
  const OFFSET_MS = 24 * 1000; // 24 000 миллисекунд

  const targetPointInInterval = FIVE_MINUTES_MS - OFFSET_MS; // 276 000 миллисекунд

  const now = Date.now();

  const msIntoCurrentInterval = now % FIVE_MINUTES_MS;

  let msToWait;

  if (msIntoCurrentInterval <= targetPointInInterval) {
    msToWait = targetPointInInterval - msIntoCurrentInterval;
  } else {
    const msToEndOfCurrentInterval = FIVE_MINUTES_MS - msIntoCurrentInterval;
    msToWait = msToEndOfCurrentInterval + targetPointInInterval;
  }

  return msToWait;
}

// Запрашивает у фонового скрипта, должна ли текущая вкладка выполнять автоматизацию.
async function isActiveTab() {
  return new Promise((resolve) => {
    citaBot.sendMessage({ action: "IS_ACTIVE_TAB" }, (res) =>
      resolve(res?.ok),
    );
  });
}

// Показывает поверх страницы обратный отсчет на указанное число секунд.
function startCountdown(duration) {
  const countdownElement = document.createElement("div");
  countdownElement.style.position = "absolute";
  countdownElement.style.top = "10px";
  countdownElement.style.left = "50%";
  countdownElement.style.transform = "translateX(-50%)";
  countdownElement.style.backgroundColor = "rgba(0, 0, 255, 0.8)";
  countdownElement.style.color = "white";
  countdownElement.style.fontSize = "32px";
  countdownElement.style.fontWeight = "bold";
  countdownElement.style.padding = "10px 20px";
  countdownElement.style.borderRadius = "10px";
  countdownElement.style.zIndex = "9999";
  countdownElement.textContent = formatTime(duration);

  document.body.appendChild(countdownElement);

  let remainingTime = duration;

  const interval = setInterval(() => {
    remainingTime -= 1;

    if (remainingTime <= 0) {
      clearInterval(interval);
      countdownElement.remove();
    } else {
      countdownElement.textContent = formatTime(remainingTime);
    }
  }, 1000);
}

// Передает сведения о подтвержденной записи обработчику бота.
async function notifyBookingConfirmed(data) {
  await citaBot.sendMessage({
    action: "AUTOMATION_RESULT",
    resultType: "booking_confirmation",
    data,
  });
}

// Передает краткий статус обработчику бота.
async function notifySimple(type) {
  await citaBot.sendMessage({ action: "AUTOMATION_STATUS", status: type });
}

async function notifyAvailability(image = null) {
  await citaBot.sendMessage({
    action: "AUTOMATION_STATUS",
    status: "availability_found",
    data: image ? { image } : undefined,
  });
}

// Создает временное уведомление в углу страницы и удаляет его после показа.
function showNotification(message, duration = 3000) {
  let notificationContainer = document.getElementById("notification-container");

  if (!notificationContainer) {
    notificationContainer = document.createElement("ul");
    notificationContainer.id = "notification-container";
    notificationContainer.style.position = "fixed";
    notificationContainer.style.top = "10px";
    notificationContainer.style.right = "10px";
    notificationContainer.style.margin = "0";
    notificationContainer.style.padding = "0";
    notificationContainer.style.listStyleType = "none";
    notificationContainer.style.zIndex = "9999";
    document.body.appendChild(notificationContainer);
  }

  const notificationElement = document.createElement("li");
  notificationElement.style.backgroundColor = "rgba(0, 0, 255, 0.8)";
  notificationElement.style.color = "white";
  notificationElement.style.fontSize = "16px";
  notificationElement.style.fontWeight = "bold";
  notificationElement.style.padding = "10px 20px";
  notificationElement.style.marginBottom = "10px";
  notificationElement.style.borderRadius = "5px";
  notificationElement.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
  notificationElement.style.opacity = "1";
  notificationElement.style.transition = "opacity 0.5s ease";
  notificationElement.textContent = message;

  notificationContainer.appendChild(notificationElement);

  setTimeout(() => {
    notificationElement.style.opacity = "0";
    setTimeout(() => {
      notificationElement.remove();
    }, 500);
  }, duration);
}

// Запрашивает код у интеграции бота; доступ и получение кода не зависят от API расширения.
async function waitForCode(type, image = null) {
  if (LOCAL_TEST_MODE) {
    showNotification(
      `Локальная отладка: автоматический ввод кода ${type} отключен.`,
      10000,
    );
    return null;
  }

  const response = await citaBot.sendMessage({
    action: "WAIT_FOR_CODE",
    codeType: type,
    image,
  });
  if (!response?.code) {
    await citaBot.sendMessage({
      action: "STOP_AUTOMATION",
      reason: `code_unavailable_${type}`,
    });
    throw new Error(`Интеграция бота не передала код ${type}.`);
  }

  const input = document.getElementById(
    type === "sms" ? "txtCodigoVerificacion" : "captcha",
  );
  if (!input) throw new Error(`Не найдено поле ввода кода ${type}.`);
  input.value = type === "captcha" ? response.code.toLowerCase() : response.code;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return response.code;
}

// Преобразует секунды в отображаемый формат «минуты:секунды».
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

// Проверяет текст страницы на признаки ошибки загрузки и перенаправляет при их обнаружении.
async function checkPageStatus() {
  const bodyText = document.body?.innerText || "";

  if (
    bodyText.includes("Страница недоступна") ||
    bodyText.includes("ERR_EMPTY_RESPONSE")
  ) {
    console.error("Портал вернул ошибку загрузки; автоматизация остановлена.");
    showNotification("Ошибка загрузки портала. Проверка остановлена.", 15000);
    await citaBot.sendMessage({ action: "PORTAL_ERROR", reason: bodyText.slice(0, 300) });
    await citaBot.storage.set({ isEnabled: false });
    await citaBot.sendMessage({ action: "STOP_AUTOMATION", reason: "portal_load_error" });
  }
}

// Ожидает появления элемента в DOM до истечения заданного времени.
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const interval = 100;
    let elapsed = 0;
    const check = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(check);
        resolve(element);
      }
      elapsed += interval;
      if (elapsed >= timeout) {
        clearInterval(check);
        reject(
          new Error(
            `Элемент с селектором ${selector} не найден за ${timeout}мс`,
          ),
        );
      }
    }, interval);
  });
}

// Разрешает Promise сразу после полной загрузки документа или по событию load.
function waitForPageLoad(timeout = PORTAL_PAGE_READY_TIMEOUT_MS) {
  if (document.readyState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(deadline);
      window.removeEventListener("load", onLoad);
      if (error) reject(error);
      else resolve();
    };
    const onLoad = () => finish();
    const deadline = setTimeout(
      () => finish(new Error(`Документ не загрузился за ${timeout} мс.`)),
      timeout,
    );
    window.addEventListener("load", onLoad, { once: true });
  });
}

const PORTAL_PAGE_READY_TIMEOUT_MS = 30000;
const DOM_QUIET_PERIOD_MS = 700;

function hasPopulatedSelect(selector) {
  const select = document.querySelector(selector);
  return Boolean(select && select.options.length > 1 && !select.disabled);
}

function portalFunctionsReady(...names) {
  return names.every((name) => typeof window[name] === "function");
}

function isFinalAvailabilityPage() {
  return isPortalPage("acCitar");
}

function inlineHandlerReady(element, functionName) {
  const handler = element?.getAttribute("onclick") || "";
  return !new RegExp(`\\b${functionName}\\s*\\(`).test(handler) ||
    portalFunctionsReady(functionName);
}

function isTerminalPortalScreen() {
  const text = document.body?.innerText || "";
  return (isFinalAvailabilityPage() &&
    /en este momento no hay citas disponibles/i.test(text)) || [
    "Too Many Requests",
    "ERR_",
    "The requested URL was rejected",
    "Internal Server Error",
    "ERROR [503]",
    "Service Unavailable",
    "Forbidden",
    "CITA CONFIRMADA",
    "Selecciona una de las siguientes citas disponibles",
  ].some((marker) => text.includes(marker)) ||
    text.includes("LIBRE") ||
    Boolean(document.querySelector("#captcha, #txtCodigoVerificacion, #btnConfirmar"));
}

function hasExpectedPortalControls() {
  const path = location.pathname;
  if (path.includes("/icpplustiem/index.html")) {
    const submitButton = document.querySelector("#submit");
    return Boolean(submitButton && inlineHandlerReady(submitButton, "envia")) ||
      (hasPopulatedSelect("select#form") &&
        Boolean(document.querySelector("#btnAceptar")) &&
        portalFunctionsReady("envia"));
  }
  if (isPortalPage("citar")) {
    return ["#tramiteGrupo\\[0\\]", "#tramiteGrupo\\[1\\]"].some(hasPopulatedSelect) &&
      Boolean(document.querySelector("#btnAceptar")) &&
      portalFunctionsReady("envia", "eliminarSeleccionOtrosGrupos", "cargaMensajesTramite");
  }
  if (isPortalPage("acInfo")) return Boolean(document.querySelector("#btnEntrar"));
  if (isPortalPage("acEntrada")) {
    return Boolean(document.querySelector("#txtIdCitado")) &&
      Boolean(document.querySelector("#txtDesCitado")) &&
      Boolean(document.querySelector("#btnEnviar")) &&
      portalFunctionsReady("envia");
  }
  if (isPortalPage("acValidarEntrada")) {
    return Boolean(document.querySelector("#btnEnviar, button[type='submit'], input[type='submit']")) &&
      portalFunctionsReady("enviar");
  }
  if (isPortalPage("acCitar")) {
    return (hasPopulatedSelect("#idSede") || hasPopulatedSelect("#sede")) &&
      Boolean(document.querySelector('[value="Siguiente"]')) &&
      portalFunctionsReady("enviar");
  }

  return Boolean(
    document.querySelector(
      "#btnConfirmar, #txtCodigoVerificacion, #captcha, #btnSubmit, input[type='radio'], #btnEnviar, [value='Siguiente']",
    ),
  );
}

function isKnownPortalPage() {
  return location.pathname.includes("/icpplustiem/index.html") ||
    ["citar", "acInfo", "acEntrada", "acValidarEntrada", "acCitar"].some(isPortalPage);
}

// Wait for the browser load event and the portal's actual controls/data. Some
// pages populate selects after `load`, so the fixed scenario pause must start later.
function waitForPortalContent(timeout = PORTAL_PAGE_READY_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let lastMutationAt = Date.now();
    const observer = new MutationObserver(() => {
      lastMutationAt = Date.now();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    const finish = (error) => {
      clearInterval(poll);
      clearTimeout(deadline);
      observer.disconnect();
      if (error) reject(error);
      else resolve();
    };
    const poll = setInterval(() => {
      if (document.readyState !== "complete" || !document.body) return;
      if (isTerminalPortalScreen() || hasExpectedPortalControls()) {
        finish();
      } else if (
        !isKnownPortalPage() &&
        document.body.innerText.trim() &&
        Date.now() - lastMutationAt >= DOM_QUIET_PERIOD_MS
      ) {
        // Unknown intermediate screens are allowed only after their DOM settles.
        finish();
      }
    }, 100);
    const deadline = setTimeout(() => {
      finish(
        new Error(
          `Портал не подготовил DOM/элементы формы за ${timeout} мс (${location.pathname}).`,
        ),
      );
    }, timeout);
  });
}

// Показывает обратный отсчет и затем ожидает указанное количество миллисекунд.
function waitForAdditionalTime(ms) {
  startCountdown(Math.floor(ms / 1000));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConsentLabel(input) {
  const labels = [...(input.labels || [])]
    .map((label) => label.innerText || label.textContent || "")
    .join(" ");
  return (
    labels ||
    input.closest("label")?.innerText ||
    input.parentElement?.innerText ||
    ""
  ).replace(/\s+/g, " ").trim();
}

function acceptRequiredConsents() {
  const consentPattern =
    /acepto|he le[ií]do|consiento|conforme a las condiciones|autorizo expresamente/i;
  const checkboxes = [...document.querySelectorAll('input[type="checkbox"]')]
    .filter((input) => input.required || consentPattern.test(getConsentLabel(input)));

  for (const checkbox of checkboxes) {
    if (checkbox.checked) continue;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("input", { bubbles: true }));
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return checkboxes.length;
}

function collectAvailableOffices(selectElement) {
  return [...(selectElement?.options || [])]
    .filter((option) => option.value && option.value !== "99")
    .map((option) => ({ id: option.value.trim(), name: option.textContent.trim() }));
}

function collectAvailableDates() {
  const links = [...document.querySelectorAll("a")].filter(
    (link) => link.textContent.trim() === "LIBRE",
  );
  if (links.length) {
    return links.map((link) =>
      (link.closest("tr")?.innerText || link.parentElement?.innerText || "LIBRE")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return [...document.querySelectorAll('input[type="radio"]:not(:disabled)')]
    .map((radio) =>
      (radio.closest("tr")?.innerText || radio.parentElement?.innerText || "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function getNoSlotsMessage() {
  if (!isFinalAvailabilityPage()) return null;
  const message = document.querySelector("#mensajeInfo .mf-msg__info");
  const text = (message?.innerText || message?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
  return /en este momento no hay citas disponibles/i.test(text) ? text : null;
}

// The portal serves the same flow under /icpco and /icpplus, and may append
// ;jsessionid to a path segment. Match the page segment, not a hard-coded app root.
function isPortalPage(pageName) {
  const optionalVariant = pageName === "acCitar" ? "B?" : "";
  return new RegExp(`/${pageName}${optionalVariant}(?:;|$)`).test(location.pathname);
}

async function finishLocalCheck(resultType, data, reason) {
  await citaBot.sendMessage({ action: "AUTOMATION_RESULT", resultType, data });
  await citaBot.storage.set({ isEnabled: false });
  await citaBot.sendMessage({ action: "STOP_AUTOMATION", reason });
}

// Определяет текущее состояние портала по DOM и выполняет соответствующее действие.
// Ветви расположены по приоритету: ошибка/вход, данные заявителя, запись и подтверждение.
async function performSteps(userData) {
  if (stopped) return;
  try {
    console.log("Выполняем шаги скрипта...");
    showNotification("Выполняем шаги скрипта...");
    await waitForPageLoad();
    await waitForPortalContent();

    const actionDelay = document.querySelector('[value="Siguiente"]') ? 4800 : 4500;
    console.log(`DOM готов; выдержка перед действием ${actionDelay} мс`);
    showNotification(`DOM готов. Ждем ${actionDelay / 1000} сек перед действием...`, actionDelay);
    await waitForAdditionalTime(actionDelay);

    // В тестовом режиме проходим формы до слота, CAPTCHA, SMS или подтверждения записи.
    const pageText = document.body.innerText;
    const noSlotsMessage = getNoSlotsMessage();
    if (noSlotsMessage) {
      const message = noSlotsMessage;
      console.log("Портал сообщил, что свободных записей нет.");
      showNotification("Свободных записей нет. Проверка завершена.", 15000);
      await citaBot.sendMessage({
        action: "AUTOMATION_RESULT",
        resultType: "no_slots",
        data: { message },
      });
      await citaBot.storage.set({ isEnabled: false });
      await citaBot.sendMessage({ action: "STOP_AUTOMATION", reason: "no_slots" });
      return;
    }
    const bookingBoundaryReached =
      pageText.includes("LIBRE") ||
      pageText.includes("Selecciona una de las siguientes citas disponibles") ||
      pageText.includes("CITA CONFIRMADA") ||
      Boolean(
        document.querySelector(
          "#captcha, #txtCodigoVerificacion, #btnConfirmar",
        ),
      );

    if (LOCAL_TEST_MODE && bookingBoundaryReached) {
      const hasAvailableDates =
        pageText.includes("LIBRE") ||
        pageText.includes("Selecciona una de las siguientes citas disponibles");
      if (userData.checkMode === "dates" && hasAvailableDates) {
        await finishLocalCheck("dates", collectAvailableDates(), "date_results");
        return;
      }
      showNotification(
        "Тестовый проход остановлен перед выбором слота, кодом или подтверждением.",
        15000,
      );
      await citaBot.storage.set({ isEnabled: false });
      await citaBot.sendMessage({
        action: "STOP_AUTOMATION",
        reason: "local_test_booking_boundary",
      });
      return;
    }

    // Ошибки доступа/сервера завершают текущую проверку без автоматического повтора.
    if (
      document.body.innerText.includes("Too Many Requests") ||
      document.body.innerText.includes("ERR_") ||
      document.body.innerText.includes("The requested URL was rejected") ||
      document.body.innerText.includes("Internal Server Error") ||
      document.body.innerText.includes("ERROR [503]") ||
      document.body.innerText.includes("Service Unavailable") ||
      document.body.innerText.includes("Forbidden")
    ) {
      const reason = document.body.innerText
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);
      showNotification("Портал отклонил запрос или вернул ошибку. Проверка остановлена.", 15000);
      await citaBot.sendMessage({ action: "PORTAL_ERROR", reason });
      await citaBot.storage.set({ isEnabled: false });
      await citaBot.sendMessage({ action: "STOP_AUTOMATION", reason: "portal_rejected_request" });
      return;
    }

    // Обрабатывает начальные экраны: запуск процедуры, выбор провинции и подтвержденную запись.
    if (document.querySelector("#submit")) {
      const firstButton = await waitForElement("#submit");
      firstButton.click();
      console.log("Кнопка 'Acceder al Procedimiento' нажата");
      showNotification("Кнопка 'Acceder al Procedimiento' нажата");
    } else if (
      document.querySelector("#btnAceptar") &&
      document.querySelector("select#form")
    ) {
      const provinceSelect = document.querySelector("select#form");
      const valenciaOption = [...provinceSelect.options].find(
        (opt) => opt.textContent.trim().includes(userData.city),
      );
      if (valenciaOption) {
        provinceSelect.value = valenciaOption.value;
        provinceSelect.dispatchEvent(new Event("change", { bubbles: true }));
        document.querySelector("#btnAceptar").click();
        console.log(`Выбрана опция ${userData.city} и нажата кнопка 'Aceptar'`);
        showNotification(
          `Выбрана опция ${userData.city} и нажата кнопка 'Aceptar'`,
        );
      } else {
        throw new Error(`Опция ${userData.city} не найдена`);
      }
    } else if (document.body.innerText.includes("CITA CONFIRMADA")) {
      console.log("Запись подтверждена!");
      showNotification("Запись подтверждена!");
      const extractedData = {};

      const justificanteFinalElement =
        document.getElementById("justificanteFinal");
      if (justificanteFinalElement) {
        extractedData.justificanteFinal =
          justificanteFinalElement.textContent.trim();
      }

      const fieldset = document.querySelector("fieldset");
      if (fieldset) {
        const divs = fieldset.querySelectorAll(".fld");
        const labels = {
          Dirección: "address",
          "Día de la cita": "date",
          "Hora cita": "time",
          Mesa: "table",
        };
        divs.forEach((div) => {
          const labelSpan = div.querySelector(".label");
          if (labelSpan) {
            const labelText = labelSpan.textContent.trim();
            const key = labels[labelText];
            if (key) {
              const valueSpan = labelSpan.nextElementSibling;
              if (valueSpan) {
                extractedData[key] = valueSpan.textContent.trim();
              }
            }
          }
        });
      }

      let messageConfirm = "Данные о подтвержденной записи:\n";

      if (extractedData.justificanteFinal) {
        messageConfirm += `ID: ${extractedData.justificanteFinal}\n`;
      }
      if (extractedData.date) {
        messageConfirm += `Дата: ${extractedData.date}\n`;
      }
      if (extractedData.time) {
        messageConfirm += `Время: ${extractedData.time}\n`;
      }
      if (extractedData.address) {
        messageConfirm += `Адрес: ${extractedData.address}\n`;
      }
      await notifyBookingConfirmed(extractedData);
      stopped = true;

      showNotification("🎉 Запись подтверждена.", 600000);
      await citaBot.sendMessage({
        action: "STOP_AUTOMATION",
        reason: "booking_confirmed",
      });
    // Уведомляет о уже существующей записи и выбирает доступный способ входа.
    } else if (
      document.body.innerText.includes(
        "Lo sentimos, pero has superado el máximo de citas en vigor para este trámite en la provincia seleccionada.",
      )
    ) {
      console.log("Больше сит взять нельзя!");
      showNotification("Больше сит взять нельзя!");
      await notifySimple("already_has_booking");
    } else if (document.querySelector('button.idp-button[onclick*="SEGSOC"]')) {
      const authToButton = document.querySelector(
        'button.idp-button[onclick*="SEGSOC"]',
      );
      authToButton.click();
      showNotification("Нажата кнопка для авторизации");
    } else if (document.getElementById("btnFirmar")) {
      const btnFirmar = document.getElementById("btnFirmar");
      const loginInput = document.getElementById("id_owner");
      const passwordInput = document.getElementById("pin");

      if (userData && userData.usL && userData.piL) {
        if (loginInput && passwordInput) {
          loginInput.value = userData.usL;
          passwordInput.value = userData.piL;
          btnFirmar.click();
          showNotification("Выполняем вход");
        }
      } else {
        showNotification("Нет логина и пароля для входа");
      }
    // Подтверждает введенные на портале данные и при необходимости ожидает код SMS.
    } else if (document.querySelector("#btnConfirmar")) {
      const btnConfirmar = document.querySelector("#btnConfirmar");

      const chkTotal = document.getElementById("chkTotal");
      if (chkTotal) {
        chkTotal.checked = true;
      } else {
        console.log('Инпут с id="chkTotal" не найден');
      }

      const enviarCorreo = document.getElementById("enviarCorreo");
      if (enviarCorreo) {
        enviarCorreo.checked = true;
      } else {
        console.log('Инпут с id="enviarCorreo" не найден');
      }

      if (btnConfirmar) {
        console.log("Подтверждение !!!");
        showNotification("Подтверждение !!!");
        const input = document.getElementById("txtCodigoVerificacion");
        if (!input) {
          showNotification(
            "Поле ввода кода отсутствует! Попытка подтверждения...",
          );

          btnConfirmar.click();
        } else {
          await waitForCode("sms");

          btnConfirmar.click();
        }
        setTimeout(() => {
          const aceptarButton = [...document.querySelectorAll("button")].find(
            (btn) => btn.textContent.trim().toLowerCase() === "aceptar",
          );

          if (aceptarButton) {
            aceptarButton.click();
            console.log("✅ Кнопка 'aceptar' нажата.");
          } else {
            console.log("❌ Кнопка 'aceptar' не найдена.");
          }
        }, 1500);
      } else {
        console.log("Кнопка 'btnConfirmar' не найдена.");
        showNotification("Кнопка 'btnConfirmar' не найдена.");
      }
    // Находит процедуру по идентификатору в одном из возможных списков и подтверждает выбор.
    } else if (
      isPortalPage("acInfo") &&
      document.querySelector("#btnEntrar")
    ) {
      const acceptedCount = acceptRequiredConsents();
      const continueButton = document.querySelector("#btnEntrar, #btnAceptar");
      console.log(
        `Подтверждение условий: отмечено обязательных согласий ${acceptedCount}; нажата кнопка продолжения`,
      );
      continueButton.click();
      showNotification("Условия подтверждены, переходим дальше");
    } else if (
      document.querySelector("#btnAceptar") &&
      (document.getElementById("tramiteGrupo[0]") ||
        document.getElementById("tramiteGrupo[1]"))
    ) {
      const procedureValue = String(userData.procedure);

      const selectIds = ["tramiteGrupo[0]", "tramiteGrupo[1]"];

      const selects = selectIds
        .map((id) => document.getElementById(id))
        .filter(Boolean);

      if (!selects.length) {
        throw new Error("Не найден ни один select tramiteGrupo");
      }

      let targetSelect = null;
      let targetOption = null;

      for (const select of selects) {
        const option = [...select.options].find(
          (opt) => opt.value.trim() === procedureValue,
        );

        if (option) {
          targetSelect = select;
          targetOption = option;
          break;
        }
      }

      if (!targetSelect || !targetOption) {
        throw new Error(
          `Опция с value='${procedureValue}' не найдена ни в одном select`,
        );
      }

      targetSelect.value = procedureValue;

      targetSelect.dispatchEvent(new Event("change", { bubbles: true }));

      document.querySelector("#btnAceptar").click();

      console.log(
        `Выбрана процедура ${procedureValue} в select#${targetSelect.id}`,
      );

      showNotification(
        `Выбрана процедура ${procedureValue}, нажата кнопка Aceptar`,
      );
    // Переходит через кнопку входа либо заполняет форму идентификации пользователя.
    } else if (
      document.querySelector("#btnEntrar") &&
      !isPortalPage("acEntrada")
    ) {
      const entrarButton = await waitForElement("#btnEntrar");
      entrarButton.click();
      console.log("Кнопка 'Entrar' нажата");
      showNotification("Кнопка 'Entrar' нажата");
    } else if (
      isPortalPage("acEntrada") &&
      document.querySelector("#txtIdCitado")
    ) {
      if (!userData) {
        console.error("Данные пользователя не загружены");
        return;
      }

      const prefersPassport = userData.documentType === "PASSPORT";

      if (prefersPassport) {
        await clickIfExists('input[value="PASAPORTE"]');
      } else {
        await clickIfExists('input[value="N.I.E."]');
      }

      const docValue = prefersPassport ? userData.passport : userData.nie;

      await fillIfExists("#txtIdCitado", docValue);

      await fillIfExists("#txtDesCitado", userData.name);

      await fillIfExists("#txtAnnoCitado", userData.birthYear || "1990");

      const countrySelect =
        document.querySelector("#txtPaisNac") ||
        document.querySelector("#txtPaisNacionalidad");

      if (countrySelect) {
        selectOptionByText(countrySelect, "UCRANIA");
      }

      await clickIfExists("#btnEnviar");

      console.log("Данные введены и отправлены");
      showNotification("Данные введены и отправлены");
    } else if (
      isPortalPage("acValidarEntrada") &&
      (document.querySelector('#btnEnviar[value="Solicitar Cita"]') ||
        [...document.querySelectorAll("button, input[type='submit']")].find(
          (button) => button.textContent?.trim() === "Solicitar Cita" || button.value?.trim() === "Solicitar Cita",
        ))
    ) {
      const btnEnviar =
        document.querySelector('#btnEnviar[value="Solicitar Cita"]') ||
        [...document.querySelectorAll("button, input[type='submit']")].find(
          (button) => button.textContent?.trim() === "Solicitar Cita" || button.value?.trim() === "Solicitar Cita",
        );
      btnEnviar.click();
      console.log("Кнопка 'Solicitar Cita' нажата");
      showNotification("Кнопка 'Solicitar Cita' нажата");
    // Выбирает офис согласно режиму «обязательно» или «предпочтительно».
    } else if (
      isPortalPage("acCitar") &&
      document.querySelector('[value="Siguiente"]') &&
      (document.getElementById("idSede") || document.getElementById("sede"))
    ) {
      const selectedOffices = userData?.offices || [];
      const officeMode = userData?.officeMode || "prefer";

      const selectElement =
        document.getElementById("idSede") || document.getElementById("sede");

      const availableOffices = collectAvailableOffices(selectElement);
      await citaBot.sendMessage({
        action: "AUTOMATION_RESULT",
        resultType: "offices",
        data: availableOffices,
      });
      if (userData.checkMode !== "dates") {
        showNotification("Список доступных офисов получен. Проверка завершена.", 15000);
        await citaBot.storage.set({ isEnabled: false });
        await citaBot.sendMessage({ action: "STOP_AUTOMATION", reason: "office_results" });
        return;
      }
      if (!availableOffices.length) {
        showNotification("Портал не вернул доступных офисов. Проверка завершена.", 15000);
        await citaBot.storage.set({ isEnabled: false });
        await citaBot.sendMessage({ action: "STOP_AUTOMATION", reason: "offices_unavailable" });
        return;
      }

      if (selectElement) {
        const validOptions = Array.from(selectElement.options).filter(
          (option) =>
            option.value && option.value !== "" && option.value !== "99",
        );

        if (validOptions.length > 0) {
          let optionToSelect = null;
          const isAnyMode = selectedOffices.length === 0;
          if (officeMode === "strict" && !isAnyMode) {
            optionToSelect = validOptions.find((opt) =>
              selectedOffices.includes(opt.value.trim()),
            );

            if (!optionToSelect) {
              showNotification("Выбранных офисов нет. Проверка завершена.", 15000);
              await citaBot.storage.set({ isEnabled: false });
              await citaBot.sendMessage({
                action: "STOP_AUTOMATION",
                reason: "requested_offices_unavailable",
              });
              return;
            }
          } else if (officeMode === "prefer" && !isAnyMode) {
            optionToSelect = validOptions.find((opt) =>
              selectedOffices.includes(opt.value.trim()),
            );

            if (!optionToSelect) {
              optionToSelect = validOptions[0];
            }
          } else {
            optionToSelect = validOptions[0];
          }
          if (optionToSelect) {
            selectElement.value = optionToSelect.value;
            console.log(
              `Выбран офис: ${optionToSelect.text} (ID: ${optionToSelect.value})`,
            );

            showNotification(
              `Выбран офис: ${optionToSelect.text}. Переходим...`,
            );
            const nextBtn = document.querySelector('[value="Siguiente"]');
            if (nextBtn) {
              nextBtn.click();
            }
          }
        } else {
          console.log("Список офисов пуст на странице.");
        }
      }
    // Находит свободный слот, при необходимости ожидает CAPTCHA и продолжает запись.
    } else if (document.body.innerText.includes("LIBRE")) {
      console.log("Запись доступна. Отправка уведомления...");
      showNotification("Возможен выбор даты!");

      const link = [...document.querySelectorAll("a")].find(
        (el) => el.textContent.trim() === "LIBRE",
      );
      const captcha = document.getElementById("captcha");
      const captchaImage = document.querySelector('img[alt="captcha"]');

      if (captcha) {
        await notifyAvailability(captchaImage?.src || null);
        await waitForCode("captcha", captchaImage?.src || null);

        link.click();
        showNotification("Кнопка 'LIBRE' нажата.");

        setTimeout(() => {
          const Si = [...document.querySelectorAll("*")].find(
            (el) => el.textContent.trim() === "Sí",
          );
          if (Si) {
            Si.click();
          }
        }, 1500);
      } else {
        await notifyAvailability();

        link.click();
        setTimeout(() => {
          const Si = [...document.querySelectorAll("*")].find(
            (el) => el.textContent.trim() === "Sí",
          );
          if (Si) {
            Si.click();
          }
        }, 1500);
      }
    // Выбирает первый активный вариант даты, если портал показывает список доступных записей.
    } else if (
      document.querySelector('[value="Siguiente"]') &&
      document.body.innerText.includes(
        "Selecciona una de las siguientes citas disponibles",
      )
    ) {
      showNotification("Возможен выбор даты!");

      const radioButtons = Array.from(
        document.querySelectorAll('input[type="radio"]'),
      );
      const firstEnabledRadio = radioButtons.find((radio) => !radio.disabled);

      if (firstEnabledRadio) {
        firstEnabledRadio.checked = true;
        if (firstEnabledRadio.onclick) {
          firstEnabledRadio.onclick();
        }
      }

      const captcha = document.getElementById("captcha");
      const captchaImage = document.querySelector('img[alt="captcha"]');
      const next = document.querySelector('[value="Siguiente"]');

      if (captcha) {
        await notifyAvailability(captchaImage?.src || null);
        await waitForCode("captcha", captchaImage?.src || null);

        next.click();
        showNotification("Кнопка 'Siguiente' нажата.");

        setTimeout(() => {
          const Si = [...document.querySelectorAll("*")].find(
            (el) => el.textContent.trim() === "Sí",
          );
          if (Si) {
            Si.click();
          }
        }, 1500);
      } else {
        await notifyAvailability();

        next.click();
        setTimeout(() => {
          const Si = [...document.querySelectorAll("*")].find(
            (el) => el.textContent.trim() === "Sí",
          );
          if (Si) {
            Si.click();
          }
        }, 1500);
      }
    // Переходит по промежуточной кнопке либо отправляет контактные данные заявителя.
    } else if (
      document.querySelector('[value="Siguiente"]') &&
      !document.body.innerText.includes("Teléfono")
    ) {
      console.log("Запись доступна. Отправка уведомления...");
      showNotification("Запись доступна. Отправка уведомления...");
      const next = document.querySelector('[value="Siguiente"]');
      next.click();
    } else if (
      document.querySelector('[value="Siguiente"]') &&
      document.body.innerText.includes("Teléfono")
    ) {
      if (!userData) {
        console.error("Данные пользователя не загружены");
        return;
      }
      fillInputByLabel("Teléfono", userData.tel || "");
      fillInputByLabel("Correo electrónico", userData.email || "");
      fillInputByLabel("Repite Correo electrónico", userData.email || "");
      const next = document.querySelector('[value="Siguiente"]');
      next.click();
    // Повторно отправляет форму при появлении информационного сообщения портала.
    } else if (
      document.querySelector(".mf-msg__info") ||
      document.querySelector(".mf-msg__error")
    ) {
      const btnSubmit = document.querySelector("#btnSubmit");
      if (btnSubmit) {
        btnSubmit.click();
        console.log("Кнопка 'btnSubmit' нажата.");
        showNotification("Кнопка 'btnSubmit' нажата.");
      } else {
        console.error("Кнопка 'btnSalir' не найдена.");
      }
    }

    // Give same-document handlers a short settling window after the action.
    // Full navigations start a fresh injected run, which repeats readiness + scenario delay.
    await sleep(500);
  } catch (error) {
    console.error("Ошибка:", error);
  }
}

// Флаг прекращения сценария и обработчик команды остановки от фонового скрипта.
let stopped = false;

citaBot.onMessage((message) => {
  if (message.action === "STOP") {
    stopped = true;
    citaBot.storage.set({ isEnabled: false });
    showNotification(`Остановлено: ${message.reason}`, 10000);
  }
});

// Точка входа: разрешает запуск только для активной вкладки с включенной автоматизацией.
console.log("content.js loaded");

(async () => {
  if (!(await isActiveTab())) {
    console.log("⛔ Не активная вкладка — automation не запускаем");
    return;
  }
  const { isEnabled, userData } = await citaBot.storage.get([
    "isEnabled",
    "userData",
  ]);

  if (!isEnabled || !userData) {
    console.log("Автоматизация выключена");
    return;
  }

  console.log("Доступ подтверждён, запускаем автоматизацию");
  await checkPageStatus();
  if (!stopped) await performSteps(userData);
})();
