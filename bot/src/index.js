import "dotenv/config";
import { Bot } from "grammy";
import { registerTestSection } from "./test-section.js";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error(
    "TELEGRAM_BOT_TOKEN не задан. Добавьте токен в bot/.env и перезапустите бота.",
  );
}

const bot = new Bot(token);

// Первый экран бота.
bot.command("start", async (ctx) => {
  await ctx.reply(
    "Привет! Это тестовый Telegram-бот.\n\nДоступные команды:\n/start — первый экран\n/test — вызвать тестовую функцию",
  );
});

const closeTestBrowser = registerTestSection(bot);

bot.catch((error) => {
  console.error("Ошибка Telegram-бота:", error.error);
});

async function shutdown() {
  try {
    await closeTestBrowser();
  } catch (error) {
    console.error("Не удалось закрыть тестовый Chromium:", error);
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
