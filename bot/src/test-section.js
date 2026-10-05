import { InlineKeyboard } from "grammy";
import { launchTestBrowser } from "./test-browser.js";

const testSectionKeyboard = new InlineKeyboard().text(
  "Запустить Chromium с расширением",
  "test:launch-browser",
);

// Регистрирует экран тестирования и inline-действие запуска браузера.
export function registerTestSection(bot) {
  let browserContext = null;
  let launchInProgress = false;

  bot.command("test", async (ctx) => {
    await ctx.reply(
      "Раздел тестирования\n\n" +
        "Запуск откроет Chromium с расширением из корня проекта " +
        "в новом временном профиле. Перейдите на портал вручную.",
      { reply_markup: testSectionKeyboard },
    );
  });

  bot.callbackQuery("test:launch-browser", async (ctx) => {
    await ctx.answerCallbackQuery();

    if (browserContext) {
      await ctx.reply("Тестовый Chromium уже запущен. Закройте его окно перед повторным запуском.");
      return;
    }

    if (launchInProgress) {
      await ctx.reply("Chromium уже запускается, подождите.");
      return;
    }

    launchInProgress = true;
    await ctx.reply("Запускаю Chromium с расширением…");

    try {
      browserContext = await launchTestBrowser();
      browserContext.on("close", () => {
        browserContext = null;
      });
      await ctx.reply(
        "Chromium запущен в чистом временном профиле. " +
          "Портал автоматически не открывался; откройте его вручную.",
      );
    } catch (error) {
      browserContext = null;
      console.error("Не удалось запустить Chromium для тестирования:", error);
      await ctx.reply(
        "Не удалось запустить Chromium. Выполните в каталоге bot: " +
          "npx playwright install chromium",
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
