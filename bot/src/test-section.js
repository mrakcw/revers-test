import { InlineKeyboard } from "grammy";
import { launchTestBrowser } from "./test-browser.js";

const testSectionKeyboard = new InlineKeyboard().text(
  "Запустить Chromium и диагностику",
  "test:launch-browser",
);

// Регистрирует экран тестирования и inline-действие запуска браузера.
export function registerTestSection(bot) {
  let browserContext = null;
  let launchInProgress = false;

  bot.command("test", async (ctx) => {
    await ctx.reply(
      "Chromium fingerprint lab\n\n" +
        "Запустится Chromium с чистым временным профилем и расширением. " +
        "Откроется локальная диагностическая страница; данные никуда не отправляются.",
      { reply_markup: testSectionKeyboard },
    );
  });

  bot.callbackQuery("test:launch-browser", async (ctx) => {
    await ctx.answerCallbackQuery();

    if (browserContext) {
      await ctx.reply("Тестовый Chromium уже запущен. Закройте окно перед повторным запуском.");
      return;
    }

    if (launchInProgress) {
      await ctx.reply("Chromium уже запускается, подождите.");
      return;
    }

    launchInProgress = true;
    await ctx.reply("Запускаю Chromium и локальную диагностику…");

    try {
      browserContext = await launchTestBrowser();
      browserContext.on("close", () => {
        browserContext = null;
      });
      await ctx.reply("Chromium запущен. В окне открыта локальная страница диагностики.");
    } catch (error) {
      browserContext = null;
      console.error("Не удалось запустить Chromium для тестирования:", error);
      await ctx.reply(
        "Не удалось запустить Chromium. В каталоге bot выполните: npx playwright install chromium",
      );
    } finally {
      launchInProgress = false;
    }
  });

  return async function closeTestBrowser() {
    if (!browserContext) return;
    const context = browserContext;
    browserContext = null;
    await context.close();
  };
}
