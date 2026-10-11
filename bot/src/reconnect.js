const lookupUrl = "https://api.2ip.io";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Проверяет, что внешний IP, с которого откроется портал, определяется в Испании.
export async function assertSpain({ attempts = 5 } = {}) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(lookupUrl, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new Error(`Сервис геолокации вернул HTTP ${response.status}.`);
      }

      const info = await response.json();
      if (!info.ip || !info.country || !info.code) {
        throw new Error("Сервис геолокации вернул неполные данные.");
      }
      if (info.code !== "ES") {
        const error = new Error(
          `Переход заблокирован: IP ${info.ip} определяется как «${info.country}», требуется Испания.`,
        );
        error.code = "TARGET_GEO_BLOCKED";
        error.country = info.country;
        error.ip = info.ip;
        throw error;
      }

      return { ip: info.ip, country: info.country, countryCode: info.code };
    } catch (error) {
      if (error?.code === "TARGET_GEO_BLOCKED") throw error;
      lastError = error;
      if (attempt + 1 < attempts) await delay(2000);
    }
  }

  throw new Error(
    `Не удалось проверить геолокацию IP: ${lastError?.message || "неизвестная ошибка"}`,
    { cause: lastError },
  );
}

export default {
  name: "reconnect",
  register(_bot, context) {
    context.services.reconnect = { assertSpain };
  },
};
