# CitaExt — Изолированный Execution-модуль ICPPlus

Автономный модуль выполнения проверок свободных записей (считай, «исполнитель одного запуска») на государственных порталах Испании ICPPlus (`icp.administracionelectronica.gob.es`).

---

## 🎯 Главное назначение и Принципы

Модуль предназначен исключительно для **однократной проверки наличия записей или извлечения доступных слотов** за один изолированный запуск.

### 🛡️ Ключевые правила работы:
1. **Единый входной объект**: Принимает всю информацию запускным объектом `runScenario(input)`.
2. **Один запуск = Один проход (Single Pass)**: Модуль **НЕ содержит** внутренних циклов повтора (`setInterval`, ретраи через 3.5–4.5 минуты, 7-минутные паузы). При любом исходе он немедленно возвращает результат вызвавшему модулю.
3. **ГАРАНТИЯ ОТСУТСТВИЯ БРОНИРОВАНИЯ (Read-Only)**: Модуль **НИКОГДА не выбирает радио-кнопки бронирования**, не нажимает `Siguiente` после получения слотов, не запрашивает SMS для финальной записи и не создаёт запись.
4. **Два режима работы**:
   - **`SHORT`** — короткий быстрый проход (~6 шагов). Сразу сообщает, есть ли вообще доступность (`AVAILABLE` / `NO_SLOTS`).
   - **`FULL`** — полный проход (~8 шагов). Доходит до экрана слотов и возвращает полный массив доступных вариантов без их выбора.
5. **Внешнее управление повторами**: Вопросами расписания, очередности клиентов, повторов через N минут, Telegram-команд и планировщика занимается **внешний модуль/шедулер**.

---

## 📁 Структура файлов

- **[`execution-module.js`](file:///d:/Profile/Desktop/work/cita/revers-test/execution-module.js)** — **Единый автономный JS-файл**, содержащий всю логику нормализации, валидации, парсер слотов, метаданные и главную функцию `runScenario(input)` / `executeScenario(input)`.
- **[`background.js`](file:///d:/Profile/Desktop/work/cita/revers-test/background.js)** — Background Service Worker Chrome MV3, управляющий вкладками браузера и обещаниями (Promises) вызовов.
- **[`content.js`](file:///d:/Profile/Desktop/work/cita/revers-test/content.js)** — Исполнительный скрипт страницы ICPPlus. Проводит однократный проход без ретраев и бронирования.
- **[`content-helpers.js`](file:///d:/Profile/Desktop/work/cita/revers-test/content-helpers.js)** — Вспомогательные хелперы DOM и парсеры для среды `content.js`.
- **[`timings.js`](file:///d:/Profile/Desktop/work/cita/revers-test/timings.js)** — Конфигурация внутренних UI-задержек между шагами страницы.
- **[`procedures.js`](file:///d:/Profile/Desktop/work/cita/revers-test/procedures.js)** — Справочники и метаданные верстки форм (`PROCEDURE_META`).
- **[`tests/unit-tests.js`](file:///d:/Profile/Desktop/work/cita/revers-test/tests/unit-tests.js)** — Набор автоматических модульных автотестов на Node.js.

---

## 🚀 Пример использования API

```javascript
import { runScenario } from "./execution-module.js";

// 1. Короткий проход (SHORT)
const shortResult = await runScenario({
  jobId: "job-1001",
  mode: "SHORT",

  client: {
    id: 123,
    name: "IVAN PETROV",
    documentType: "NIE", // "NIE" | "PASSPORT"
    nie: "Y1234567X",
    passport: "",
    birthYear: "1990",
    phone: "612345678",
    email: "test@example.com"
  },

  target: {
    city: "Madrid",
    procedure: 4036,
    offices: ["4"],
    officeMode: "prefer" // "prefer" | "strict"
  }
});

console.log(shortResult);

// 2. Полный проход с извлечением слотов (FULL)
const fullResult = await runScenario({
  jobId: "job-1002",
  mode: "FULL",
  // ...те же параметры client и target
});

console.log(fullResult.data.slots);
```

---

## 🔄 Описание шагов режимов SHORT и FULL

### 1. SHORT Scenario (6 логических шагов)
1. **[SHORT][STEP 1] Entry**: Переход на `index.html` и нажатие `#submit` (*Acceder al Procedimiento*).
2. **[SHORT][STEP 2] Province**: Выбор `target.city` в выпадающем списке и клик `#btnAceptar`.
3. **[SHORT][STEP 3] Procedure**: Выбор `target.procedure` с проверкой `PROCEDURE_META` и клик `#btnAceptar`.
4. **[SHORT][STEP 4] Entrar**: Нажатие кнопки входа `#btnEntrar`.
5. **[SHORT][STEP 5] Applicant Data**: Ввод данных заявителя (NIE/Passport, ФИО, год рождения, страна) и клик `#btnEnviar`.
6. **[SHORT][STEP 6] Availability Filter**: Обработка выбора офиса (при наличии `#idSede` и `officeMode`) и фиксация результата:
   - Если появилась надпись *«En este momento no hay citas disponibles»* → результат `NO_SLOTS`.
   - Если доступность подтверждена (появились офисы / кнопка *Solicitar Cita* / свободные даты) → **ОСТАНОВКА И ВОЗВРАТ `AVAILABLE`** (без загрузки массива слотов и без анкеты).

### 2. FULL Scenario (8 логических шагов)
1–6. **[FULL][STEP 1–6]**: Выполнение шагов 1–6 аналогично SHORT.
7. **[FULL][STEP 7] Contact Form**: Заполнение контактных данных заявителя (`Teléfono`, `Correo electrónico`) и клик `Siguiente`.
8. **[FULL][STEP 8] Slots Extraction**: Доход до экрана выбора записей (*Selecciona una de las siguientes citas disponibles* или таблицы `LIBRE`), сбор всех доступных вариантов функцией `extractAvailableSlots()`, **ОСТАНОВКА без выбора и без бронирования**.

---

## 📊 Формат результатов работы (Output Contract)

### 1. Свободные слоты есть (`AVAILABLE`)
- **В режиме `SHORT`**:
```json
{
  "ok": true,
  "status": "AVAILABLE",
  "jobId": "job-1001",
  "mode": "SHORT",
  "data": {
    "slots": []
  }
}
```

- **В режиме `FULL`**:
```json
{
  "ok": true,
  "status": "AVAILABLE",
  "jobId": "job-1002",
  "mode": "FULL",
  "data": {
    "slots": [
      {
        "id": "cita_1",
        "value": "2026-10-15 10:30",
        "radioId": "cita_1",
        "text": "15/10/2026 10:30 CNP MADRID",
        "date": "15/10/2026",
        "time": "10:30",
        "office": "CNP MADRID"
      }
    ]
  }
}
```

### 2. Записей нет (`NO_SLOTS`)
```json
{
  "ok": true,
  "status": "NO_SLOTS",
  "jobId": "job-1001",
  "mode": "SHORT",
  "data": {
    "slots": []
  }
}
```

### 3. Ошибки и ограничения (Statuses)
- `VALIDATION_ERROR`: Ошибка во входном объекте (неверный формат NIE, отсутствует имя или город).
- `OFFICE_NOT_AVAILABLE`: В режиме `officeMode: "strict"` требуемого офиса не оказалось в выпадающем списке.
- `CLAVE_ONLY`: Данная процедура в выбранной провинции требует входа через Clave (`entrar_onlyClave`).
- `RATE_LIMITED`: Сайт вернул ошибку `HTTP 429` (Too Many Requests).
- `SITE_ERROR`: Сайт недоступен (`HTTP 503`, `HTTP 403`, Forbidden, WAF block).
- `STOPPED`: Выполнение принудительно остановлено внешним вызовом.
- `CAPTCHA_REQUIRED`: Страница требует решения капчи до получения доступа к слотам.

---

## 🧪 Запуск и Проверка

### 1. Модульные автотесты (без браузера)
В корне проекта выполните команду:
```bash
node tests/unit-tests.js
```

### 2. Ручное тестирование через Google Chrome
1. Откройте `chrome://extensions`.
2. Включите **Режим разработчика**.
3. Нажмите **Загрузить распакованное расширение** и выберите папку проекта.
4. Откройте popup расширения, выберите провинцию, процедуру, введите тестовые данные, выберите режим `SHORT` или `FULL` и нажмите **Начать**.

---

## 🔒 Безопасность и Персональные Данные (PII)

Все логи скрипта автоматически маскируют чувствительные персональные данные (NIE, Паспорт, Телефон, Email) с помощью встроенного маскера:
`[SHORT][STEP 5] Applicant NIE: Y12***X, Phone: ***678`.
