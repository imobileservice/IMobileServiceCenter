/**
 * Mobile Phone Models grouped by Brand
 * Used for dynamic model selection in the admin panel
 */

export interface ModelOption {
  value: string;
  label: string;
}

export const MODELS_BY_BRAND: Record<string, string[]> = {
  "Apple": [
    "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15 Plus", "iPhone 15",
    "iPhone 14 Pro Max", "iPhone 14 Pro", "iPhone 14 Plus", "iPhone 14",
    "iPhone 13 Pro Max", "iPhone 13 Pro", "iPhone 13", "iPhone 13 mini",
    "iPhone 12 Pro Max", "iPhone 12 Pro", "iPhone 12", "iPhone 12 mini",
    "iPhone 11 Pro Max", "iPhone 11 Pro", "iPhone 11",
    "iPhone XS Max", "iPhone XS", "iPhone XR", "iPhone X",
    "iPhone 8 Plus", "iPhone 8", "iPhone 7 Plus", "iPhone 7",
    "iPhone SE (3rd Gen)", "iPhone SE (2nd Gen)"
  ],
  "Samsung": [
    "Galaxy S24 Ultra", "Galaxy S24+", "Galaxy S24",
    "Galaxy S23 Ultra", "Galaxy S23+", "Galaxy S23", "Galaxy S23 FE",
    "Galaxy S22 Ultra", "Galaxy S22+", "Galaxy S22",
    "Galaxy S21 Ultra", "Galaxy S21+", "Galaxy S21", "Galaxy S21 FE",
    "Galaxy Z Fold5", "Galaxy Z Flip5", "Galaxy Z Fold4", "Galaxy Z Flip4",
    "Galaxy A54 5G", "Galaxy A34 5G", "Galaxy A24", "Galaxy A14 5G",
    "Galaxy A05s", "Galaxy A05", "Galaxy M54", "Galaxy M34"
  ],
  "Xiaomi": [
    "Xiaomi 14 Ultra", "Xiaomi 14", "Xiaomi 13 Ultra", "Xiaomi 13 Pro", "Xiaomi 13",
    "Xiaomi 12T Pro", "Xiaomi 12T", "Xiaomi 12 Pro", "Xiaomi 12"
  ],
  "Redmi": [
    "Redmi Note 13 Pro+ 5G", "Redmi Note 13 Pro", "Redmi Note 13",
    "Redmi Note 12 Pro+ 5G", "Redmi Note 12 Pro", "Redmi Note 12",
    "Redmi Note 11 Pro+", "Redmi Note 11 Pro", "Redmi Note 11",
    "Redmi 13C", "Redmi 12", "Redmi 10", "Redmi A3", "Redmi A2"
  ],
  "Poco": [
    "Poco X6 Pro", "Poco X6", "Poco M6 Pro", "Poco F5 Pro", "Poco F5",
    "Poco X5 Pro", "Poco X5", "Poco M5", "Poco C65"
  ],
  "Oppo": [
    "Oppo Reno 11 Pro", "Oppo Reno 11", "Oppo Reno 10 Pro", "Oppo Reno 10",
    "Oppo F25 Pro", "Oppo F23", "Oppo A78", "Oppo A58", "Oppo A38", "Oppo A18"
  ],
  "Vivo": [
    "Vivo X100 Pro", "Vivo X100", "Vivo V30 Pro", "Vivo V30", "Vivo V29 Pro", "Vivo V29",
    "Vivo Y200", "Vivo Y100", "Vivo Y56", "Vivo Y27", "Vivo Y17s"
  ],
  "Realme": [
    "Realme 12 Pro+", "Realme 12 Pro", "Realme 12", "Realme 11 Pro+", "Realme 11 Pro",
    "Realme 11", "Realme C67", "Realme C55", "Realme C53", "Realme C51"
  ],
  "OnePlus": [
    "OnePlus 12", "OnePlus 12R", "OnePlus 11", "OnePlus 11R",
    "OnePlus Nord 3 5G", "OnePlus Nord CE 3 5G", "OnePlus Nord CE 3 Lite"
  ],
  "Huawei": [
    "Huawei P60 Pro", "Huawei P60", "Huawei Mate 60 Pro", "Huawei Mate 60",
    "Huawei Nova 11", "Huawei Nova 10", "Huawei Y9a", "Huawei Y7a"
  ],
  "Honor": [
    "Honor 90", "Honor 70", "Honor X9b", "Honor X8b", "Honor X7b"
  ],
  "Google": [
    "Pixel 8 Pro", "Pixel 8", "Pixel 7 Pro", "Pixel 7", "Pixel 7a",
    "Pixel 6 Pro", "Pixel 6", "Pixel 6a"
  ],
  "Sony": [
    "Xperia 1 V", "Xperia 5 V", "Xperia 10 V", "Xperia 1 IV", "Xperia 5 IV"
  ],
  "Infinix": [
    "Hot 60i", "Hot 50", "Hot 50i", "Hot 40", "Hot 40i", "Hot 30", "Hot 30i",
    "Hot 20", "Hot 20i", "Hot 12", "Hot 12 Play", "Hot 11", "Hot 11 Play",
    "Hot 10", "Hot 10 Play", "Hot 10 Lite", "Hot 9", "Hot 9 Play",
    "Note 40", "Note 30", "Note 30 Pro", "Note 12", "Note 12 Pro", "Note 11",
    "Note 11 Pro", "Note 10", "Note 10 Pro", "Note 8",
    "Smart 9", "Smart 8", "Smart 7", "Smart 6", "Smart 5", "Smart 4",
    "Pop 9", "Pop 8", "Pop 7", "Zero 30", "Zero 20", "Zero 5G", "GT 20 Pro"
  ],
  "Tecno": [
    "Spark 20", "Spark 20 Pro", "Spark 10", "Spark 10 Pro", "Spark 9",
    "Spark 9T", "Spark 8", "Spark 8C", "Spark 7", "Spark 6", "Spark Go 2024",
    "Spark Go 2023", "Pop 8", "Pop 7", "Pop 6", "Pop 5", "Pop 5 LTE", "Pop 4",
    "Camon 30", "Camon 20", "Camon 20 Pro", "Camon 19", "Camon 18",
    "Pova 6", "Pova 5", "Pova 4", "Phantom X2", "Phantom V Fold"
  ],
  "itel": [
    "A100C", "A80", "A70", "A60", "A60s", "A58", "A48", "A27", "A26",
    "P55", "P40", "P38", "S23", "S18", "Vision 5", "Vision 3", "Vision 2",
    "it2163", "Power 70"
  ],
  "Nokia": [
    "1.4", "2.3", "2.4", "3.4", "5.3", "5.4", "6.2", "7.2", "8.3 5G",
    "C1", "C2", "C3", "C10", "C12", "C20", "C21", "C21 Plus", "C30", "C32",
    "C01 Plus", "G10", "G20", "G21", "G22", "G42", "X10", "X20", "XR20",
    "105", "110", "150", "225 4G"
  ],
  "Motorola": [
    "Moto E13", "Moto E14", "Moto E22", "Moto E32", "Moto E40", "Moto E7",
    "Moto G04", "Moto G04S", "Moto G14", "Moto G22", "Moto G23", "Moto G24",
    "Moto G30", "Moto G31", "Moto G40", "Moto G54", "Moto G60", "Moto G84",
    "Edge 40", "Edge 30", "Edge 50 Pro"
  ],
  "TCL": [
    "20E", "20Y", "20 SE", "30E", "30 SE", "40 SE", "40 NxtPaper",
    "301", "303", "305", "306", "403", "405", "406", "501", "503", "505",
    "L7", "L9"
  ],
  "ZTE": [
    "Blade A5 2020", "Blade A31", "Blade A32", "Blade A33", "Blade A34",
    "Blade A35", "Blade A51", "Blade A52", "Blade A53", "Blade A54",
    "Blade A55", "Blade A72", "Blade A73", "Blade A36/A56/A76 5G",
    "Blade V30 Vita", "Blade V40 Design", "Blade V50 Design", "Blade V70 Max",
    "Nubia Z50", "Axon 40 Ultra"
  ],
  "Wiko": [
    "T10", "T20", "T50", "T60", "Y52", "Y61", "Y62", "Y81", "Y82",
    "Power U10", "Power U20", "Power U30"
  ],
  "Blackview": [
    "A55", "A55 Pro", "A70", "A80", "A80 Plus", "A95", "A100",
    "Wave 8", "Wave 6C", "Shark 8", "Color 8", "BV4900", "BV6600", "BV9800"
  ],
  "Umidigi": [
    "G5", "G5A", "G5 Mecha", "G9A", "G9C", "A13", "A13 Pro", "A15C",
    "Power 7", "Power 5", "C1", "C2"
  ],
  "Meizu": [
    "M21", "M22", "Note 21", "Note 20", "20 Pro", "18", "16T"
  ],
  "Coolpad": [
    "CP12", "CP16", "Cool 20", "Cool 30", "Note 8"
  ],
  "Doogee": [
    "N50", "N55", "X95", "X98", "S98", "S99", "V30"
  ],
  "Hotwav": [
    "Note 12", "Note 13", "Cyber 13", "Cyber X", "T5 Pro", "W10"
  ],
  "Lebest": [
    "L2", "L3", "L5"
  ],
  "Redbeat": [
    "D5", "D6"
  ],
  "Freeyond": [
    "F9", "F9 Pro", "F10", "M5"
  ],
  "Nothing": [
    "Phone (2a)", "Phone (2)", "Phone (1)", "CMF Phone 1"
  ],
  "Asus": [
    "ROG Phone 8 Pro", "ROG Phone 8", "ROG Phone 7", "Zenfone 10", "Zenfone 9"
  ]
};

export const BRANDS = Object.keys(MODELS_BY_BRAND).sort();

/**
 * Canonical brand lookup.
 *
 * Products were historically saved with brand "Other" and the real manufacturer
 * buried in the model text ("Other MOTO G30 Display"). These aliases map every
 * spelling seen in the catalogue - including the odd typo - onto one canonical
 * brand name, so the storefront never shows "Other" again.
 *
 * Keys must be lowercase.
 */
export const BRAND_ALIASES: Record<string, string> = {
  apple: "Apple", iphone: "Apple",
  samsung: "Samsung", galaxy: "Samsung",
  xiaomi: "Xiaomi",
  redmi: "Redmi",
  poco: "Poco",
  oppo: "Oppo",
  vivo: "Vivo",
  realme: "Realme",
  oneplus: "OnePlus", "one plus": "OnePlus",
  huawei: "Huawei",
  honor: "Honor",
  google: "Google", pixel: "Google",
  sony: "Sony", xperia: "Sony",
  asus: "Asus", zenfone: "Asus",
  infinix: "Infinix",
  tecno: "Tecno", techno: "Tecno",
  itel: "itel",
  nokia: "Nokia",
  motorola: "Motorola", moto: "Motorola",
  tcl: "TCL",
  zte: "ZTE",
  wiko: "Wiko",
  blackview: "Blackview", blakeview: "Blackview", blackveiw: "Blackview",
  umidigi: "Umidigi", umidgi: "Umidigi",
  meizu: "Meizu",
  coolpad: "Coolpad", "cool pad": "Coolpad",
  doogee: "Doogee",
  hotwav: "Hotwav",
  lebest: "Lebest",
  redbeat: "Redbeat",
  freeyond: "Freeyond",
  nothing: "Nothing",
};

/** Aliases sorted longest-first so "one plus" wins over "oneplus" prefixes. */
const SORTED_ALIASES = Object.keys(BRAND_ALIASES).sort((a, b) => b.length - a.length);

/**
 * Turn any user/legacy spelling of a brand into its canonical name.
 * Unknown brands are returned title-cased rather than dropped, so a genuinely
 * new manufacturer still gets a usable name instead of falling back to "Other".
 */
export function normalizeBrandName(input: string): string {
  const trimmed = (input || "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  const canonical = BRAND_ALIASES[trimmed.toLowerCase()];
  if (canonical) return canonical;

  // Already a known brand key, just with different casing
  const known = Object.keys(MODELS_BY_BRAND).find(
    (b) => b.toLowerCase() === trimmed.toLowerCase()
  );
  if (known) return known;

  return trimmed
    .split(" ")
    .map((word) =>
      word.length > 3 ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word.toUpperCase()
    )
    .join(" ");
}

/**
 * Pull the manufacturer out of a free-text model/product string.
 * "MOTO G30" -> { brand: "Motorola", model: "G30" }
 * Returns null when no known brand is mentioned at the start of the text.
 */
export function extractBrandFromText(text: string): { brand: string; model: string } | null {
  const cleaned = (text || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();

  for (const alias of SORTED_ALIASES) {
    // The brand has to start the string and end on a boundary, so "moto" still
    // matches "MOTO G30" but never matches the middle of another word.
    if (!lower.startsWith(alias)) continue;
    const nextChar = cleaned.charAt(alias.length);
    if (nextChar && /[a-z0-9]/i.test(nextChar)) continue;

    return {
      brand: BRAND_ALIASES[alias],
      model: cleaned.slice(alias.length).trim().replace(/^[-/,]+/, "").trim(),
    };
  }

  return null;
}

/** True when the value is the legacy placeholder rather than a real brand. */
export function isPlaceholderBrand(brand: string | null | undefined): boolean {
  const value = (brand || "").trim().toLowerCase();
  return value === "" || value === "other" || value === "others" || value === "n/a";
}

