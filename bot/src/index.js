import "dotenv/config";
import { Bot } from "grammy";
import { registerAutomationSection } from "./automation-section.js";
import reconnect from "./reconnect.js";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error(
    "TELEGRAM_BOT_TOKEN не задан. Добавьте токен в bot/.env и перезапустите бота.",
  );
}

const bot = new Bot(token);
const context = {
  config: {
    targetLink:
      process.env.TARGET_LINK?.trim() ||
      "https://icp.administracionelectronica.gob.es/icpplustiem/index.html",
  },
  services: {},
};

reconnect.register(bot, context);

// Стартовый экран Telegram-бота.
bot.command("start", async (ctx) => {
  await ctx.reply(
    "Привет! Это исполнитель автоматизации Cita через Playwright без Chrome-расширения.\n\nДоступные команды:\n/start — это меню\n/test — справка по запуску\n/run — выбрать клиента и запустить сценарий\n/stop — остановить Firefox",
  );
});

const closeAutomationBrowser = registerAutomationSection(bot, context);

bot.catch((error) => {
  console.error("Ошибка Telegram-бота:", error.error);
});

async function shutdown() {
  try {
    await closeAutomationBrowser();
  } catch (error) {
    console.error("Не удалось закрыть Firefox:", error);
  } finally {
    bot.stop();
  }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

await bot.start({
  onStart: (botInfo) => {
    console.log(`Бот @${botInfo.username} запущен. Команды: /start, /test`);
  },
});
