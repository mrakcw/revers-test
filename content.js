// Исполнительный скрипт страницы (content script).
// Работает в изолированном контексте страницы ICPPlus.
// Выполняет ровно ОДИН проход сценария (SHORT или FULL) без повторных циклов и БЕЗ бронирования.

console.log("[ContentScript] Загружен на странице:", window.location.href);

const helpers = window.CitaHelpers || {};

// Уведомление в углу страницы для наглядности
function showStepNotification(msg, duration = 3000) {
  let container = document.getElementById("citaext-step-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "citaext-step-container";
    container.style.position = "fixed";
    container.style.top = "15px";
    container.style.right = "15px";
    container.style.backgroundColor = "rgba(15, 23, 42, 0.9)";
    container.style.color = "#38bdf8";
    container.style.fontFamily = "monospace, sans-serif";
    container.style.fontSize = "14px";
    container.style.padding = "10px 16px";
    container.style.borderRadius = "8px";
    container.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.25)";
    container.style.zIndex = "99999";
    document.body.appendChild(container);
  }

  container.textContent = msg;
  setTimeout(() => {
    if (container && container.parentNode) {
      container.style.opacity = "0.7";
    }
  }, duration);
}

// Завершает выполнение сценария и отправляет результат в background
function finishJob(result) {
  console.log(`[ContentScript][${result.mode || "EXEC"}] Завершение сценария с результатом:`, result.status, result);
  chrome.runtime.sendMessage({
    action: "JOB_FINISHED",
    result,
  });
}

// Ожидание загрузки документа
function waitForLoad() {
  return new Promise((resolve) => {
    if (document.readyState === "complete") {
      resolve();
    } else {
      window.addEventListener("load", resolve, { once: true });
    }
  });
}

// Главная функция выполнения текущего шага
async function executeCurrentStep() {
  await waitForLoad();
  await helpers.sleep(1200);

  // Получаем активное задание из chrome.storage.local
  const { activeJob } = await chrome.storage.local.get("activeJob");
  if (!activeJob || activeJob.status !== "RUNNING") {
    console.log("[ContentScript] Нет активного задания на исполнение.");
    return;
  }

  const { mode, client, target, jobId } = activeJob.payload;
  const tag = `[${mode}]`;

  // 1. Проверка внешних ошибок сайта (429, 403, 503, WAF)
  const siteError = helpers.detectSiteError(document);
  if (siteError) {
    showStepNotification(`${tag} Ошибка сайта: ${siteError.status}`);
    finishJob({
      ok: false,
      status: siteError.status,
      jobId,
      mode,
      error: {
        code: siteError.code,
        message: siteError.message,
      },
    });
    return;
  }

  const pageText = document.body ? document.body.innerText : "";

  // 2. ОПРЕДЕЛЕНИЕ ТЕКУЩЕГО ШАГА ПО СОСТОЯНИЮ СТРАНИЦЫ

  // -------------------------------------------------------------
  // КРАЙНЯЯ ТОЧКА БРОНИРОВАНИЯ (СЛОТЫ ПОЛУЧЕНЫ)
  // -------------------------------------------------------------
  const isSlotSelectionPage =
    pageText.includes("Selecciona una de las siguientes citas disponibles") ||
    pageText.includes("LIBRE");

  if (isSlotSelectionPage) {
    showStepNotification(`${tag}[STEP 8] Достигнута страница выбора записей.`);
    console.log(`${tag}[STEP 8] Extracting available slots...`);

    const slots = helpers.extractAvailableSlots(document);
    console.log(`${tag}[STEP 8] Extracted slots count: ${slots.length}`, slots);

    // ВАЖНО: НИКОГДА НЕ ВЫБИРАЕМ РАДИО-КНОПКИ И НЕ НАЖИМАЕМ SIGUIENTE/CONFIRMAR!
    finishJob({
      ok: true,
      status: "AVAILABLE",
      jobId,
      mode,
      data: {
        slots,
      },
    });
    return;
  }

  // -------------------------------------------------------------
  // STEP 1: Начальный экран портала (index.html)
  // -------------------------------------------------------------
  if (document.querySelector("#submit")) {
    showStepNotification(`${tag}[STEP 1] Переход к выбору провинции...`);
    console.log(`${tag}[STEP 1] Clicking Acceder al Procedimiento (#submit)`);
    await helpers.clickIfExists("#submit");
    return;
  }

  // -------------------------------------------------------------
  // STEP 2: Выбор провинции (city)
  // -------------------------------------------------------------
  if (
    document.querySelector("#btnAceptar") &&
    document.querySelector("option") &&
    !document.querySelector("#sede") &&
    !document.querySelector('[id^="tramiteGrupo"]')
  ) {
    showStepNotification(`${tag}[STEP 2] Выбор провинции: ${target.city}`);
    console.log(`${tag}[STEP 2] Selecting city: ${target.city}`);

    const citySelected = helpers.selectOptionByText(document.querySelector("select"), target.city);
    if (citySelected) {
      await helpers.sleep(500);
      document.querySelector("#btnAceptar").click();
    } else {
      finishJob({
        ok: false,
        status: "VALIDATION_ERROR",
        jobId,
        mode,
        error: {
          code: "CITY_NOT_FOUND",
          message: `Провинция '${target.city}' не найдена в списке.`,
        },
      });
    }
    return;
  }

  // -------------------------------------------------------------
  // STEP 3: Выбор процедуры (procedure)
  // -------------------------------------------------------------
  if (document.querySelector("#btnAceptar") && document.querySelector('[id^="tramiteGrupo"]')) {
    showStepNotification(`${tag}[STEP 3] Выбор процедуры: ${target.procedure}`);
    console.log(`${tag}[STEP 3] Selecting procedure: ${target.procedure}`);

    const selectIds = ["tramiteGrupo[0]", "tramiteGrupo[1]"];
    let procedureFound = false;

    for (const selectId of selectIds) {
      const selectEl = document.getElementById(selectId);
      if (selectEl) {
        const option = [...selectEl.options].find((opt) => opt.value.trim() === String(target.procedure));
        if (option) {
          selectEl.value = String(target.procedure);
          selectEl.dispatchEvent(new Event("change", { bubbles: true }));
          procedureFound = true;
          break;
        }
      }
    }

    if (procedureFound) {
      await helpers.sleep(500);
      document.querySelector("#btnAceptar").click();
    } else {
      finishJob({
        ok: false,
        status: "VALIDATION_ERROR",
        jobId,
        mode,
        error: {
          code: "PROCEDURE_NOT_FOUND",
          message: `Процедура '${target.procedure}' не найдена для провинции '${target.city}'.`,
        },
      });
    }
    return;
  }

  // -------------------------------------------------------------
  // STEP 4: Переход через Entrar / Промежуточный экран входа
  // -------------------------------------------------------------
  if (document.querySelector("#btnEntrar")) {
    showStepNotification(`${tag}[STEP 4] Нажатие кнопки Entrar`);
    console.log(`${tag}[STEP 4] Clicking #btnEntrar`);
    await helpers.clickIfExists("#btnEntrar");
    return;
  }

  // -------------------------------------------------------------
  // STEP 5: Ввод обязательных данных заявителя
  // -------------------------------------------------------------
  if (document.querySelector("#txtIdCitado")) {
    showStepNotification(`${tag}[STEP 5] Заполнение данных заявителя`);
    console.log(`${tag}[STEP 5] Filling applicant data`);

    const isPassport = client.documentType === "PASSPORT";
    if (isPassport) {
      await helpers.clickIfExists('input[value="PASAPORTE"]');
    } else {
      await helpers.clickIfExists('input[value="N.I.E."]');
    }
    await helpers.sleep(300);

    const docValue = isPassport ? client.passport : client.nie;
    await helpers.fillIfExists("#txtIdCitado", docValue);
    await helpers.fillIfExists("#txtDesCitado", client.name);
    await helpers.fillIfExists("#txtAnnoCitado", client.birthYear || "1990");

    const countrySelect = document.querySelector("#txtPaisNac") || document.querySelector("#txtPaisNacionalidad");
    if (countrySelect) {
      helpers.selectOptionByText(countrySelect, "UCRANIA");
    }

    await helpers.sleep(500);
    console.log(`${tag}[STEP 5] Submitting applicant data (#btnEnviar)`);
    await helpers.clickIfExists("#btnEnviar");
    return;
  }

  // -------------------------------------------------------------
  // STEP 6: Определение доступности / Выбор офиса (Office filter)
  // -------------------------------------------------------------

  // 6a. Проверка "Нет доступных записей"
  if (pageText.includes("En este momento no hay citas disponibles")) {
    showStepNotification(`${tag}[STEP 6] Результат: NO_SLOTS`);
    console.log(`${tag}[STEP 6] Result: NO_SLOTS`);

    finishJob({
      ok: true,
      status: "NO_SLOTS",
      jobId,
      mode,
      data: {
        slots: [],
      },
    });
    return;
  }

  // 6b. Экран выбора офиса (#idSede / #sede)
  const officeSelect = document.getElementById("idSede") || document.getElementById("sede");
  if (officeSelect && document.querySelector('[value="Siguiente"]')) {
    showStepNotification(`${tag}[STEP 6] Выбор офиса (mode: ${target.officeMode})`);
    console.log(`${tag}[STEP 6] Handling office selection for offices:`, target.offices);

    const officeResult = helpers.handleOfficeSelection(officeSelect, target.offices, target.officeMode);
    if (!officeResult.success) {
      finishJob({
        ok: false,
        status: officeResult.error || "OFFICE_NOT_AVAILABLE",
        jobId,
        mode,
        error: {
          code: officeResult.error || "OFFICE_NOT_AVAILABLE",
          message: officeResult.message || "Нужный офис недоступен.",
        },
      });
      return;
    }

    // В режиме SHORT, если выбор офиса прошёл и доступность принципиально подтверждена:
    if (mode === "SHORT" && !pageText.includes("Teléfono")) {
      showStepNotification(`${tag}[SHORT][STEP 6] Доступность подтверждена! Завершение.`);
      finishJob({
        ok: true,
        status: "AVAILABLE",
        jobId,
        mode: "SHORT",
        data: {
          slots: [],
        },
      });
      return;
    }

    await helpers.sleep(500);
    await helpers.clickIfExists('[value="Siguiente"]');
    return;
  }

  // 6c. Кнопка "Solicitar Cita"
  if (document.querySelector("#btnEnviar") && document.querySelector("#btnEnviar").value === "Solicitar Cita") {
    showStepNotification(`${tag}[STEP 6] Запрос записи (Solicitar Cita)`);
    console.log(`${tag}[STEP 6] Clicking Solicitar Cita`);

    if (mode === "SHORT") {
      showStepNotification(`${tag}[SHORT][STEP 6] Доступность подтверждена! Завершение.`);
      finishJob({
        ok: true,
        status: "AVAILABLE",
        jobId,
        mode: "SHORT",
        data: {
          slots: [],
        },
      });
      return;
    }

    await helpers.clickIfExists("#btnEnviar");
    return;
  }

  // -------------------------------------------------------------
  // STEP 7: Ввод контактных данных (FULL mode only)
  // -------------------------------------------------------------
  if (document.querySelector('[value="Siguiente"]') && pageText.includes("Teléfono")) {
    if (mode === "SHORT") {
      showStepNotification(`${tag}[SHORT] Граница SHORT достигнута перед контактными данными.`);
      finishJob({
        ok: true,
        status: "AVAILABLE",
        jobId,
        mode: "SHORT",
        data: {
          slots: [],
        },
      });
      return;
    }

    showStepNotification(`${tag}[STEP 7] Заполнение контактных данных`);
    console.log(`${tag}[STEP 7] Filling contact details (phone, email)`);

    helpers.fillInputByLabel("Teléfono", client.phone || "600000000");
    helpers.fillInputByLabel("Correo electrónico", client.email || "test@example.com");
    helpers.fillInputByLabel("Repite Correo electrónico", client.email || "test@example.com");

    await helpers.sleep(500);
    await helpers.clickIfExists('[value="Siguiente"]');
    return;
  }
}

// Запуск выполнения шага
executeCurrentStep().catch((err) => {
  console.error("[ContentScript] Ошибка при выполнении шага:", err);
});
