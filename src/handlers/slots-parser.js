// Извлекатель доступных слотов (extractAvailableSlots).
// Парсит доступные варианты со страницы без их выбора или бронирования.

export function extractAvailableSlots(doc = document) {
  const slots = [];

  // Стратегия 1: Радио-кнопки выбора записи (стандартный интерфейс ICPPlus)
  const radioButtons = Array.from(doc.querySelectorAll('input[type="radio"]'));

  if (radioButtons.length > 0) {
    radioButtons.forEach((radio, index) => {
      if (radio.disabled) return;

      const radioId = radio.id || `cita_${index + 1}`;
      const value = radio.value || "";

      // Ищем сопутствующую текстовую метку (label или родительский контейнер/строку таблицы)
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

      // Извлекаем дату и время из текста при наличии
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

  // Стратегия 2: Ссылки или элементы с подписью LIBRE
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

  // Стратегия 3: Элементы выпадающего списка или кнопок выбора даты
  const dateOptions = Array.from(doc.querySelectorAll("select[name*='cita'] option, select[id*='cita'] option")).filter(
    (opt) => opt.value && opt.value !== "" && opt.value !== "-1",
  );

  if (dateOptions.length > 0) {
    dateOptions.forEach((opt, index) => {
      const text = opt.textContent.trim();
      const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
      const timeMatch = text.match(/(\d{2}:\d{2})/);

      slots.push({
        id: `option_${index + 1}`,
        value: opt.value,
        radioId: null,
        text,
        date: dateMatch ? dateMatch[1] : "",
        time: timeMatch ? timeMatch[1] : "",
        office: "",
      });
    });
  }

  return slots;
}
