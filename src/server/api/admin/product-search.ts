import { Request, Response } from 'express'
// import { OpenRouter } from "@openrouter/sdk" <-- Removed to avoid CJS/ESM clash

interface ProductSearchResult {
    name: string
    brand: string
    category: string
    description: string
    price: number | null
    images: string[]
    specs: Record<string, string>
    variants: {
        storage: Array<{ value: string; price_adjustment: number; stock: number }>
        ram: Array<{ value: string; price_adjustment: number; stock: number }>
        color: Array<{ value: string; hex?: string; stock: number }>
    }
    source: string
}

// Brand → category slug mapping
const BRAND_CATEGORY_MAP: Record<string, string> = {
    apple: 'mobile-phones',
    samsung: 'mobile-phones',
    oneplus: 'mobile-phones',
    xiaomi: 'mobile-phones',
    oppo: 'mobile-phones',
    vivo: 'mobile-phones',
    realme: 'mobile-phones',
    huawei: 'mobile-phones',
    nokia: 'mobile-phones',
    motorola: 'mobile-phones',
    google: 'mobile-phones',
    sony: 'mobile-phones',
    lg: 'mobile-phones',
    asus: 'mobile-phones',
    nothing: 'mobile-phones',
    poco: 'mobile-phones',
    infinix: 'mobile-phones',
    tecno: 'mobile-phones',
    itel: 'mobile-phones',
}

// Common color hex codes
const COLOR_HEX_MAP: Record<string, string> = {
    black: '#1a1a1a',
    white: '#ffffff',
    silver: '#c0c0c0',
    gold: '#ffd700',
    blue: '#007aff',
    red: '#ff3b30',
    green: '#34c759',
    purple: '#af52de',
    pink: '#ff2d55',
    yellow: '#ffcc00',
    orange: '#ff9500',
    gray: '#8e8e93',
    grey: '#8e8e93',
    titanium: '#8e8e93',
    graphite: '#3a3a3c',
    midnight: '#1c1c1e',
    starlight: '#f5f5f0',
    'space gray': '#3a3a3c',
    'space black': '#1a1a1a',
    'deep purple': '#af52de',
    'sierra blue': '#5e8fb5',
    'alpine green': '#4a7c59',
    'pacific blue': '#2e6b9e',
    'phantom black': '#1a1a1a',
    'phantom white': '#f5f5f5',
    'emerald green': '#2ecc71',
    'mystic bronze': '#cd7f32',
    'mystic black': '#1a1a1a',
    'cloud white': '#f0f0f0',
    'lavender': '#e6e6fa',
    'cream': '#fffdd0',
    'sage': '#bcb88a',
    'coral': '#ff7f50',
    'teal': '#008080',
    'cyan': '#00bcd4',
    'indigo': '#3f51b5',
    'violet': '#8b00ff',
    'bronze': '#cd7f32',
    'rose': '#ff007f',
    'peach': '#ffcba4',
    'mint': '#98ff98',
}

function getColorHex(colorName: string): string {
    const lower = colorName.toLowerCase()
    for (const [key, hex] of Object.entries(COLOR_HEX_MAP)) {
        if (lower.includes(key)) return hex
    }
    return '#888888'
}

function detectBrandFromName(modelName: string): string {
    const lower = modelName.toLowerCase()
    const brands = [
        'apple', 'iphone', 'samsung', 'galaxy', 'oneplus', 'xiaomi', 'redmi', 'poco',
        'oppo', 'vivo', 'realme', 'huawei', 'honor', 'nokia', 'motorola', 'moto',
        'google', 'pixel', 'sony', 'xperia', 'lg', 'asus', 'zenfone', 'nothing',
        'infinix', 'tecno', 'itel',
    ]
    for (const brand of brands) {
        if (lower.includes(brand)) {
            if (brand === 'iphone') return 'Apple'
            if (brand === 'galaxy') return 'Samsung'
            if (brand === 'redmi' || brand === 'poco') return 'Xiaomi'
            if (brand === 'moto') return 'Motorola'
            if (brand === 'pixel') return 'Google'
            if (brand === 'xperia') return 'Sony'
            if (brand === 'zenfone') return 'Asus'
            return brand.charAt(0).toUpperCase() + brand.slice(1)
        }
    }
    return ''
}

function getCategoryForBrand(brand: string): string {
    return BRAND_CATEGORY_MAP[brand.toLowerCase()] || 'mobile-phones'
}

// Parse storage strings like "128GB", "256 GB", "1TB"
function parseStorage(text: string): string[] {
    const storageRegex = /\b(\d+)\s*(GB|TB|MB)\b/gi
    const matches = new Set<string>()
    let match
    while ((match = storageRegex.exec(text)) !== null) {
        const num = parseInt(match[1])
        const unit = match[2].toUpperCase()
        // Filter out RAM-like values (typically ≤ 24GB for RAM)
        if (unit === 'GB' && num <= 24) continue
        matches.add(`${num}${unit}`)
    }
    return Array.from(matches).sort((a, b) => {
        const aNum = parseInt(a) * (a.includes('TB') ? 1024 : 1)
        const bNum = parseInt(b) * (b.includes('TB') ? 1024 : 1)
        return aNum - bNum
    })
}

// Parse RAM strings like "8GB RAM", "12 GB"
function parseRAM(text: string): string[] {
    const ramRegex = /\b(\d+)\s*GB\s*(?:RAM|LPDDR\d*|memory)?/gi
    const matches = new Set<string>()
    let match
    while ((match = ramRegex.exec(text)) !== null) {
        const num = parseInt(match[1])
        if (num >= 2 && num <= 24) { // RAM is typically 2-24GB
            matches.add(`${num}GB`)
        }
    }
    return Array.from(matches).sort((a, b) => parseInt(a) - parseInt(b))
}

async function searchGSMArena(modelName: string): Promise<ProductSearchResult | null> {
    try {
        const searchQuery = encodeURIComponent(modelName.replace(/\s+/g, '+'))
        const searchUrl = `https://www.gsmarena.com/search.php3?sQuickSearch=1&fDisplayX=1&sOSes=&chk5G=&chk4G=&chkNFC=&chkBluetooth=&chkWifi=&chkGPS=&chkSdcard=&chkRemovable=&chkDualSim=&chkFrontCam=&chkBackCam=&chkFingerprint=&chkFaceId=&chkUSBC=&chkHeadphone=&chkWirelessCharge=&chkFastCharge=&chkStereoSpeakers=&chkWaterResistant=&chkFoldable=&sAvailabilities=&sMakers=&sOSes=&fDisplayX=1&sQuickSearch=1&fDisplayX=1&sQuickSearch=${searchQuery}`

        // Use the simple quick search
        const quickUrl = `https://www.gsmarena.com/search.php3?sQuickSearch=1&fDisplayX=1&sQuickSearch=${searchQuery}`

        const response = await fetch(quickUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
            },
            signal: AbortSignal.timeout(10000),
        })

        if (!response.ok) {
            console.warn(`[GSMArena] Search failed: ${response.status}`)
            return null
        }

        const html = await response.text()

        // Scope search to the results container to avoid sidebar links
        const makersMatch = html.match(/<div class="makers">([\s\S]*?)<\/div>/i)
        const searchScope = makersMatch ? makersMatch[1] : html

        // Extract first search result link
        const linkMatch = searchScope.match(/href="([^"]+\.php)"/i)

        // Try to find device links in search results
        const deviceLinkRegex = /href="([\w-]+-\d+\.php)"/g
        const deviceLinks: string[] = []
        let dlMatch
        while ((dlMatch = deviceLinkRegex.exec(searchScope)) !== null) {
            if (!deviceLinks.includes(dlMatch[1])) {
                deviceLinks.push(dlMatch[1])
            }
        }

        // Filter out category links if any slipped through (e.g. samsung-phones-9.php)
        const validLinks = deviceLinks.filter(link => !link.includes('phones-') && !link.includes('tablet-') && !link.includes('watch-'))

        if (validLinks.length === 0) {
            console.warn('[GSMArena] No valid device links found in search results')
            return null
        }

        // Fetch the first device page
        const deviceUrl = `https://www.gsmarena.com/${validLinks[0]}`
        console.log(`[GSMArena] Fetching device page: ${deviceUrl}`)

        const deviceResponse = await fetch(deviceUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.gsmarena.com/',
            },
            signal: AbortSignal.timeout(10000),
        })

        if (!deviceResponse.ok) {
            console.warn(`[GSMArena] Device page failed: ${deviceResponse.status}`)
            return null
        }

        const deviceHtml = await deviceResponse.text()
        return parseGSMArenaPage(deviceHtml, modelName)
    } catch (error: any) {
        console.error('[GSMArena] Error:', error.message)
        return null
    }
}

function parseGSMArenaPage(html: string, modelName: string): ProductSearchResult | null {
    try {
        // Extract device name
        const nameMatch = html.match(/<h1[^>]*class="[^"]*specs-phone-name[^"]*"[^>]*>([^<]+)<\/h1>/i)
            || html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
        const deviceName = nameMatch ? nameMatch[1].trim() : modelName

        // Extract brand from page
        const brandMatch = html.match(/itemprop="brand"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/i)
            || html.match(/class="[^"]*brand[^"]*"[^>]*>([^<]+)</i)
        const brand = brandMatch ? brandMatch[1].trim() : detectBrandFromName(modelName)

        // Extract main image
        const images: string[] = []
        const imgMatch = html.match(/id="main-slider"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i)
            || html.match(/class="[^"]*specs-photo[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i)
            || html.match(/<img[^>]+src="(https:\/\/fdn2\.gsmarena\.com\/vv\/bigpic\/[^"]+)"/i)

        if (imgMatch) images.push(imgMatch[1])

        // Extract all product images
        const allImgRegex = /src="(https:\/\/fdn(?:2)?\.gsmarena\.com\/vv\/bigpic\/[^"]+)"/g
        let imgM
        while ((imgM = allImgRegex.exec(html)) !== null) {
            if (!images.includes(imgM[1])) images.push(imgM[1])
        }

        // Extract specs table
        const specs: Record<string, string> = {}
        const specRowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*class="[^"]*ttl[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/td>[\s\S]*?<td[^>]*class="[^"]*nfo[^"]*"[^>]*>([\s\S]*?)<\/td>/gi
        let specMatch
        while ((specMatch = specRowRegex.exec(html)) !== null) {
            const key = specMatch[1].trim().toLowerCase().replace(/\s+/g, '_')
            const value = specMatch[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            if (key && value && value.length < 500) {
                specs[key] = value
            }
        }

        // Extract storage options from specs
        const storageText = specs['internal'] || specs['storage'] || ''
        let storageOptions = parseStorage(storageText)

        // Extract RAM from specs
        const ramText = specs['internal'] || specs['ram'] || ''
        let ramOptions = parseRAM(ramText)

        // Extract colors
        const colorText = specs['colors'] || specs['color'] || ''
        const colorOptions: Array<{ value: string; hex?: string; stock: number }> = []

        if (colorText) {
            // Colors are usually comma-separated
            const colorNames = colorText.split(/[,;]/).map(c => c.trim()).filter(c => c.length > 0 && c.length < 50)
            colorNames.forEach(colorName => {
                if (colorName && !colorName.includes('more')) {
                    colorOptions.push({
                        value: colorName,
                        hex: getColorHex(colorName),
                        stock: 0,
                    })
                }
            })
        }

        // Extract description/highlights
        const descMatch = html.match(/class="[^"]*article-info[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
            || html.match(/class="[^"]*tagline[^"]*"[^>]*>([^<]+)</i)

        let description = ''
        if (descMatch) {
            description = descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500)
        }

        // Build description from key specs if no article found
        if (!description && Object.keys(specs).length > 0) {
            const highlights = []
            if (specs['display']) highlights.push(`Display: ${specs['display'].substring(0, 100)}`)
            if (specs['chipset']) highlights.push(`Chipset: ${specs['chipset'].substring(0, 80)}`)
            if (specs['main_camera'] || specs['camera']) highlights.push(`Camera: ${(specs['main_camera'] || specs['camera']).substring(0, 80)}`)
            if (specs['battery']) highlights.push(`Battery: ${specs['battery'].substring(0, 80)}`)
            description = highlights.join(' | ')
        }

        // Detect category
        const category = getCategoryForBrand(brand)

        // If no storage found, use defaults based on brand
        if (storageOptions.length === 0) {
            const lowerBrand = brand.toLowerCase()
            if (lowerBrand === 'apple') {
                storageOptions = ['128GB', '256GB', '512GB', '1TB']
            } else {
                storageOptions = ['128GB', '256GB', '512GB']
            }
        }

        // If no RAM found and not Apple, use defaults
        if (ramOptions.length === 0 && brand.toLowerCase() !== 'apple') {
            ramOptions = ['8GB', '12GB']
        }

        // If no colors found, use defaults
        if (colorOptions.length === 0) {
            colorOptions.push(
                { value: 'Black', hex: '#1a1a1a', stock: 0 },
                { value: 'White', hex: '#ffffff', stock: 0 },
            )
        }

        return {
            name: deviceName,
            brand,
            category,
            description,
            price: null, // GSMArena doesn't have prices
            images: images.slice(0, 6), // Max 6 images
            specs: {
                display: specs['display'] || '',
                chipset: specs['chipset'] || specs['processor'] || '',
                battery: specs['battery'] || '',
                camera: specs['main_camera'] || specs['camera'] || '',
                os: specs['os'] || '',
                network: specs['network'] || specs['technology'] || '',
                dimensions: specs['dimensions'] || specs['body'] || '',
                weight: specs['weight'] || '',
            },
            variants: {
                storage: storageOptions.map(s => ({ value: s, price_adjustment: 0, stock: 0 })),
                ram: ramOptions.map(r => ({ value: r, price_adjustment: 0, stock: 0 })),
                color: colorOptions,
            },
            source: 'gsmarena',
        }
    } catch (error: any) {
        console.error('[GSMArena] Parse error:', error.message)
        return null
    }
}

async function searchDuckDuckGo(modelName: string): Promise<Partial<ProductSearchResult> | null> {
    try {
        const query = encodeURIComponent(`${modelName} smartphone specifications`)
        const url = `https://api.duckduckgo.com/?q=${query}&format=json&no_redirect=1&no_html=1&skip_disambig=1`

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; IMobileBot/1.0)',
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(8000),
        })

        if (!response.ok) return null

        const data: any = await response.json()

        const result: Partial<ProductSearchResult> = {}

        // Extract abstract/description
        if (data.Abstract && data.Abstract.length > 20) {
            result.description = data.Abstract.substring(0, 600)
        }

        // Extract image
        if (data.Image && data.Image.startsWith('http')) {
            result.images = [data.Image]
        }

        // Try to detect brand from heading
        if (data.Heading) {
            const brand = detectBrandFromName(data.Heading)
            if (brand) result.brand = brand
        }

        return Object.keys(result).length > 0 ? result : null
    } catch (error: any) {
        console.error('[DuckDuckGo] Error:', error.message)
        return null
    }
}

// Fallback: build from known device database (extended)
function getKnownDeviceData(modelName: string): ProductSearchResult | null {
    const lower = modelName.toLowerCase().trim()

    // Extended device database
    const DEVICES: Record<string, Partial<ProductSearchResult>> = {
        'iphone 16 pro max': {
            brand: 'Apple', category: 'mobile-phones',
            description: 'Apple iPhone 16 Pro Max with A18 Pro chip, 6.9-inch Super Retina XDR display, 48MP camera system, and titanium design.',
            images: ['https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-16-pro-max.jpg'],
            variants: {
                storage: [{ value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }, { value: '1TB', price_adjustment: 0, stock: 0 }],
                ram: [],
                color: [{ value: 'Black Titanium', hex: '#1a1a1a', stock: 0 }, { value: 'White Titanium', hex: '#f5f5f0', stock: 0 }, { value: 'Natural Titanium', hex: '#8e8e93', stock: 0 }, { value: 'Desert Titanium', hex: '#c9a96e', stock: 0 }],
            },
            specs: { display: '6.9-inch Super Retina XDR OLED', chipset: 'Apple A18 Pro', camera: '48MP Main + 48MP Ultra Wide + 12MP Telephoto', battery: '4685 mAh', os: 'iOS 18' },
        },
        'iphone 16 pro': {
            brand: 'Apple', category: 'mobile-phones',
            description: 'Apple iPhone 16 Pro with A18 Pro chip, 6.3-inch Super Retina XDR display, and advanced camera system.',
            images: ['https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-16-pro.jpg'],
            variants: {
                storage: [{ value: '128GB', price_adjustment: 0, stock: 0 }, { value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }, { value: '1TB', price_adjustment: 0, stock: 0 }],
                ram: [],
                color: [{ value: 'Black Titanium', hex: '#1a1a1a', stock: 0 }, { value: 'White Titanium', hex: '#f5f5f0', stock: 0 }, { value: 'Natural Titanium', hex: '#8e8e93', stock: 0 }, { value: 'Desert Titanium', hex: '#c9a96e', stock: 0 }],
            },
            specs: { display: '6.3-inch Super Retina XDR OLED', chipset: 'Apple A18 Pro', camera: '48MP Main + 48MP Ultra Wide + 12MP Telephoto', battery: '3582 mAh', os: 'iOS 18' },
        },
        'iphone 16': {
            brand: 'Apple', category: 'mobile-phones',
            description: 'Apple iPhone 16 with A18 chip, 6.1-inch Super Retina XDR display, and improved camera system.',
            images: ['https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-16.jpg'],
            variants: {
                storage: [{ value: '128GB', price_adjustment: 0, stock: 0 }, { value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }],
                ram: [],
                color: [{ value: 'Black', hex: '#1a1a1a', stock: 0 }, { value: 'White', hex: '#ffffff', stock: 0 }, { value: 'Pink', hex: '#ff9eb5', stock: 0 }, { value: 'Teal', hex: '#008080', stock: 0 }, { value: 'Ultramarine', hex: '#3f51b5', stock: 0 }],
            },
            specs: { display: '6.1-inch Super Retina XDR OLED', chipset: 'Apple A18', camera: '48MP Main + 12MP Ultra Wide', battery: '3561 mAh', os: 'iOS 18' },
        },
        'iphone 15 pro max': {
            brand: 'Apple', category: 'mobile-phones',
            description: 'Apple iPhone 15 Pro Max with A17 Pro chip, 6.7-inch ProMotion display, titanium design, and USB-C.',
            images: ['https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-15-pro-max.jpg'],
            variants: {
                storage: [{ value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }, { value: '1TB', price_adjustment: 0, stock: 0 }],
                ram: [],
                color: [{ value: 'Natural Titanium', hex: '#8e8e93', stock: 0 }, { value: 'Blue Titanium', hex: '#4a7c9e', stock: 0 }, { value: 'White Titanium', hex: '#f5f5f0', stock: 0 }, { value: 'Black Titanium', hex: '#1a1a1a', stock: 0 }],
            },
            specs: { display: '6.7-inch Super Retina XDR ProMotion OLED', chipset: 'Apple A17 Pro', camera: '48MP Main + 12MP Ultra Wide + 12MP 5x Telephoto', battery: '4422 mAh', os: 'iOS 17' },
        },
        'iphone 15 pro': {
            brand: 'Apple', category: 'mobile-phones',
            description: 'Apple iPhone 15 Pro with A17 Pro chip, 6.1-inch ProMotion display, and titanium frame.',
            variants: {
                storage: [{ value: '128GB', price_adjustment: 0, stock: 0 }, { value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }, { value: '1TB', price_adjustment: 0, stock: 0 }],
                ram: [],
                color: [{ value: 'Natural Titanium', hex: '#8e8e93', stock: 0 }, { value: 'Blue Titanium', hex: '#4a7c9e', stock: 0 }, { value: 'White Titanium', hex: '#f5f5f0', stock: 0 }, { value: 'Black Titanium', hex: '#1a1a1a', stock: 0 }],
            },
            specs: { display: '6.1-inch Super Retina XDR ProMotion OLED', chipset: 'Apple A17 Pro', camera: '48MP Main + 12MP Ultra Wide + 12MP 3x Telephoto', battery: '3274 mAh', os: 'iOS 17' },
        },
        'iphone 15': {
            brand: 'Apple', category: 'mobile-phones',
            description: 'Apple iPhone 15 with A16 Bionic chip, 6.1-inch Super Retina XDR display, and Dynamic Island.',
            variants: {
                storage: [{ value: '128GB', price_adjustment: 0, stock: 0 }, { value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }],
                ram: [],
                color: [{ value: 'Black', hex: '#1a1a1a', stock: 0 }, { value: 'Blue', hex: '#007aff', stock: 0 }, { value: 'Green', hex: '#34c759', stock: 0 }, { value: 'Yellow', hex: '#ffcc00', stock: 0 }, { value: 'Pink', hex: '#ff2d55', stock: 0 }],
            },
            specs: { display: '6.1-inch Super Retina XDR OLED', chipset: 'Apple A16 Bionic', camera: '48MP Main + 12MP Ultra Wide', battery: '3349 mAh', os: 'iOS 17' },
        },
        'samsung galaxy s25 ultra': {
            brand: 'Samsung', category: 'mobile-phones',
            description: 'Samsung Galaxy S25 Ultra with Snapdragon 8 Elite, 6.9-inch QHD+ display, 200MP camera, and built-in S Pen.',
            variants: {
                storage: [{ value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }, { value: '1TB', price_adjustment: 0, stock: 0 }],
                ram: [{ value: '12GB', price_adjustment: 0, stock: 0 }],
                color: [{ value: 'Titanium Black', hex: '#1a1a1a', stock: 0 }, { value: 'Titanium Silver', hex: '#c0c0c0', stock: 0 }, { value: 'Titanium Whitesilver', hex: '#f5f5f0', stock: 0 }, { value: 'Titanium Pinkgold', hex: '#e8b4b8', stock: 0 }],
            },
            specs: { display: '6.9-inch QHD+ Dynamic AMOLED 2X 120Hz', chipset: 'Snapdragon 8 Elite', camera: '200MP Main + 50MP Ultra Wide + 10MP + 50MP Telephoto', battery: '5000 mAh', os: 'Android 15, One UI 7' },
        },
        'samsung galaxy s25+': {
            brand: 'Samsung', category: 'mobile-phones',
            description: 'Samsung Galaxy S25+ with Snapdragon 8 Elite, 6.7-inch QHD+ display, and triple camera system.',
            variants: {
                storage: [{ value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }],
                ram: [{ value: '12GB', price_adjustment: 0, stock: 0 }],
                color: [{ value: 'Icy Blue', hex: '#b0d4e8', stock: 0 }, { value: 'Mint', hex: '#98ff98', stock: 0 }, { value: 'Navy', hex: '#001f5b', stock: 0 }, { value: 'Silver Shadow', hex: '#c0c0c0', stock: 0 }],
            },
            specs: { display: '6.7-inch QHD+ Dynamic AMOLED 2X 120Hz', chipset: 'Snapdragon 8 Elite', camera: '50MP Main + 12MP Ultra Wide + 10MP Telephoto', battery: '4900 mAh', os: 'Android 15, One UI 7' },
        },
        'samsung galaxy s25': {
            brand: 'Samsung', category: 'mobile-phones',
            description: 'Samsung Galaxy S25 with Snapdragon 8 Elite, 6.2-inch FHD+ display, and advanced AI features.',
            variants: {
                storage: [{ value: '128GB', price_adjustment: 0, stock: 0 }, { value: '256GB', price_adjustment: 0, stock: 0 }],
                ram: [{ value: '12GB', price_adjustment: 0, stock: 0 }],
                color: [{ value: 'Icy Blue', hex: '#b0d4e8', stock: 0 }, { value: 'Mint', hex: '#98ff98', stock: 0 }, { value: 'Navy', hex: '#001f5b', stock: 0 }, { value: 'Silver Shadow', hex: '#c0c0c0', stock: 0 }],
            },
            specs: { display: '6.2-inch FHD+ Dynamic AMOLED 2X 120Hz', chipset: 'Snapdragon 8 Elite', camera: '50MP Main + 12MP Ultra Wide + 10MP Telephoto', battery: '4000 mAh', os: 'Android 15, One UI 7' },
        },
        'samsung galaxy s24 ultra': {
            brand: 'Samsung', category: 'mobile-phones',
            description: 'Samsung Galaxy S24 Ultra with Snapdragon 8 Gen 3, 6.8-inch QHD+ display, 200MP camera, and S Pen.',
            variants: {
                storage: [{ value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }, { value: '1TB', price_adjustment: 0, stock: 0 }],
                ram: [{ value: '12GB', price_adjustment: 0, stock: 0 }],
                color: [{ value: 'Titanium Black', hex: '#1a1a1a', stock: 0 }, { value: 'Titanium Gray', hex: '#8e8e93', stock: 0 }, { value: 'Titanium Violet', hex: '#af52de', stock: 0 }, { value: 'Titanium Yellow', hex: '#ffcc00', stock: 0 }],
            },
            specs: { display: '6.8-inch QHD+ Dynamic AMOLED 2X 120Hz', chipset: 'Snapdragon 8 Gen 3', camera: '200MP Main + 12MP Ultra Wide + 10MP + 50MP Telephoto', battery: '5000 mAh', os: 'Android 14, One UI 6.1' },
        },
        'samsung galaxy s24+': {
            brand: 'Samsung', category: 'mobile-phones',
            description: 'Samsung Galaxy S24+ with Snapdragon 8 Gen 3, 6.7-inch QHD+ display, and triple camera.',
            variants: {
                storage: [{ value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }],
                ram: [{ value: '12GB', price_adjustment: 0, stock: 0 }],
                color: [{ value: 'Cobalt Violet', hex: '#af52de', stock: 0 }, { value: 'Onyx Black', hex: '#1a1a1a', stock: 0 }, { value: 'Marble Gray', hex: '#8e8e93', stock: 0 }, { value: 'Amber Yellow', hex: '#ffcc00', stock: 0 }],
            },
            specs: { display: '6.7-inch QHD+ Dynamic AMOLED 2X 120Hz', chipset: 'Snapdragon 8 Gen 3', camera: '50MP Main + 12MP Ultra Wide + 10MP Telephoto', battery: '4900 mAh', os: 'Android 14, One UI 6.1' },
        },
        'samsung galaxy s24': {
            brand: 'Samsung', category: 'mobile-phones',
            description: 'Samsung Galaxy S24 with Snapdragon 8 Gen 3, 6.2-inch FHD+ display, and Galaxy AI features.',
            variants: {
                storage: [{ value: '128GB', price_adjustment: 0, stock: 0 }, { value: '256GB', price_adjustment: 0, stock: 0 }],
                ram: [{ value: '8GB', price_adjustment: 0, stock: 0 }],
                color: [{ value: 'Cobalt Violet', hex: '#af52de', stock: 0 }, { value: 'Onyx Black', hex: '#1a1a1a', stock: 0 }, { value: 'Marble Gray', hex: '#8e8e93', stock: 0 }, { value: 'Amber Yellow', hex: '#ffcc00', stock: 0 }],
            },
            specs: { display: '6.2-inch FHD+ Dynamic AMOLED 2X 120Hz', chipset: 'Snapdragon 8 Gen 3', camera: '50MP Main + 12MP Ultra Wide + 10MP Telephoto', battery: '4000 mAh', os: 'Android 14, One UI 6.1' },
        },
        'oneplus 13': {
            brand: 'OnePlus', category: 'mobile-phones',
            description: 'OnePlus 13 with Snapdragon 8 Elite, 6.82-inch 2K ProXDR display, Hasselblad camera, and 100W charging.',
            variants: {
                storage: [{ value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }],
                ram: [{ value: '12GB', price_adjustment: 0, stock: 0 }, { value: '16GB', price_adjustment: 0, stock: 0 }],
                color: [{ value: 'Midnight Ocean', hex: '#001f5b', stock: 0 }, { value: 'Arctic Dawn', hex: '#e8f4f8', stock: 0 }],
            },
            specs: { display: '6.82-inch 2K ProXDR AMOLED 120Hz', chipset: 'Snapdragon 8 Elite', camera: '50MP Main + 50MP Ultra Wide + 50MP Telephoto (Hasselblad)', battery: '6000 mAh', os: 'Android 15, OxygenOS 15' },
        },
        'oneplus 12': {
            brand: 'OnePlus', category: 'mobile-phones',
            description: 'OnePlus 12 with Snapdragon 8 Gen 3, 6.82-inch 2K ProXDR display, Hasselblad camera, and 100W charging.',
            variants: {
                storage: [{ value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }],
                ram: [{ value: '12GB', price_adjustment: 0, stock: 0 }, { value: '16GB', price_adjustment: 0, stock: 0 }],
                color: [{ value: 'Silky Black', hex: '#1a1a1a', stock: 0 }, { value: 'Flowy Emerald', hex: '#2ecc71', stock: 0 }],
            },
            specs: { display: '6.82-inch 2K ProXDR AMOLED 120Hz', chipset: 'Snapdragon 8 Gen 3', camera: '50MP Main + 48MP Ultra Wide + 64MP Telephoto (Hasselblad)', battery: '5400 mAh', os: 'Android 14, OxygenOS 14' },
        },
        'oneplus 12r': {
            brand: 'OnePlus', category: 'mobile-phones',
            description: 'OnePlus 12R with Snapdragon 8 Gen 2, 6.78-inch AMOLED display, and 100W SUPERVOOC charging.',
            variants: {
                storage: [{ value: '128GB', price_adjustment: 0, stock: 0 }, { value: '256GB', price_adjustment: 0, stock: 0 }],
                ram: [{ value: '8GB', price_adjustment: 0, stock: 0 }, { value: '16GB', price_adjustment: 0, stock: 0 }],
                color: [{ value: 'Iron Gray', hex: '#4a4a4a', stock: 0 }, { value: 'Cool Blue', hex: '#007aff', stock: 0 }],
            },
            specs: { display: '6.78-inch FHD+ AMOLED 120Hz', chipset: 'Snapdragon 8 Gen 2', camera: '50MP Main + 8MP Ultra Wide + 2MP Macro', battery: '5500 mAh', os: 'Android 14, OxygenOS 14' },
        },
        'oneplus 15r': {
            brand: 'OnePlus', category: 'mobile-phones',
            description: 'OnePlus 15R with Snapdragon 8 Gen 3, 6.78-inch AMOLED display, and 80W SUPERVOOC charging.',
            variants: {
                storage: [{ value: '128GB', price_adjustment: 0, stock: 0 }, { value: '256GB', price_adjustment: 0, stock: 0 }],
                ram: [{ value: '8GB', price_adjustment: 0, stock: 0 }, { value: '12GB', price_adjustment: 0, stock: 0 }],
                color: [{ value: 'Astral Black', hex: '#1a1a1a', stock: 0 }, { value: 'Glacier Blue', hex: '#4a9eca', stock: 0 }],
            },
            specs: { display: '6.78-inch FHD+ AMOLED 120Hz', chipset: 'Snapdragon 8 Gen 3', camera: '50MP Main + 8MP Ultra Wide + 2MP Macro', battery: '6000 mAh', os: 'Android 15, OxygenOS 15' },
        },
        'oneplus 11': {
            brand: 'OnePlus', category: 'mobile-phones',
            description: 'OnePlus 11 with Snapdragon 8 Gen 2, 6.7-inch 2K AMOLED display, and Hasselblad triple camera.',
            variants: {
                storage: [{ value: '128GB', price_adjustment: 0, stock: 0 }, { value: '256GB', price_adjustment: 0, stock: 0 }],
                ram: [{ value: '8GB', price_adjustment: 0, stock: 0 }, { value: '16GB', price_adjustment: 0, stock: 0 }],
                color: [{ value: 'Titan Black', hex: '#1a1a1a', stock: 0 }, { value: 'Eternal Green', hex: '#2ecc71', stock: 0 }],
            },
            specs: { display: '6.7-inch 2K AMOLED 120Hz', chipset: 'Snapdragon 8 Gen 2', camera: '50MP Main + 48MP Ultra Wide + 32MP Telephoto (Hasselblad)', battery: '5000 mAh', os: 'Android 13, OxygenOS 13' },
        },
        'google pixel 9 pro xl': {
            brand: 'Google', category: 'mobile-phones',
            description: 'Google Pixel 9 Pro XL with Google Tensor G4, 6.8-inch LTPO OLED display, and advanced AI camera.',
            variants: {
                storage: [{ value: '128GB', price_adjustment: 0, stock: 0 }, { value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }, { value: '1TB', price_adjustment: 0, stock: 0 }],
                ram: [{ value: '16GB', price_adjustment: 0, stock: 0 }],
                color: [{ value: 'Obsidian', hex: '#1a1a1a', stock: 0 }, { value: 'Porcelain', hex: '#f5f0e8', stock: 0 }, { value: 'Hazel', hex: '#8b7355', stock: 0 }, { value: 'Rose Quartz', hex: '#f4c2c2', stock: 0 }],
            },
            specs: { display: '6.8-inch LTPO OLED 120Hz', chipset: 'Google Tensor G4', camera: '50MP Main + 48MP Ultra Wide + 48MP Telephoto', battery: '5060 mAh', os: 'Android 14' },
        },
        'xiaomi 14 ultra': {
            brand: 'Xiaomi', category: 'mobile-phones',
            description: 'Xiaomi 14 Ultra with Snapdragon 8 Gen 3, 6.73-inch LTPO AMOLED display, and Leica quad camera.',
            variants: {
                storage: [{ value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }, { value: '1TB', price_adjustment: 0, stock: 0 }],
                ram: [{ value: '12GB', price_adjustment: 0, stock: 0 }, { value: '16GB', price_adjustment: 0, stock: 0 }],
                color: [{ value: 'Black', hex: '#1a1a1a', stock: 0 }, { value: 'White', hex: '#ffffff', stock: 0 }],
            },
            specs: { display: '6.73-inch LTPO AMOLED 120Hz', chipset: 'Snapdragon 8 Gen 3', camera: '50MP Main + 50MP Ultra Wide + 50MP Telephoto + 50MP Periscope (Leica)', battery: '5000 mAh', os: 'Android 14, HyperOS' },
        },
    }

    // Try exact match
    if (DEVICES[lower]) {
        const d = DEVICES[lower]
        return {
            name: modelName,
            brand: d.brand || detectBrandFromName(modelName),
            category: d.category || 'mobile-phones',
            description: d.description || '',
            price: null,
            images: d.images || [],
            specs: d.specs || { display: '', chipset: '', battery: '', camera: '', os: '', network: '', dimensions: '', weight: '' },
            variants: d.variants || { storage: [], ram: [], color: [] },
            source: 'database',
        }
    }

    // Try partial match
    for (const [key, d] of Object.entries(DEVICES)) {
        if (lower.includes(key) || key.includes(lower)) {
            return {
                name: modelName,
                brand: d.brand || detectBrandFromName(modelName),
                category: d.category || 'mobile-phones',
                description: d.description || '',
                price: null,
                images: d.images || [],
                specs: d.specs || { display: '', chipset: '', battery: '', camera: '', os: '', network: '', dimensions: '', weight: '' },
                variants: d.variants || { storage: [], ram: [], color: [] },
                source: 'database',
            }
        }
    }

    return null
}

async function searchOpenRouter(modelName: string): Promise<ProductSearchResult | null> {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim()
    if (!apiKey) {
        console.warn('[OpenRouter] API Key missing')
        return null
    }

    try {
        console.log(`[OpenRouter] Requesting AI details for: "${modelName}" (Using SDK with dynamic import)`)
        
        // Dynamic import to avoid ERR_REQUIRE_ESM in CJS environment
        const sdk = await (eval('import("@openrouter/sdk")') as Promise<any>);
        const OpenRouter = sdk.OpenRouter;
        const openrouter = new OpenRouter({ apiKey })

        const prompt = `
            Act as a professional product data specialist for a mobile phone and electronics store. 
            Your task is to provide detailed information for the following product model: "${modelName}".
            Return the data in the following JSON format ONLY, without any explanation or markdown code blocks:
            {
                "name": "Full professional product name",
                "brand": "Brand name",
                "category": "mobile-phones",
                "description": "Professional 2-3 sentence description highlighting key features",
                "specs": {
                    "display": "Display specs (size, type, resolution)",
                    "chipset": "Processor specs",
                    "battery": "Battery capacity and charging speed",
                    "camera": "Brief main camera specs",
                    "os": "Operating system at launch",
                    "network": "Network compatibility (5G/4G)",
                    "dimensions": "Product dimensions",
                    "weight": "Product weight"
                },
                "variants": {
                    "storage": [{"value": "128GB", "price_adjustment": 0, "stock": 0}, {"value": "256GB", "price_adjustment": 0, "stock": 0}, {"value": "512GB", "price_adjustment": 0, "stock": 0}],
                    "ram": [{"value": "8GB", "price_adjustment": 0, "stock": 0}, {"value": "12GB", "price_adjustment": 0, "stock": 0}],
                    "color": [{"value": "Black", "hex": "#1a1a1a", "stock": 0}]
                },
                "image_urls": ["high_quality_image_url_1", "high_quality_image_url_2"]
            }
            Important:
            1. Provide at least 3 storage variants for modern phones (128GB, 256GB, 512GB).
            2. For colors, provide the actual manufacturer color names and their best-matching hex codes.
            3. FOR APPLE PRODUCTS (iPhone), the RAM variant list should be EMPTY (variants.ram: []).
            4. **Crucial**: Try to provide 2-3 high-quality direct image URLs for this device. Use common CDN patterns if you are sure (like fdn2.gsmarena.com, etc.) or official manufacturer media links.
            5. If it's a newer model not in your training set to specific detail, use your best knowledge of trends.
        `

        const response = await openrouter.chat.send({
            chatGenerationParams: {
                model: "meta-llama/llama-3.3-70b-instruct:free",
                messages: [{ role: "user", content: prompt }],
            },
            httpReferer: "http://localhost:3000",
            xTitle: "IMobile Admin Panel"
        });

        console.log(`[OpenRouter] SDK Response:`, JSON.stringify(response).substring(0, 200))

        const responseText = (response as any).choices?.[0]?.message?.content;
        if (!responseText) {
            console.warn('[OpenRouter] No content in response');
            return null;
        }

        console.log(`[OpenRouter] Raw Response: ${responseText.substring(0, 100)}...`)
        
        // Try to parse JSON (AI might wrap it in markdown)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        const jsonStr = jsonMatch ? jsonMatch[0] : responseText
        
        try {
            const data = JSON.parse(jsonStr)
            return {
                name: data.name || modelName,
                brand: data.brand || detectBrandFromName(modelName),
                category: data.category || 'mobile-phones',
                description: data.description || '',
                price: null,
                images: Array.isArray(data.image_urls) ? data.image_urls : [],
                specs: data.specs || {},
                variants: {
                    storage: Array.isArray(data.variants?.storage) ? data.variants.storage : [],
                    ram: Array.isArray(data.variants?.ram) ? data.variants.ram : [],
                    color: Array.isArray(data.variants?.color) ? data.variants.color : [],
                },
                source: 'openrouter',
            }
        } catch (e: any) {
            console.error('[OpenRouter] JSON Parse Error:', e.message)
            return null
        }
    } catch (error: any) {
        console.error('[OpenRouter] Error:', error.message)
        return null
    }
}

export async function productSearchHandler(req: Request, res: Response) {
    try {
        const { modelName } = req.body

        if (!modelName || typeof modelName !== 'string' || modelName.trim().length < 2) {
            return res.status(400).json({ error: 'Model name is required (minimum 2 characters)' })
        }

        const trimmedModel = modelName.trim()
        console.log(`[ProductSearch] Searching for: "${trimmedModel}"`)

        let result: ProductSearchResult | null = null

        // Step 1: Try known device database first (instant)
        result = getKnownDeviceData(trimmedModel)
        if (result) {
            console.log(`[ProductSearch] Found in local database: ${result.name}`)
        }

        // Step 2: Try GSMArena scraping for real data (especially images)
        try {
            const gsmarenaResult = await searchGSMArena(trimmedModel)
            if (gsmarenaResult) {
                console.log(`[ProductSearch] GSMArena found: ${gsmarenaResult.name}`)
                if (result) {
                    // Merge: prefer GSMArena for images and description, keep local DB for variants if GSMArena has none
                    result = {
                        ...result,
                        name: gsmarenaResult.name || result.name,
                        description: gsmarenaResult.description || result.description,
                        images: gsmarenaResult.images.length > 0 ? gsmarenaResult.images : result.images,
                        specs: { ...result.specs, ...gsmarenaResult.specs },
                        variants: {
                            storage: gsmarenaResult.variants.storage.length > 0 ? gsmarenaResult.variants.storage : result.variants.storage,
                            ram: gsmarenaResult.variants.ram.length > 0 ? gsmarenaResult.variants.ram : result.variants.ram,
                            color: gsmarenaResult.variants.color.length > 0 ? gsmarenaResult.variants.color : result.variants.color,
                        },
                        source: 'gsmarena+database',
                    }
                } else {
                    result = gsmarenaResult
                }
            }
        } catch (e: any) {
            console.warn('[ProductSearch] GSMArena failed:', e.message)
        }

        // Step 3: Try DuckDuckGo for additional info
        if (!result || !result.description) {
            try {
                const ddgResult = await searchDuckDuckGo(trimmedModel)
                if (ddgResult) {
                    if (result) {
                        result.description = result.description || ddgResult.description || ''
                        if (ddgResult.images && ddgResult.images.length > 0 && result.images.length === 0) {
                            result.images = ddgResult.images
                        }
                    }
                }
            } catch (e: any) {
                console.warn('[ProductSearch] DuckDuckGo failed:', e.message)
            }
        }

        // Step 4: Use OpenRouter AI for professional details (Final enhancement)
        const currentSpecsCount = result?.specs ? Object.keys(result.specs).length : 0
        if (!result || !result.specs || currentSpecsCount < 3) {
            console.log(`[ProductSearch] Spec count (${currentSpecsCount}) low. Triggering AI enhancement...`)
            try {
                const aiResult = await searchOpenRouter(trimmedModel)
                if (aiResult) {
                    console.log(`[ProductSearch] AI found details for: ${aiResult.name}`)
                    if (result) {
                        // Merge: Keep GSMArena/DDG images, but use AI for everything else if it looks better
                        result = {
                            ...aiResult,
                            images: result.images.length > 0 ? result.images : aiResult.images,
                            source: `${result.source}+ai`,
                        }
                    } else {
                        result = aiResult
                    }
                }
            } catch (e: any) {
                console.error('[ProductSearch] AI enhancement failed:', e.message)
            }
        }

        // Step 4: If still nothing found, build a smart default based on brand detection
        if (!result) {
            const detectedBrand = detectBrandFromName(trimmedModel)
            const isApple = detectedBrand.toLowerCase() === 'apple'

            result = {
                name: trimmedModel,
                brand: detectedBrand,
                category: getCategoryForBrand(detectedBrand),
                description: detectedBrand ? `${detectedBrand} ${trimmedModel} smartphone` : `${trimmedModel} smartphone`,
                price: null,
                images: [],
                specs: {},
                variants: {
                    storage: isApple
                        ? [{ value: '128GB', price_adjustment: 0, stock: 0 }, { value: '256GB', price_adjustment: 0, stock: 0 }, { value: '512GB', price_adjustment: 0, stock: 0 }]
                        : [{ value: '128GB', price_adjustment: 0, stock: 0 }, { value: '256GB', price_adjustment: 0, stock: 0 }],
                    ram: isApple ? [] : [{ value: '8GB', price_adjustment: 0, stock: 0 }, { value: '12GB', price_adjustment: 0, stock: 0 }],
                    color: [{ value: 'Black', hex: '#1a1a1a', stock: 0 }, { value: 'White', hex: '#ffffff', stock: 0 }],
                },
                source: 'smart-default',
            }
        }

        console.log(`[ProductSearch] Returning result from source: ${result.source}`)
        return res.json({ success: true, data: result })

    } catch (error: any) {
        console.error('[ProductSearch] Error:', error)
        return res.status(500).json({ error: 'Failed to search for product information' })
    }
}
