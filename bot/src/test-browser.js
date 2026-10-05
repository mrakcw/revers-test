import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(sourceDirectory, "..", "..");

// Запускает Chromium с чистым временным профилем и расширением из корня проекта.
export async function launchTestBrowser() {
  await access(path.join(extensionPath, "manifest.json"));

  const profileDirectory = await mkdtemp(
    path.join(tmpdir(), "citaext-test-profile-"),
  );

  try {
    const context = await chromium.launchPersistentContext(profileDirectory, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    context.on("close", () => {
      rm(profileDirectory, { recursive: true, force: true }).catch((error) => {
        console.warn("Не удалось удалить временный профиль Chromium:", error);
      });
    });

    return context;
  } catch (error) {
    await rm(profileDirectory, { recursive: true, force: true });
    throw error;
  }
}
