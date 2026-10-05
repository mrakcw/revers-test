// Отмечает запуск внедренного скрипта и хранит результат последней проверки доступа.
console.log("Script запущен!");
let accessCache = null;
const LOCAL_TEST_MODE = true;

// Передает команду локальному обработчику в background.js.
async function requestMockApi(mode, payload = {}) {
  try {
    return await chrome.runtime.sendMessage({
      action: "MOCK_API_REQUEST",
      mode,
      payload,
    });
  } catch (error) {
    console.error("Локальный API mock недоступен:", error);
    return { ok: false, error: "mock_unavailable" };
  }
}

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

// Регистрирует начало попытки на сервере и запоминает выданный идентификатор.
async function beginAttempt() {
  if (window.__attemptId) {
    return window.__attemptId;
  }

  /* Старый production-запрос start_attempt отключен:
  const { userId, hash } = await chrome.storage.local.get(["userId", "hash"]);
  const res = await fetch("https://citaext.vercel.app/api/tg?mode=start_attempt", ...);
  const data = await res.json();
  */
  const data = await requestMockApi("start_attempt");
  if (!data.ok || !data.attemptId) return null;

  window.__attemptId = data.attemptId;

  return window.__attemptId;
}

// Сообщает серверу результат попытки и возвращает причину отказа или успеха.
async function finishAttempt(reason = "no_slots") {
  if (!window.__attemptId) {
    return { ok: false, reason: "no_attempt" };
  }

  try {
    /* Старый production-запрос consume_run отключен:
    const res = await fetch("https://citaext.vercel.app/api/tg?mode=consume_run", ...);
    const data = await res.json();
    */
    const data = await requestMockApi("consume_run", {
      attemptId: window.__attemptId,
      reason,
    });

    if (data?.ok) {
      window.__attemptId = null;
      return { ok: true };
    }

    if (!data?.ok) {
      return { ok: false, reason: data?.reason || "server_reject" };
    }

    return { ok: true };
  } catch (e) {
    window.__attemptId = null;
    return { ok: false, reason: "network_error" };
  }
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
    chrome.runtime.sendMessage({ action: "IS_ACTIVE_TAB" }, (res) =>
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

// Отправляет серверу сведения о подтвержденной записи.
async function notifyBookingConfirmed(data) {
  try {
    /* Production-вызов booking_confirmed отключен: событие остается локальным. */
    await requestMockApi("booking_confirmed", { data });
  } catch (e) {
    console.error("notifyBookingConfirmed error:", e);
  }
}

// Отправляет серверу уведомление без дополнительных данных.
async function notifySimple(type) {
  try {
    /* Production-уведомления отключены; сервер заменен локальным подтверждением. */
    await requestMockApi(type);
  } catch (e) {
    console.error("notifySimple error:", e);
  }
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

// Формирует разрешенный тип уведомления и отправляет его на сервер расширения.
async function notifyEdge(typeMessage, dataIMG = null) {
  try {
    let endpoint = null;
    let payload = {};

    switch (typeMessage) {
      case "book_date":
        endpoint = "book_date";
        payload.dataUrl = dataIMG;
        break;

      case "sms_send":
        endpoint = "sms_send";
        break;

      default:
        throw new Error(`Неизвестный typeMessage: ${typeMessage}`);
    }

    /* Старый production fetch для уведомлений отключен. */
    const res = await requestMockApi(endpoint, payload);
    if (!res?.ok) throw new Error(`Mock error: ${res?.error}`);

    console.log(`Edge notification sent: ${typeMessage}`);
  } catch (e) {
    console.error("notifyEdge error:", e);
  }
}

// Преобразует секунды в отображаемый формат «минуты:секунды».
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

// Проверяет текст страницы на признаки ошибки загрузки и перенаправляет при их обнаружении.
function checkPageStatus() {
  const bodyText = document.body.innerText;

  if (
    bodyText.includes("Страница недоступна") ||
    bodyText.includes("ERR_EMPTY_RESPONSE")
  ) {
    console.log("Ошибка загрузки страницы! Перезагрузка...");
    showNotification("Ошибка загрузки страницы! Перезагрузка...", 5000);
    setTimeout(() => {
      window.location.href =
        "https://sede.administracionespublicas.gob.es/pagina/index/directorio/icpplus";
    }, 5000);
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

// Ожидает код SMS или CAPTCHA от сервера, вводит его в соответствующее поле и завершает ожидание.
function waitForCode(type) {
  if (LOCAL_TEST_MODE) {
    showNotification(
      `Локальная отладка: автоматический ввод кода ${type} отключен.`,
      10000,
    );
    return Promise.resolve(null);
  }

  /* Старый цикл получения кодов с production API отключен и оставлен для справки.
  const checkInterval = 7000; // 7 секунд
  const MAX_WAIT_MS = 6 * 60 * 1000; // 6 минут
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let stopped = false;

    async function poll() {
      if (stopped) return;

      if (Date.now() - startedAt > MAX_WAIT_MS) {
        stopped = true;

        console.warn(`⛔ Тайм-аут ожидания ${type}`);

        showNotification(
          type === "captcha"
            ? "⛔ Капча не введена за 6 минут. Процесс остановлен."
            : "⛔ SMS не получено за 6 минут. Процесс остановлен.",
          600000,
        );

        await chrome.storage.local.set({ isEnabled: false });

        chrome.runtime.sendMessage({
          action: "STOP_AUTOMATION",
          reason: `timeout_wait_${type}`,
        });

        resolve(null);
        return;
      }

      try {
        console.log(`⏳ Ожидание ${type}...`);

        const { userId, hash } = await chrome.storage.local.get([
          "userId",
          "hash",
        ]);

        if (!userId || !hash) throw new Error("Нет userId или hash");

        const res = await fetch(
          "https://citaext.vercel.app/api/tg?mode=poll_codes",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, hash }),
          },
        );

        if (!res.ok) throw new Error(`Edge error ${res.status}`);

        const data = await res.json();

        const value =
          type === "sms" ? data.sms : type === "captcha" ? data.captcha : null;

        if (!value) {
          return setTimeout(poll, checkInterval);
        }

        console.log(`✅ Получено (${type}):`, value);

        if (type === "sms") {
          const input = document.getElementById("txtCodigoVerificacion");
          if (input) {
            input.value = "";
            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }

        if (type === "captcha") {
          const input = document.getElementById("captcha");
          if (input) {
            input.value = "";
            input.value = value.toLowerCase();
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }

        stopped = true;
        resolve(value);
      } catch (err) {
        console.error("🚨 Ошибка poll_codes:", err.message);
        setTimeout(poll, checkInterval);
      }
    }

    poll();
  });
  */
}

// Разрешает Promise сразу после полной загрузки документа или по событию load.
function waitForPageLoad() {
  return new Promise((resolve) => {
    if (document.readyState === "complete") {
      resolve();
    } else {
      window.addEventListener("load", resolve, { once: true });
    }
  });
}

// Показывает обратный отсчет и затем ожидает указанное количество миллисекунд.
function waitForAdditionalTime(ms) {
  startCountdown(Math.floor(ms / 1000));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Определяет текущее состояние портала по DOM и выполняет соответствующее действие.
// Ветви расположены по приоритету: ошибка/вход, данные заявителя, запись и подтверждение.
async function performSteps(userData) {
  if (stopped) return;
  try {
    console.log("Выполняем шаги скрипта...");
    showNotification("Выполняем шаги скрипта...");
    await waitForPageLoad();

    if (document.querySelector('[value="Siguiente"]')) {
      await waitForAdditionalTime(4800);
    } else {
      console.log("Ждем 5 сек");
      showNotification(`Ждем ${4500 / 1000} сек...`, 4500);
      await waitForAdditionalTime(4500);
    }

    // В тестовом режиме проходим формы до слота, CAPTCHA, SMS или подтверждения записи.
    const pageText = document.body.innerText;
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
      showNotification(
        "Тестовый проход остановлен перед выбором слота, кодом или подтверждением.",
        15000,
      );
      await chrome.storage.local.set({ isEnabled: false });
      chrome.runtime.sendMessage({
        action: "STOP_AUTOMATION",
        reason: "local_test_booking_boundary",
      });
      return;
    }

    // При временных ошибках портала выдерживает паузу и затем возвращается на страницу записи.
    if (
      document.body.innerText.includes("Too Many Requests") ||
      document.body.innerText.includes("ERR_") ||
      document.body.innerText.includes("The requested URL was rejected") ||
      document.body.innerText.includes("Internal Server Error") ||
      document.body.innerText.includes("ERROR [503]") ||
      document.body.innerText.includes("Service Unavailable") ||
      document.body.innerText.includes("Forbidden")
    ) {
      const oneMin = 420000;
      startCountdown(Math.floor(oneMin / 1000));
      showNotification("Ошибка, ждем 7 минут", oneMin);

      if (document.body.innerText.includes("The requested URL was rejected")) {
        const currentTime = new Date().toLocaleString("es-ES", {
          weekday: "long",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        const existingTimes = JSON.parse(
          localStorage.getItem("TimeNow") || "[]",
        );

        existingTimes.push(currentTime);

        localStorage.setItem("TimeNow", JSON.stringify(existingTimes));
      }

      setTimeout(() => {
        window.location.href =
          "https://sede.administracionespublicas.gob.es/pagina/index/directorio/icpplus";
      }, oneMin);
    }

    // Обрабатывает начальные экраны: запуск процедуры, выбор провинции и подтвержденную запись.
    if (document.querySelector("#submit")) {
      const firstButton = await waitForElement("#submit");
      firstButton.click();
      console.log("Кнопка 'Acceder al Procedimiento' нажата");
      showNotification("Кнопка 'Acceder al Procedimiento' нажата");
    } else if (
      document.querySelector("#btnAceptar") &&
      document.querySelector("option") &&
      !document.querySelector("#sede")
    ) {
      const valenciaOption = [...document.querySelectorAll("option")].find(
        (opt) => opt.textContent.trim().includes(userData.city),
      );
      if (valenciaOption) {
        valenciaOption.selected = true;
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
      await finishAttempt("success");
      stopped = true;

      showNotification("🎉 Запись подтверждена.", 600000);
      chrome.runtime.sendMessage({
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
          await notifyEdge("sms_send");

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
    } else if (document.querySelector("#btnAceptar")) {
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
    } else if (document.querySelector("#btnEntrar")) {
      const entrarButton = await waitForElement("#btnEntrar");
      entrarButton.click();
      console.log("Кнопка 'Entrar' нажата");
      showNotification("Кнопка 'Entrar' нажата");
    } else if (document.querySelector("#txtIdCitado")) {
      if (!userData) {
        console.error("Данные пользователя не загружены");
        return;
      }

      accessCache = null;

      const allowed = await checkAccessCached();
      if (!allowed) {
        chrome.runtime.sendMessage({
          action: "STOP_AUTOMATION",
          reason: "Доступ недействителен",
        });
        return;
      }

      await beginAttempt();

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
      document.querySelector("#btnEnviar") &&
      document.querySelector("#btnEnviar").value === "Solicitar Cita"
    ) {
      const btnEnviar = document.querySelector("#btnEnviar");
      btnEnviar.click();
      console.log("Кнопка 'Solicitar Cita' нажата");
      showNotification("Кнопка 'Solicitar Cita' нажата");
    // Если записей нет, завершает попытку, показывает задержку и запускает новый цикл.
    } else if (
      document.body.innerText.includes(
        "En este momento no hay citas disponibles",
      )
    ) {
      const result = await finishAttempt("no_slots");

      if (!result.ok && result.reason !== "no_attempt") {
        if (result.reason === "no_demo_left") {
          showNotification("❌ DEMO-лимит исчерпан");
        } else if (result.reason === "no_auth") {
          showNotification("❌ Авторизация недействительна");
        } else {
          showNotification("❌ Автоматизация остановлена");
        }

        await chrome.storage.local.set({ isEnabled: false });
        return;
      }

      console.log("Нет доступных записей.");
      const durationMs =
        Math.floor(Math.random() * (270000 - 210000 + 1)) + 210000;
      // const adjustedDuration = adjustDuration(Math.floor(duration / 1000));
      const durationSec = Math.floor(durationMs / 1000);
      startCountdown(durationSec);
      showNotification(
        "Нет доступных записей. Повторный круг начнется в течении 5 минут.",
        durationMs,
      );

      setTimeout(() => {
        const btnSalir = document.querySelector("#btnSalir");
        const btnSubmit = document.querySelector("#btnSubmit");
        if (btnSalir) {
          btnSalir.click();
          console.log("Кнопка 'btnSalir' нажата.");
          showNotification("Кнопка 'btnSalir' нажата.");
        } else if (btnSubmit) {
          btnSubmit.click();
          console.log("Кнопка 'btnSubmit' нажата.");
          showNotification("Кнопка 'btnSubmit' нажата.");
        }
      }, durationMs);
    // Выбирает офис согласно режиму «обязательно» или «предпочтительно».
    } else if (
      document.querySelector('[value="Siguiente"]') &&
      document.body.innerText.includes("Identidad del usuario de cita") &&
      !document.body.innerText.includes("Teléfono")
    ) {
      const selectedOffices = userData?.offices || [];
      const officeMode = userData?.officeMode || "prefer";

      const selectElement =
        document.getElementById("idSede") || document.getElementById("sede");

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
              const delay =
                Math.floor(Math.random() * (270000 - 210000 + 1)) + 210000;
              const durationSec = Math.floor(delay / 1000);
              startCountdown(durationSec);
              showNotification(
                "Нужных офисов нет (Strict). Перезапуск в течении 5 минут...",
                delay,
              );

              setTimeout(() => {
                window.location.href =
                  "https://sede.administracionespublicas.gob.es/pagina/index/directorio/icpplus";
              }, delay);

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
        await notifyEdge("book_date", captchaImage.src);

        await waitForCode("captcha");

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
        await notifyEdge("book_date");

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
        await notifyEdge("book_date", captchaImage.src);

        await waitForCode("captcha");

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
        await notifyEdge("book_date");

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
  } catch (error) {
    console.error("Ошибка:", error);
  }
}

// Проверяет на сервере, разрешена ли текущему пользователю автоматизация.
async function checkAccess() {
  if (LOCAL_TEST_MODE) {
    /* Старый production-запрос verify_access отключен в локальном режиме:
    const res = await fetch("https://citaext.vercel.app/api/tg?mode=verify_access", ...);
    */
    const result = await requestMockApi("verify_access");
    return Boolean(result?.ok);
  }

  /* Старый production-запрос verify_access отключен в локальном режиме:
  try {
    const { userId, hash } = await chrome.storage.local.get(["userId", "hash"]);

    if (!userId || !hash) return false;

    const res = await fetch(
      "https://citaext.vercel.app/api/tg?mode=verify_access",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, hash }),
      },
    );

    if (!res.ok) return false;

    const data = await res.json();

    if (!data.ok) return false;

    if (data.access === "demo") {
      showNotification(`🎁 DEMO: осталось ${data.demo_left} попыток`);
    }

    if (data.access === "vip") {
      showNotification("💡 Доступ активен");
    }

    return true;
  } catch (e) {
    console.error("checkAccess error:", e);
    return false;
  }
  */
  return false;
}
// Повторно использует результат проверки доступа в пределах текущей загрузки страницы.
async function checkAccessCached() {
  if (accessCache !== null) {
    return accessCache;
  }

  const allowed = await checkAccess();
  accessCache = allowed;

  return allowed;
}

// Флаг прекращения сценария и обработчик команды остановки от фонового скрипта.
let stopped = false;

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "STOP") {
    stopped = true;
    chrome.storage.local.set({ isEnabled: false });
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
  const { isEnabled, userData } = await chrome.storage.local.get([
    "isEnabled",
    "userData",
  ]);

  if (!isEnabled || !userData) {
    console.log("Автоматизация выключена");
    return;
  }

  console.log("Доступ подтверждён, запускаем автоматизацию");
  checkPageStatus();
  performSteps(userData);
})();
