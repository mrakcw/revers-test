// Импортирует справочники процедур, провинций, офисов и особенностей форм портала.
import {
  PROCEDURES,
  CITIES,
  DEFAULT_CITY_PROCEDURES,
  PROCEDURES_REQUIRE_DOC_TYPE,
  PROCEDURE_META,
  OFFICES,
} from "./procedures.js";
import { TEST_USER_DATA, TEST_USER_DATA_ENABLED } from "./test.js";

// Включает локальный процесс отладки без авторизации и серверных лимитов.
const LOCAL_TEST_MODE = true;

// Отправляет запросы только локальному mock-обработчику фонового скрипта.
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

let isFormLocked = false;
const userName = document.getElementById("userName");
const userNie = document.getElementById("userNie");
const userTel = document.getElementById("userTel");
const userEmail = document.getElementById("userEmail");
const userCity = document.getElementById("userCity");
const userProcedure = document.getElementById("userProcedure");

const docNie = document.getElementById("docNie");
const docPassport = document.getElementById("docPassport");
const passportInput = document.getElementById("userPassport");
const passportLabel = document.getElementById("passportLabel");
const nieWrapper = document.getElementById("nieWrapper");

// Локальное состояние авторизации и доступа, используемое при отображении интерфейса.
let accessState = null;

const STATES = {
  NOT_AUTH: "NOT_AUTH",
  WAIT_TG: "WAIT_TG",
  AUTHORIZED: "AUTHORIZED",
};

let currentState = STATES.NOT_AUTH;
let authCode = null;

// Строит список офисов выбранной провинции и включает вариант выбора всех офисов.
function renderOffices(city) {
  const wrapper = document.getElementById("officeWrapper");
  const list = document.getElementById("officeList");
  const summary = document.getElementById("selectedOfficeSummary");
  const label = document.getElementById("officeLabel");
  const officeContent = document.getElementById("officeContent");

  if (!wrapper || !list) return;

  const offices = OFFICES?.[city];

  if (!offices || offices.length === 0) {
    wrapper.style.display = "none";
    if (label) label.style.display = "none";
    if (officeContent) officeContent.style.display = "none";
    return;
  }

  wrapper.style.display = "block";
  if (label) label.style.display = "block";

  list.innerHTML = "";

  if (summary) {
    summary.textContent = "Любой (предпочтительно)";
  }

  offices.forEach((office) => {
    const el = document.createElement("label");
    el.className = "office-item";

    el.innerHTML = `
      <input 
        type="checkbox" 
        class="office_cb" 
        value="${office.value}" 
        checked 
      />
      <span 
        class="office-name" 
        title="${office.label}"
      >
        ${office.label}
      </span>
    `;

    list.appendChild(el);
  });

  const anyCb = document.getElementById("office_any");
  if (anyCb) {
    anyCb.checked = true;
    anyCb.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

// Создает случайный код, который пользователь отправляет Telegram-боту для авторизации.
function generateCode() {
  return Math.floor(1000000 + Math.random() * 9000000).toString();
}
// Сохраняет выбранный тип документа в ранее записанных пользовательских данных.
function persistDocumentType(type) {
  chrome.storage.local.get("userData", ({ userData }) => {
    chrome.storage.local.set({
      userData: {
        ...(userData || {}),
        documentType: type,
      },
    });
  });
}

// Ограничивает варианты NIE/паспорта согласно возможностям выбранной процедуры и провинции.
function updateDocumentTypeByMeta() {
  if (isFormLocked) return;

  const procedureId = Number(userProcedure.value);
  const city = userCity.value;
  const meta = PROCEDURE_META?.[procedureId]?.[city];

  if (!meta) {
    document.getElementById("docTypeWrapper").style.display = "none";
    return;
  }

  document.getElementById("docTypeWrapper").style.display = "block";

  docNie.disabled = !meta.has_nie;
  docPassport.disabled = !meta.has_pas;

  if (docPassport.checked && !meta.has_pas) {
    docNie.checked = true;
  }

  if (docNie.checked && !meta.has_nie) {
    docPassport.checked = true;
  }
}

// Показывает только поля документа, относящиеся к текущему выбору пользователя.
function updateDocumentInputsVisibility() {
  const wrapper = document.getElementById("docTypeWrapper");
  if (!wrapper) return;

  const procedure = userProcedure.value;
  const needsDocType = shouldAskDocumentType(procedure);

  wrapper.style.display = needsDocType ? "block" : "none";

  const selectedDoc = docPassport?.checked ? "PASSPORT" : "NIE";

  const isPassport = needsDocType && selectedDoc === "PASSPORT";

  if (nieWrapper) {
    nieWrapper.style.display = isPassport ? "none" : "block";
  }

  if (passportInput && passportLabel) {
    passportInput.style.display = isPassport ? "block" : "none";
    passportLabel.style.display = isPassport ? "block" : "none";
  }
}

// Скрывает все три панели интерфейса авторизации.
function hideAll() {
  document.getElementById("notAuthSection").style.display = "none";
  document.getElementById("waitTGSection").style.display = "none";
  document.getElementById("authorizedSection").style.display = "none";
}

// Показывает панель для пользователя, который еще не авторизовался.
function showNotAuth() {
  hideAll();
  document.getElementById("notAuthSection").style.display = "block";
}

// Разрешает нажатие основной кнопки после обновления статуса доступа.
function updateStartAvailability() {
  const btn = document.getElementById("startBtn");
  if (!btn) return;

  btn.disabled = false;
}

// Показывает экран ожидания подтверждения и выводит код для отправки боту.
function showWaitTG() {
  hideAll();
  document.getElementById("waitTGSection").style.display = "block";

  const code = `auth_${authCode}`;
  const codeEl = document.getElementById("authCodeText");

  if (codeEl) {
    codeEl.textContent = code;
  }
}

// Показывает данные авторизованного пользователя и загружает его уровень доступа.
async function showAuthorized(user) {
  hideAll();
  document.getElementById("authorizedSection").style.display = "block";

  document.getElementById("connectedUserName").textContent =
    user.first_name || user.username || "пользователь";

  const accessEl = document.getElementById("accessStatus");

  accessEl.innerHTML = `<span class="spinner"></span> Проверяем доступ…`;
  accessEl.style.color = "#999";
  accessEl.style.display = "block";
  const access = await fetchAccessStatus();
  accessState = access;

  renderAccessStatus(access ?? { access: "unknown" });
  updateStartAvailability();
}

// Переводит основную кнопку в состояние остановки текущего поиска.
function setButtonStop() {
  const btn = document.getElementById("startBtn");
  btn.textContent = "Стоп";
  btn.classList.add("stop");
}

// Возвращает основной кнопке подпись и оформление запуска поиска.
function setButtonStart() {
  const btn = document.getElementById("startBtn");
  btn.textContent = "Начать";
  btn.classList.remove("stop");
}

// Создает код авторизации, сохраняет состояние ожидания и показывает его пользователю.
async function startAuth() {
  authCode = generateCode();
  chrome.storage.local.set({ authCode, state: STATES.WAIT_TG });
  currentState = STATES.WAIT_TG;
  showWaitTG();
}
// Не допускает параллельные запросы статуса доступа при повторном отображении панели.
let accessFetchInProgress = false;

// Запрашивает на сервере статус доступа для сохраненных учетных данных Telegram.
async function fetchAccessStatus() {
  if (accessFetchInProgress) return accessState;

  accessFetchInProgress = true;

  try {
    /* Старый production-запрос verify_access отключен:
    const res = await fetch("https://citaext.vercel.app/api/tg?mode=verify_access", ...);
    return await res.json();
    */
    return await requestMockApi("verify_access");
  } catch {
    return null;
  } finally {
    accessFetchInProgress = false;
  }
}

// Отображает один из состояний доступа: неизвестен, VIP, демо-лимит или выключен.
function renderAccessStatus(data) {
  console.log("Rendering access status:", data);

  const el = document.getElementById("accessStatus");
  const accessHint = document.getElementById("accessHint");

  if (!el) return;

  if (accessHint) accessHint.style.display = "none";

  if (data?.access === "unknown") {
    el.textContent = "⚠️ Не удалось обновить статус доступа";
    el.style.color = "#999";
    return;
  }

  if (data?.access === "test") {
    el.textContent = "Локальная отладка";
    el.style.color = "#2563eb";
    return;
  }

  if (data?.access === "vip") {
    const date = new Date(data.vip_until);
    el.textContent = `💎 Доступ активен до ${date.toLocaleDateString("ru-RU")}`;
    el.style.color = "#4caf50";

    return;
  }

  if (data?.access === "demo" || data?.reason === "no_access") {
    const left = Number(data?.demo_left ?? 0);

    el.textContent = `🎁 DEMO: осталось ${left} из 5 (в сутки)`;
    el.style.color = left > 0 ? "#ff9800" : "#f44336";
    if (accessHint && left <= 0) accessHint.style.display = "block";
    return;
  }

  el.textContent = "🔓 Доступ не активен";
  el.style.color = "#f44336";
  if (accessHint) accessHint.style.display = "block";
}

// Проверяет отправленный Telegram-боту код и сохраняет учетные данные при успехе.
async function checkAuth() {
  const btn = document.getElementById("authCheckBtn");
  const statusEl = document.getElementById("authStatus");

  if (!authCode) {
    statusEl.textContent = "Сначала получите код авторизации.";
    statusEl.className = "auth-status error";
    return;
  }

  btn.classList.add("loading");
  btn.textContent = "Проверяем…";
  statusEl.textContent = "";
  statusEl.className = "auth-status";

  try {
    /* Старая Telegram-проверка check_auth отключена в локальном тестовом режиме:
    const res = await fetch(`${EDGE_ENDPOINT}/api/tg?mode=check_auth`, ...);
    */
    const data = await requestMockApi("check_auth", { code: authCode });

    if (!data?.ok) {
      statusEl.textContent =
        "Код не подтверждён. Отправьте его боту и попробуйте ещё раз.";
      statusEl.className = "auth-status error";
      return;
    }

    chrome.storage.local.set({
      state: STATES.AUTHORIZED,
      userId: data.userId,
      hash: data.hash,
      username: data.username,
      first_name: data.first_name,
    });

    currentState = STATES.AUTHORIZED;
    showAuthorized(data);
  } catch (e) {
    statusEl.textContent = "Ошибка соединения. Попробуйте позже.";
    statusEl.className = "auth-status error";
  } finally {
    btn.classList.remove("loading");
    btn.textContent = "Проверить";
  }
}

// Список провинций строится из общего справочника доступных процедур.
const citiesList = Object.keys(CITIES);

// Заполняет список провинций и подготавливает список процедур к выбору.
function initForm() {
  const citySelect = document.getElementById("userCity");
  const procedureSelect = document.getElementById("userProcedure");

  citySelect.innerHTML = `<option value="">Выберите провинцию</option>`;
  citiesList.forEach(
    (c) => (citySelect.innerHTML += `<option value="${c}">${c}</option>`),
  );

  if (procedureSelect) {
    procedureSelect.disabled = true;
  }
}

// Разблокирует ввод и выбор полей после остановки автоматизации или выхода.
function enableForm() {
  isFormLocked = false;

  document.querySelectorAll(".form-section input").forEach((el) => {
    el.disabled = false;
    el.readOnly = false;
  });

  document.querySelectorAll(".form-section select").forEach((el) => {
    el.disabled = false;
  });

  userProcedure.disabled = !userCity.value;
  document.getElementById("startBtn").disabled = false;
}

// Фиксирует введенные данные на время работы автоматизации.
function lockForm() {
  isFormLocked = true;

  document.querySelectorAll(".form-section input").forEach((el) => {
    el.readOnly = true;
    el.disabled = false;
  });

  document.querySelectorAll(".form-section select").forEach((el) => {
    el.disabled = true;
  });

  if (passportInput) {
    passportInput.readOnly = true;
  }

  updateDocumentInputsVisibility();
}

// Останавливает активный процесс, удаляет учетные данные и возвращает экран авторизации.
async function logoutTelegram() {
  const { isEnabled } = await chrome.storage.local.get("isEnabled");

  if (isEnabled) {
    chrome.runtime.sendMessage({
      action: "STOP_AUTOMATION",
      reason: "Выход из аккаунта Telegram",
    });
  }

  await chrome.storage.local.remove([
    "state",
    "userId",
    "hash",
    "username",
    "first_name",
    "authCode",
    "userData",
  ]);

  currentState = STATES.NOT_AUTH;
  authCode = null;

  enableForm();
  setButtonStart();
  showNotAuth();
}

// Формирует список процедур, разрешенных для выбранной провинции.
function renderProcedures(city) {
  const select = document.getElementById("userProcedure");

  select.innerHTML = `<option value="">Выберите процедуру</option>`;

  const procedureIds = CITIES[city] || DEFAULT_CITY_PROCEDURES;

  procedureIds.forEach((id) => {
    const option = document.createElement("option");
    const meta = PROCEDURE_META?.[id]?.[city];

    option.value = id;
    option.textContent = PROCEDURES[id];

    if (meta?.status === "entrar_onlyClave") {
      option.disabled = true;
      option.textContent = `🚫 ${PROCEDURES[id]}`;
    }

    select.appendChild(option);
  });
}

// Проверяет обязательные поля и форматы введенных персональных и контактных данных.
function validateForm() {
  const name = userName.value.trim();
  const nie = userNie.value.trim();
  const tel = userTel.value.trim();
  const email = userEmail.value.trim();
  const city = userCity.value;
  const procedure = userProcedure.value;

  const nameRegex = /^[A-Z\s]+$/;
  const nieRegex = /^[A-Z][0-9]+[A-Z]$/;
  const telRegex = /^[67]\d{8}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!city) return "Выберите провинцию";
  if (!procedure) return "Выберите процедуру";

  if (!name || !nameRegex.test(name)) {
    return "ФИО должно быть латиницей";
  }

  const docType = docPassport?.checked ? "PASSPORT" : "NIE";

  if (docType === "NIE") {
    if (!nieRegex.test(nie)) {
      return "NIE должен быть в формате Z1234567W";
    }
  }
  if (docType === "PASSPORT") {
    if (!passportInput?.value.trim()) {
      return "Введите номер паспорта";
    }
  }

  if (!telRegex.test(tel)) {
    return "Телефон должен начинаться с 6 или 7 и содержать 9 цифр";
  }

  if (!emailRegex.test(email)) {
    return "Некорректный email";
  }

  return null;
}

// Определяет по справочнику, нужно ли показывать выбор типа документа для процедуры.
function shouldAskDocumentType(procedureId) {
  return PROCEDURES_REQUIRE_DOC_TYPE.has(Number(procedureId));
}

// При смене процедуры сохраняет выбор и обновляет доступность полей документа.
userProcedure.addEventListener("change", () => {
  chrome.storage.local.set({
    userProcedure: userProcedure.value,
  });

  updateDocumentTypeByMeta();
  updateDocumentInputsVisibility();
});

// При смене провинции перестраивает процедуры и офисы и сбрасывает старый выбор.
userCity.addEventListener("change", (e) => {
  const city = e.target.value;
  renderProcedures(city);
  renderOffices(city);

  userProcedure.value = "";
  chrome.storage.local.remove("userProcedure");

  const preferRadio = document.querySelector(
    'input[name="officeMode"][value="prefer"]',
  );
  if (preferRadio) preferRadio.checked = true;
  userProcedure.disabled = !city;
});

// Проверяет доступ и форму, затем сохраняет параметры и отправляет фоновую команду запуска.
async function handleStart() {
  const errorEl = document.getElementById("formError");
  errorEl.style.display = "none";
  const { isEnabled } = await chrome.storage.local.get("isEnabled");

  if (isEnabled) {
    await chrome.storage.local.set({ isEnabled: false });

    setButtonStart();
    enableForm();

    const { userData } = await chrome.storage.local.get("userData");
    if (userData?.documentType === "PASSPORT") {
      docPassport.checked = true;
    } else {
      docNie.checked = true;
    }

    updateDocumentInputsVisibility();

    chrome.runtime.sendMessage({
      action: "STOP_AUTOMATION",
      reason: "Остановлено пользователем",
    });

    return;
  }

  /* В production-режиме здесь проверяется авторизация и остаток лимита.
  if (
    !accessState ||
    (accessState.access === "demo" && Number(accessState.demo_left) <= 0) ||
    (accessState.access !== "demo" && accessState.access !== "vip")
  ) {
    errorEl.textContent =
      accessState?.access === "demo"
        ? "DEMO-лимит исчерпан"
        : "Нет активного доступа. Управление доступом — через Telegram Bot @ExtCitaBot.";
    errorEl.style.display = "block";
    return;
  }
  */
  const meta = PROCEDURE_META?.[Number(userProcedure.value)]?.[userCity.value];
  if (meta?.status === "entrar_onlyClave") {
    errorEl.textContent = "Эта процедура доступна только через Cl@ve";
    errorEl.style.display = "block";
    return;
  }

  const error = validateForm();
  if (error) {
    errorEl.textContent = error;
    errorEl.style.display = "block";
    return;
  }

  const selectedOffices = [
    ...document.querySelectorAll(".office_cb:checked"),
  ].map((cb) => cb.value);

  const officeMode =
    document.querySelector('input[name="officeMode"]:checked')?.value ||
    "prefer";

  const payload = {
    name: userName.value,
    nie: userNie.value,
    passport: passportInput?.value || "",
    documentType: docPassport?.checked ? "PASSPORT" : "NIE",
    tel: userTel.value,
    email: userEmail.value,
    city: userCity.value,
    procedure: Number(userProcedure.value),
    offices: selectedOffices,
    officeMode,
  };

  await chrome.storage.local.set({
    userData: payload,
    isEnabled: true,
  });

  updateDocumentInputsVisibility();

  lockForm();
  setButtonStop();

  chrome.runtime.sendMessage({
    action: "START_AUTOMATION",
    payload,
  });
}

// Восстанавливает сохраненное состояние и подключает обработчики элементов popup.
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(
    ["state", "authCode", "first_name", "username", "isEnabled"],
    (data) => {
      currentState = data.state || STATES.NOT_AUTH;
      authCode = data.authCode || null;

      if (LOCAL_TEST_MODE) {
        currentState = STATES.AUTHORIZED;
        showAuthorized({ first_name: "Локальный тест", username: "local-test" });
      } else if (currentState === STATES.AUTHORIZED) {
        showAuthorized(data);
      } else if (currentState === STATES.WAIT_TG && authCode) {
        showWaitTG();
      } else {
        showNotAuth();
      }

      if (data.isEnabled) {
        lockForm();
        setButtonStop();
      }
    },
  );

  const authStartBtn = document.getElementById("authStartBtn");
  if (authStartBtn) authStartBtn.addEventListener("click", startAuth);

  const authCheckBtn = document.getElementById("authCheckBtn");
  if (authCheckBtn) authCheckBtn.addEventListener("click", checkAuth);

  initForm();
  loadUserData();

  const citySelect = document.getElementById("userCity");
  if (citySelect) {
    citySelect.addEventListener("change", (e) => {
      renderProcedures(e.target.value);
    });
  }

  const startBtn = document.getElementById("startBtn");
  if (startBtn) {
    startBtn.addEventListener("click", handleStart);
  }

  chrome.storage.local.get("isEnabled", ({ isEnabled }) => {
    if (!isEnabled) {
      setButtonStart();
      enableForm();
      // renderProcedures(userCity.value);
      // return;
    }
  });
});

// Нормализует ввод: имя в верхнем регистре, NIE/паспорт/телефон по ожидаемому формату.
userName.addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase();
});

userNie.addEventListener("input", (e) => {
  let v = e.target.value
    .toUpperCase()
    .replace(/-/g, "")
    .replace(/[^A-Z0-9]/g, "");

  e.target.value = v.slice(0, 9);
});

passportInput.addEventListener("input", (e) => {
  let v = e.target.value.toUpperCase();

  e.target.value = v.slice(0, 9);
});

userTel.addEventListener("input", (e) => {
  let v = e.target.value.replace(/\D/g, "");

  if (v.length === 1 && !/[67]/.test(v)) {
    v = "";
  }

  e.target.value = v.slice(0, 9);
});

userEmail.addEventListener("input", (e) => {
  e.target.value = e.target.value.toLowerCase();
});

// При выборе NIE очищает паспортное поле, сохраняет тип документа и фокусирует NIE.
docNie?.addEventListener("change", () => {
  if (!docNie.checked) return;

  passportInput.value = "";
  persistDocumentType("NIE");

  updateDocumentInputsVisibility();
  userNie?.focus();
});

// При выборе паспорта очищает NIE, сохраняет тип документа и фокусирует паспортное поле.
docPassport?.addEventListener("change", () => {
  if (!docPassport.checked) return;

  userNie.value = "";
  persistDocumentType("PASSPORT");

  updateDocumentInputsVisibility();
  passportInput?.focus();
});

// Подключает действие выхода из Telegram-аккаунта.
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", logoutTelegram);
}

// Обрабатывает копирование кода авторизации, раскрытие и закрытие списка офисов.
document.addEventListener("click", (e) => {
  const officeWrapper = document.getElementById("officeWrapper");
  const officeContent = document.getElementById("officeContent");
  const officeToggle = document.getElementById("officeToggle");

  if (e.target.id === "copyAuthCodeBtn") {
    const text = document.getElementById("authCodeText")?.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text);
    const btn = e.target;
    btn.textContent = "✓";
    btn.style.opacity = "1";
    setTimeout(() => {
      btn.textContent = "📋";
      btn.style.opacity = "0.6";
    }, 1200);
    return;
  }

  if (!officeWrapper || isFormLocked) return;
  if (officeToggle && officeToggle.contains(e.target)) {
    const isCurrentlyHidden =
      officeContent.style.display === "none" ||
      officeContent.style.display === "";

    if (isCurrentlyHidden) {
      officeContent.style.display = "block";
      officeWrapper.classList.add("open");
    } else {
      officeContent.style.display = "none";
      officeWrapper.classList.remove("open");
    }
    return;
  }

  if (
    officeContent &&
    officeContent.style.display === "block" &&
    !officeWrapper.contains(e.target)
  ) {
    officeContent.style.display = "none";
    officeWrapper.classList.remove("open");
  }
});

// Синхронизирует отметки выбора офисов и обновляет краткую сводку списка.
document.addEventListener("change", (e) => {
  const summary = document.getElementById("selectedOfficeSummary");

  if (e.target.id === "office_any") {
    const checked = e.target.checked;
    document.querySelectorAll(".office_cb").forEach((cb) => {
      cb.checked = checked;
    });
  }

  if (e.target.classList.contains("office_cb")) {
    const all = document.querySelectorAll(".office_cb");
    const any = document.getElementById("office_any");
    const allChecked = [...all].every((cb) => cb.checked);

    if (any) any.checked = allChecked;
  }

  if (summary) {
    const any = document.getElementById("office_any");
    const mode =
      document.querySelector('input[name="officeMode"]:checked')?.value ||
      "prefer";

    const modeText = mode === "strict" ? "обязательно" : "предпочтительно";

    if (any && any.checked) {
      summary.textContent = `Любой (${modeText})`;
    } else {
      const count = document.querySelectorAll(".office_cb:checked").length;
      summary.textContent =
        count > 0
          ? `Выбрано: ${count} (${modeText})`
          : `Не выбрано (${modeText})`;
    }
  }
});

// Загружает сохраненные поля формы, выбранные офисы и режим поиска при открытии popup.
function loadUserData() {
  chrome.storage.local.get(
    ["userData", "isEnabled"],
    ({ userData: savedUserData, isEnabled }) => {
      const userData = TEST_USER_DATA_ENABLED ? TEST_USER_DATA : savedUserData;
      if (!userData) return;

      userName.value = userData.name || "";
      userNie.value = userData.nie || "";
      userTel.value = userData.tel || "";
      userEmail.value = userData.email || "";
      userCity.value = userData.city || "";

      userProcedure.disabled = !userData.city;

      renderProcedures(userData.city);
      renderOffices(userData.city);

      if (userData.procedure) {
        userProcedure.value = userData.procedure;
      }

      if (userData.offices && userData.offices.length) {
        setTimeout(() => {
          const allCbs = document.querySelectorAll(".office_cb");
          allCbs.forEach((cb) => {
            cb.checked = userData.offices.includes(cb.value);
          });

          const any = document.getElementById("office_any");
          if (any) {
            any.checked = [...allCbs].every((cb) => cb.checked);
          }

          const summary = document.getElementById("selectedOfficeSummary");
          if (summary) {
            const mode = userData.officeMode || "prefer";
            const modeText =
              mode === "strict" ? "обязательно" : "предпочтительно";

            if (any && any.checked) {
              summary.textContent = `Любой (${modeText})`;
            } else {
              const count = userData.offices.length;
              summary.textContent =
                count > 0
                  ? `Выбрано: ${count} (${modeText})`
                  : `Не выбрано (${modeText})`;
            }
          }

          const modeInput = document.querySelector(
            `input[name="officeMode"][value="${userData.officeMode || "prefer"}"]`,
          );
          if (modeInput) modeInput.checked = true;
        }, 0);
      }

      if (userData.documentType === "PASSPORT") {
        docPassport.checked = true;
        docNie.checked = false;
      } else {
        docNie.checked = true;
        docPassport.checked = false;
      }

      if (passportInput && userData.passport) {
        passportInput.value = userData.passport;
      }

      if (isEnabled) {
        lockForm();
        setButtonStop();
      }

      updateDocumentTypeByMeta();
      updateDocumentInputsVisibility();
    },
  );
}
