globalThis.CITA_TEST_USER_DATA_FIELDS = [
  "name",
  "nie",
  "passport",
  "documentType",
  "tel",
  "email",
  "city",
  "procedure",
  "offices",
  "officeMode",
];

globalThis.CITA_TEST_USER_DATA_CASES = [
  [
    "BIRIULIN STANISLAV",
    "Y3370358K",
    "",
    "NIE",
    "645345678",
    "mrakcw@gmail.com",
    "Alicante",
    4112,
    ["6"],
    "prefer",
  ],
  [
    "OSNOVSKA OLENA",
    "",
    "FL671015",
    "PASSPORT",
    "600000001",
    "mrakcw@gmail.com",
    "Bizkaia",
    4111,
    ["1"],
    "prefer",
  ],
  [
    "SHCHERBAN BOHDAN",
    "Z2188812E",
    "",
    "NIE",
    "600000002",
    "test-three@example.com",
    "Valencia",
    4112,
    ["3"],
    "prefer",
  ],
];

export const TEST_USER_DATA_CASES = Object.freeze(
  globalThis.CITA_TEST_USER_DATA_CASES.map((values) =>
    Object.freeze(
      Object.fromEntries(
        globalThis.CITA_TEST_USER_DATA_FIELDS.map((field, index) => [
          field,
          values[index],
        ]),
      ),
    ),
  ),
);
