import "./test-data.js";

export const TEST_USER_DATA_ENABLED = true;
export const TEST_USER_DATA_CASES = globalThis.CITA_TEST_USER_DATA_CASES;
const USER_DATA_FIELDS = globalThis.CITA_TEST_USER_DATA_FIELDS;

function createTestUserData(values) {
  return Object.fromEntries(
    USER_DATA_FIELDS.map((field, index) => [field, values[index]]),
  );
}

export const TEST_USER_DATA = Object.freeze(
  createTestUserData(TEST_USER_DATA_CASES[0]),
);

export async function forEachTestUserData(
  callback = (userData, index) =>
    console.log(`Тестовый набор ${index + 1}:`, userData),
) {
  for (const [index, values] of TEST_USER_DATA_CASES.entries()) {
    await callback(createTestUserData(values), index);
  }
}
