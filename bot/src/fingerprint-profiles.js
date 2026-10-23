// Профили задают только поддерживаемые настройки Playwright.
// Диагностика показывает реальные значения; скрытые патчи Canvas/WebGL не применяются.

export const defaultProfile = "desktopDefault";

export const browserSettings = {
  headless: false,
  launchTimeout: 30_000,
};

export const profiles = {
  desktopDefault: {
    description: "Системные настройки Chromium на текущем компьютере",
    locale: "en-US",
    timezoneId: null,
    geolocation: null,
    viewport: { width: 1920, height: 1080 },
    screen: { width: 1920, height: 1080 },
    colorScheme: "light",
    reducedMotion: "no-preference",
    // null: использовать User-Agent фактически запущенного Chromium.
    userAgent: null,
    permissions: [],
  },
  windowsDesktop: {
    description: "Настройки окна desktop для сравнительных тестов",
    locale: "en-US",
    timezoneId: null,
    geolocation: null,
    viewport: { width: 1920, height: 1080 },
    screen: { width: 1920, height: 1080 },
    colorScheme: "light",
    reducedMotion: "no-preference",
    userAgent: null,
    permissions: [],
  },
};

export function getBrowserProfile(name = defaultProfile) {
  const profile = profiles[name];
  if (!profile) {
    throw new Error(
      `Неизвестный профиль "${name}". Доступны: ${Object.keys(profiles).join(", ")}`,
    );
  }

  const { width, height } = profile.viewport ?? {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`Профиль "${name}": некорректный viewport`);
  }

  if (profile.geolocation) {
    const { latitude, longitude, accuracy = 100 } = profile.geolocation;
    if (
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180 ||
      accuracy < 0
    ) {
      throw new Error(`Профиль "${name}": некорректная геолокация`);
    }
  }

  return { name, ...profile };
}
