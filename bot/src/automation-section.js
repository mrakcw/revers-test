import { randomBytes } from "node:crypto";
import { InlineKeyboard } from "grammy";
import {
  getRun,
  registerRun,
  startAutomation,
  stopAllRuns,
  validateAutomationPayload,
} from "./automation.js";
import { TEST_USER_DATA_CASES } from "../test-data.js";

const runKeyboard = new InlineKeyboard().text("Остановить запуск", "automation:stop");
const officeSelections = new Map();
const statusMessages = new Map();
const portalSteps = [
  { match: /\/icpplus(?:tiem)?\/index\.html(?:$|[;?])/, label: "выбор провинции" },
  { match: /\/citar(?:;|$)/, label: "выбор услуги" },
  { match: /\/acInfo(?:;|$)/, label: "условия и согласия" },
  { match: /\/acEntrada(?:;|$)/, label: "данные заявителя" },
  { match: /\/acValidarEntrada(?:;|$)/, label: "переход к запросу cita" },
  { match: /\/acCitar(?:B)?(?:;|$)/, label: "офисы и доступность" },
];

function createClientKeyboard() {
  const keyboard = new InlineKeyboard();
  for (const [index, { name }] of TEST_USER_DATA_CASES.entries()) {
    keyboard.text(name, `automation:client:${index}`).row();
  }
  return keyboard;
}

function createOfficeKeyboard(token, offices) {
  const keyboard = new InlineKeyboard();
  offices.forEach((office, index) => {
    keyboard.text(office.name || office.id, `automation:office:${token}:${index}`).row();
  });
  return keyboard;
}

function getChatId(ctx) {
  return ctx.chat?.id ?? ctx.callbackQuery?.message?.chat?.id;
}

async function answerCallbackQuerySafely(ctx, options) {
  try {
    await ctx.answerCallbackQuery(options);
    return true;
  } catch (error) {
    const description = error.description || error.message || "";
    if (/query is too old|response timeout expired|query ID is invalid/i.test(description)) {
      console.warn("Telegram callback истек; обработчик продолжает выполнение без подтверждения.");
      return false;
    }
    throw error;
  }
}

// Telegram handlers adapt the bot UI; other modules can call startAutomation directly.
export function registerAutomationSection(bot, context) {
  const launchingChats = new Set();

  async function startClientAutomation(ctx, index, checkMode, selectedOffice = null) {
    const chatId = getChatId(ctx);
    if (getRun(chatId) || launchingChats.has(chatId)) {
      await ctx.reply("В этом чате уже работает сценарий. Остановите его командой /stop.");
      return;
    }
    const sourcePayload = TEST_USER_DATA_CASES[index];
    if (!sourcePayload) {
      await ctx.reply("Не удалось найти данные выбранного клиента.");
      return;
    }

    launchingChats.add(chatId);
    let run;
    let pendingClose = false;
    let statusMessage;
    let lastStatusText = "";
    let noSlotsDetail = "";
    let progressStep = 0;
    let statusUpdateQueue = Promise.resolve();
    const updateStatus = (text, keyboard = false) => {
      statusUpdateQueue = statusUpdateQueue.then(async () => {
        if (!statusMessage || text === lastStatusText) return;
        lastStatusText = text;
        try {
          await ctx.api.editMessageText(chatId, statusMessage.message_id, text, {
            reply_markup: keyboard ? runKeyboard : { inline_keyboard: [] },
          });
        } catch (error) {
          if (!/message is not modified/i.test(error.description || error.message || "")) {
            console.warn("Не удалось обновить сообщение статуса:", error.message);
          }
        }
      });
      return statusUpdateQueue;
    };
    try {
      const payload = validateAutomationPayload({
        ...sourcePayload,
        checkMode,
        ...(selectedOffice ? { offices: [selectedOffice.id], officeMode: "strict" } : {}),
      });
      if (!context.services.reconnect) {
        throw new Error("Модуль reconnect должен быть включен для перехода по TARGET_LINK.");
      }
      statusMessage = await ctx.reply(`Проверяю IP и запускаю Firefox для клиента ${payload.name}…`, { reply_markup: runKeyboard });
      statusMessages.set(chatId, statusMessage.message_id);
      lastStatusText = `Проверяю IP и запускаю Firefox для клиента ${payload.name}…`;
      run = await startAutomation(payload, async (event) => {
        if (event.type === "stopped") {
          if (event.reason === "no_slots") {
            await updateStatus(`Свободных записей нет. Проверка завершена.${noSlotsDetail ? `\n${noSlotsDetail}` : ""}`);
          } else if (event.reason === "office_results") {
            await updateStatus("Список доступных офисов получен. Проверка завершена.");
          } else if (event.reason === "date_results") {
            await updateStatus("Результат проверки дат получен.");
          } else if (!["stopped_by_user", "local_test_booking_boundary", "portal_load_error", "portal_rejected_request"].includes(event.reason)) {
            await updateStatus(`Сценарий остановлен: ${event.reason}`);
          }
          if (["no_slots", "office_results", "date_results", "offices_unavailable", "requested_offices_unavailable"].includes(event.reason)) {
            statusMessages.delete(chatId);
            const activeRun = getRun(chatId);
            if (activeRun) await activeRun.close();
            else pendingClose = true;
          }
        } else if (event.type === "automation_result") {
          if (event.resultType === "no_slots") {
            const message = event.data?.message || "En este momento no hay citas disponibles";
            noSlotsDetail = message;
            await updateStatus(`Свободных записей нет. Проверка завершена.\n${message}`);
            return;
          }
          const officesResult = event.resultType === "offices";
          const title = officesResult ? "Доступные офисы" : "Доступные даты/время";
          const values = Array.isArray(event.data) ? event.data : [];
          const rows = values.map((item) => typeof item === "string" ? `• ${item}` : `• ${item.name || item.id}`);
          const resultKeyboard = new InlineKeyboard();
          if (officesResult && values.length) {
            const offices = values
              .map((item) => typeof item === "string" ? { id: item, name: item } : { id: String(item.id ?? ""), name: String(item.name ?? item.id ?? "") })
              .filter((item) => item.id);
            if (offices.length) {
              let token;
              do { token = randomBytes(4).toString("hex"); } while (officeSelections.has(token));
              officeSelections.set(token, { chatId, clientIndex: index, offices });
              resultKeyboard.text("Проверить даты", `automation:dates:${token}`);
            }
          }
          await ctx.reply(`${title}:\n${rows.length ? rows.join("\n") : "вариантов нет"}`, resultKeyboard.inline_keyboard.length ? { reply_markup: resultKeyboard } : undefined);
          if (officesResult) await updateStatus("Список доступных офисов получен. Проверка завершена.");
          else await updateStatus("Результат проверки дат получен.");
        } else if (event.type === "network_error") {
          await updateStatus(`Сетевая ошибка портала: ${event.reason}. Проверка остановлена.`);
        } else if (event.type === "portal_error") {
          if (!event.reason?.includes("The requested URL was rejected")) await updateStatus(`Портал вернул ошибку: ${event.reason}`);
        } else if (event.type === "access_rejected") {
          await updateStatus(event.supportId ? `Портал отклонил запрос (Support ID: ${event.supportId}). Проверка остановлена; автоматического повтора не будет.` : "Портал отклонил запрос. Проверка остановлена; автоматического повтора не будет.");
        } else if (event.type === "page_navigated") {
          const stepIndex = portalSteps.findIndex(({ match }) => match.test(event.url || ""));
          if (stepIndex >= progressStep) {
            progressStep = stepIndex + 1;
            if (stepIndex >= 0) await updateStatus(`Этап ${progressStep}/6 — ${portalSteps[stepIndex].label}. Клиент: ${payload.name}.`, true);
          }
        } else if (event.type === "page_error") {
          console.error(`Ошибка страницы портала (${event.url || "URL неизвестен"}):`, event.reason);
        } else if (event.type === "browser_interstitial") {
          console.error(`Firefox показал страницу ошибки вместо портала (${event.url || "URL неизвестен"}; ${event.documentURI || ""}):`, event.reason);
        } else if (event.type === "page_console_error") {
          console.error(`Firefox console (${event.url || "URL неизвестен"}):`, event.reason);
        } else if (event.type === "page_console") {
          console.log(`Firefox ${event.level} (${event.url || "URL неизвестен"}):`, event.reason);
        } else if (event.type === "page_navigated") {
          console.log("Firefox перешел на:", event.url);
        }
      }, {
        targetUrl: context.config.targetLink,
        beforeNavigate: async () => context.services.reconnect.assertSpain(),
      });
      registerRun(chatId, run);
      if (pendingClose) await run.close();
      if (run.initialNavigationError) {
        await updateStatus(`Firefox оставлен открытым, но начальная навигация не прошла: ${run.initialNavigationError.message}\nМожно проверить окно и вручную повторить переход.`, true);
      }
    } catch (error) {
      if (run && getRun(chatId) !== run) await run.close().catch((closeError) => console.error("Не удалось закрыть Firefox после ошибки запуска:", closeError));
      console.error("Не удалось запустить сценарий Playwright:", error);
      const cause = error.message.includes("SEC_ERROR_UNKNOWN_ISSUER")
        ? "Firefox не смог проверить TLS-цепочку сайта. Проверьте сертификат и цепочку на стороне портала; проверка TLS в сценарии не отключена."
        : error.message;
      if (statusMessage) await updateStatus(`Не удалось запустить сценарий: ${cause}`);
      else await ctx.reply(`Не удалось запустить сценарий: ${cause}`);
    } finally {
      launchingChats.delete(chatId);
    }
  }

  bot.command("test", async (ctx) => {
    await ctx.reply("Исполнитель Playwright запускается без Chrome-расширения. /run запускает короткую проверку офисов; после результата можно перейти к выбору офиса и проверке дат. /stop останавливает браузер. Тестовый сценарий остановится перед CAPTCHA, SMS и подтверждением записи.");
  });

  bot.command("run", async (ctx) => {
    const chatId = getChatId(ctx);
    if (getRun(chatId) || launchingChats.has(chatId)) {
      await ctx.reply("В этом чате уже работает сценарий. Остановите его командой /stop.");
      return;
    }
    await ctx.reply("Выберите тестового клиента для короткой проверки офисов:", { reply_markup: createClientKeyboard() });
  });

  bot.callbackQuery(/^automation:client:(\d+)$/, async (ctx) => {
    const index = Number(ctx.match[1]);
    if (!TEST_USER_DATA_CASES[index]) {
      await answerCallbackQuerySafely(ctx, { text: "Клиент не найден.", show_alert: true });
      return;
    }
    await answerCallbackQuerySafely(ctx);
    await startClientAutomation(ctx, index, "offices");
  });

  bot.callbackQuery(/^automation:dates:([a-f0-9]{8})$/, async (ctx) => {
    const token = ctx.match[1];
    const selection = officeSelections.get(token);
    if (!selection || selection.chatId !== getChatId(ctx)) {
      await answerCallbackQuerySafely(ctx, { text: "Результат устарел. Запустите /run заново.", show_alert: true });
      return;
    }
    await answerCallbackQuerySafely(ctx);
    await ctx.reply("Выберите офис из списка, найденного при короткой проверке:", { reply_markup: createOfficeKeyboard(token, selection.offices) });
  });

  bot.callbackQuery(/^automation:office:([a-f0-9]{8}):(\d+)$/, async (ctx) => {
    const [, token, rawIndex] = ctx.match;
    const selection = officeSelections.get(token);
    const office = selection?.offices[Number(rawIndex)];
    if (!selection || selection.chatId !== getChatId(ctx) || !office) {
      await answerCallbackQuerySafely(ctx, { text: "Результат устарел. Запустите /run заново.", show_alert: true });
      return;
    }
    officeSelections.delete(token);
    await answerCallbackQuerySafely(ctx, { text: `Выбран офис: ${office.name}` });
    await startClientAutomation(ctx, selection.clientIndex, "dates", office);
  });

  bot.command("stop", async (ctx) => {
    const chatId = getChatId(ctx);
    const run = getRun(chatId);
    if (!run) return void await ctx.reply("В этом чате нет активного сценария.");
    await run.stop("stopped_by_user");
    const messageId = statusMessages.get(chatId);
    if (messageId) {
      await ctx.api.editMessageText(chatId, messageId, "Сценарий остановлен, Firefox закрыт.", { reply_markup: { inline_keyboard: [] } });
      statusMessages.delete(chatId);
    }
  });

  bot.callbackQuery("automation:stop", async (ctx) => {
    await answerCallbackQuerySafely(ctx);
    const run = getRun(getChatId(ctx));
    if (!run) return void await ctx.reply("Активного сценария уже нет.");
    await run.stop("stopped_by_user");
    await ctx.editMessageText("Сценарий остановлен, Firefox закрыт.", { reply_markup: { inline_keyboard: [] } });
    statusMessages.delete(getChatId(ctx));
  });

  return stopAllRuns;
}
