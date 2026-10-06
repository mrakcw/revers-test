// Обработчик выбора офисов (office selection logic: strict / prefer / any).

/**
 * Обрабатывает выпадающий список офисов на странице.
 * @param {HTMLSelectElement} selectElement - Элемент select (idSede или sede)
 * @param {string[]} selectedOffices - Массив кодов офисов, переданных пользователем
 * @param {'prefer'|'strict'} officeMode - Режим выбора
 * @returns {{ success: boolean, selectedValue?: string, selectedText?: string, error?: string }}
 */
export function handleOfficeSelection(selectElement, selectedOffices = [], officeMode = "prefer") {
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

  // По умолчанию или при пустом списке офисов берем первый доступный
  const defaultOption = validOptions[0];
  selectElement.value = defaultOption.value;
  selectElement.dispatchEvent(new Event("change", { bubbles: true }));
  return {
    success: true,
    selectedValue: defaultOption.value,
    selectedText: defaultOption.text.trim(),
  };
}
