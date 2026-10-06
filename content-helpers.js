// Вспомогательные функции для content.js без внешней сборки.
// Все хелперы монтируются в глобальный объект window.CitaHelpers.

(function () {
  const CitaHelpers = {};

  // PII Sanitizer для логов
  CitaHelpers.sanitizeForLog = function (data) {
    if (!data || typeof data !== "object") return data;
    const clone = JSON.parse(JSON.stringify(data));
    if (clone.client) {
      if (clone.client.nie) clone.client.nie = clone.client.nie.slice(0, 3) + "***";
      if (clone.client.passport) clone.client.passport = clone.client.passport.slice(0, 3) + "***";
      if (clone.client.phone) clone.client.phone = "***" + clone.client.phone.slice(-4);
      if (clone.client.email) clone.client.email = "***@" + (clone.client.email.split("@")[1] || "domain");
    }
    return clone;
  };

  // Выдержка паузы
  CitaHelpers.sleep = function (ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  // Заполнение инпута по текстовке метки (label)
  CitaHelpers.fillInputByLabel = function (labelText, value) {
    if (!value) return false;
    const labels = document.querySelectorAll("label");
    let labelFound = false;

    labels.forEach((label) => {
      if (label.textContent.includes(labelText)) {
        const inputId = label.getAttribute("for");
        let input = inputId ? document.getElementById(inputId) : null;
        if (!input) {
          input = label.querySelector("input, select");
        }
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          labelFound = true;
        }
      }
    });

    return labelFound;
  };

  // Заполнение инпута по селектору
  CitaHelpers.fillIfExists = async function (selector, value) {
    const el = document.querySelector(selector);
    if (el && value != null && value !== "") {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  };

  // Клик по селектору
  CitaHelpers.clickIfExists = async function (selector) {
    const el = document.querySelector(selector);
    if (el) {
      el.click();
      return true;
    }
    return false;
  };

  // Выбор элемента select по фрагменту текста
  CitaHelpers.selectOptionByText = function (selectEl, text) {
    if (!selectEl) return false;
    const opt = [...selectEl.options].find((o) =>
      o.textContent.trim().toUpperCase().includes(text.toUpperCase()),
    );
    if (opt) {
      opt.selected = true;
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  };

  // Извлечение доступных слотов (extractAvailableSlots)
  CitaHelpers.extractAvailableSlots = function (doc = document) {
    const slots = [];

    // Стратегия 1: Radio buttons
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
          if (parentCell) {
            labelText = parentCell.textContent.trim();
          }
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

    // Стратегия 2: LIBRE элементы
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
  };

  // Выбор офиса (strict / prefer)
  CitaHelpers.handleOfficeSelection = function (selectElement, selectedOffices = [], officeMode = "prefer") {
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
      const matchedOption = validOptions.find((opt) =>
        selectedOffices.includes(opt.value.trim()),
      );

      if (!matchedOption) {
        return {
          success: false,
          error: "OFFICE_NOT_AVAILABLE",
          message: `Требуемый офис из списка [${selectedOffices.join(", ")}] недоступен в режиме strict.`,
        };
      }

      selectElement.value = matchedOption.value;
      selectElement.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        success: true,
        selectedValue: matchedOption.value,
        selectedText: matchedOption.text.trim(),
      };
    }

    if (officeMode === "prefer" && !isAnyMode) {
      const matchedOption = validOptions.find((opt) =>
        selectedOffices.includes(opt.value.trim()),
      );

      const targetOption = matchedOption || validOptions[0];
      selectElement.value = targetOption.value;
      selectElement.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        success: true,
        selectedValue: targetOption.value,
        selectedText: targetOption.text.trim(),
      };
    }

    const defaultOption = validOptions[0];
    selectElement.value = defaultOption.value;
    selectElement.dispatchEvent(new Event("change", { bubbles: true }));
    return {
      success: true,
      selectedValue: defaultOption.value,
      selectedText: defaultOption.text.trim(),
    };
  };

  // Ошибки сайта
  CitaHelpers.detectSiteError = function (doc = document) {
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
  };

  window.CitaHelpers = CitaHelpers;
})();
