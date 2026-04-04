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
  "Asus": [
    "ROG Phone 8 Pro", "ROG Phone 8", "ROG Phone 7", "Zenfone 10", "Zenfone 9"
  ]
};

export const BRANDS = Object.keys(MODELS_BY_BRAND).sort();
