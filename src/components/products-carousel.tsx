"use client"

import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Link } from "react-router-dom"

interface Category {
  id: string
  name: string
  displayName: string
  image?: string
  images?: string[]
  count: number
  link: string
}

const CATEGORIES: Category[] = [
  {
    id: "samsung-tabs",
    name: "Samsung Tabs",
    displayName: "SAMSUNG TABS",
    images: ["/samsung-galaxy-a54.png", "/samsung-galaxy-s24-ultra.png", "/samsung-galaxy-s24-ultra-2.jpg"],
    count: 50,
    link: "/shop?category=samsung-tabs",
  },
  {
    id: "mobile-phones",
    name: "Mobile Phones",
    displayName: "MOBILE PHONES",
    images: [
      "/iphone-15-pro-max.png",
      "/samsung-galaxy-s24-ultra.png",
      "/oneplus-12-smartphone.jpg",
      "/google-pixel-8-pro.png",
    ],
    count: 210,
    link: "/shop?category=mobile-phones",
  },
  {
    id: "apple-iphone",
    name: "Apple iPhone",
    displayName: "APPLE IPHONE",
    images: [
      "/iphone-15-pro-max.png",
      "/iphone-15-pro-max-2.jpg",
      "/iphone-14-pro-used.jpg",
      "/iphone-13-smartphone.png",
    ],
    count: 85,
    link: "/shop?brand=Apple",
  },
  {
    id: "samsung-phones",
    name: "Samsung Phones",
    displayName: "SAMSUNG",
    images: [
      "/samsung-galaxy-s24-ultra.png",
      "/samsung-galaxy-s24-ultra-2.jpg",
      "/samsung-galaxy-a54.png",
    ],
    count: 65,
    link: "/shop?brand=Samsung",
  },
  {
    id: "oneplus",
    name: "OnePlus",
    displayName: "ONEPLUS",
    images: [
      "/oneplus-12-smartphone.jpg",
      "/oneplus-12-2.jpg",
      "/oneplus-12-3.jpg",
    ],
    count: 25,
    link: "/shop?brand=OnePlus",
  },
  {
    id: "other-brands",
    name: "Other Brands",
    displayName: "OTHER BRANDS",
    images: [
      "/google-pixel-8-pro.png",
      "/oppo-find-x7-smartphone.jpg",
      "/vivo-x100-smartphone.jpg",
      "/xiaomi-14-ultra-smartphone.jpg",
    ],
    count: 45,
    link: "/shop",
  },
  {
    id: "accessories",
    name: "Accessories",
    displayName: "ACCESSORIES",
    image: "/placeholder.svg",
    count: 120,
    link: "/shop?category=accessories",
  },
  {
    id: "refurbished",
    name: "Refurbished",
    displayName: "REFURBISHED",
    images: ["/iphone-14-pro-used.jpg", "/iphone-13-smartphone.png"],
    count: 38,
    link: "/shop?condition=used",
  },
]

export default function ProductsCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const [autoSlideEnabled, setAutoSlideEnabled] = useState(true)
  const [cardWidth, setCardWidth] = useState<number>(150)

  const checkScrollability = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
      setCanScrollLeft(scrollLeft > 0)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
    }
  }

  // Calculate card width to show exactly 8 cards
  useEffect(() => {
    const calculateCardWidth = () => {
      if (scrollRef.current && scrollRef.current.clientWidth > 0) {
        const containerWidth = scrollRef.current.clientWidth
        const gap = 12 // gap-3 = 0.75rem = 12px
        const totalGaps = 7 * gap // 7 gaps between 8 cards
        const calculatedWidth = (containerWidth - totalGaps) / 8
        setCardWidth(Math.max(calculatedWidth, 110)) // Minimum 110px
      }
    }

    // Wait for next frame to ensure container is rendered
    requestAnimationFrame(() => {
      calculateCardWidth()
      // Also calculate after a small delay to ensure accurate measurements
      setTimeout(calculateCardWidth, 100)
    })

    window.addEventListener("resize", calculateCardWidth)
    return () => window.removeEventListener("resize", calculateCardWidth)
  }, [])

  useEffect(() => {
    checkScrollability()
    const scrollContainer = scrollRef.current
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", checkScrollability)
      window.addEventListener("resize", checkScrollability)
      return () => {
        scrollContainer.removeEventListener("scroll", checkScrollability)
        window.removeEventListener("resize", checkScrollability)
      }
    }
  }, [cardWidth])

  // Auto-slide functionality
  useEffect(() => {
    if (!autoSlideEnabled || !scrollRef.current) return

    const autoSlideInterval = setInterval(() => {
      if (scrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
        const maxScroll = scrollWidth - clientWidth
        
        // If we're at the end, scroll back to the start
        if (scrollLeft >= maxScroll - 10) {
          scrollRef.current.scrollTo({
            left: 0,
            behavior: "smooth",
          })
        } else {
          // Calculate scroll amount to show next card (1 card width + gap)
          const gap = 12 // 0.75rem = 12px
          const scrollAmount = cardWidth + gap
          
          scrollRef.current.scrollBy({
            left: scrollAmount,
            behavior: "smooth",
          })
        }
      }
    }, 4000) // Auto-slide every 4 seconds

    return () => clearInterval(autoSlideInterval)
  }, [autoSlideEnabled, cardWidth])

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      // Pause auto-slide when user manually scrolls
      setAutoSlideEnabled(false)
      setTimeout(() => setAutoSlideEnabled(true), 10000) // Resume after 10 seconds
      
      const gap = 12
      const scrollAmount = cardWidth + gap
      const newScrollLeft = scrollRef.current.scrollLeft + (direction === "left" ? -scrollAmount : scrollAmount)
      
      scrollRef.current.scrollTo({
        left: newScrollLeft,
        behavior: "smooth",
      })
      
      // Update scrollability after a short delay
      setTimeout(checkScrollability, 300)
    }
  }

  return (
    <section className="py-8 md:py-12 lg:py-16 bg-gray-100 dark:bg-gray-900">
      <div className="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8 md:mb-12"
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Shop by Category
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
            Discover our wide range of products
          </p>
        </motion.div>

        {/* Carousel Container */}
        <div className="relative">
          {/* Left Arrow */}
          {canScrollLeft && (
            <button
              onClick={() => scroll("left")}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center transition-all duration-300 hover:scale-110"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 dark:text-gray-300" />
            </button>
          )}

          {/* Scrollable Categories - Show 8 cards at once */}
          <div ref={containerRef} className="relative w-full overflow-hidden">
            <div
              ref={scrollRef}
              className="flex gap-3 overflow-x-auto scroll-smooth pb-4 scrollbar-hide"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                WebkitOverflowScrolling: "touch",
              }}
              onMouseEnter={() => setAutoSlideEnabled(false)}
              onMouseLeave={() => setAutoSlideEnabled(true)}
              onTouchStart={() => setAutoSlideEnabled(false)}
              onTouchEnd={() => {
                setTimeout(() => setAutoSlideEnabled(true), 5000)
              }}
            >
              {CATEGORIES.map((category, index) => (
                <motion.div
                  key={category.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  className="flex-shrink-0"
                  style={{
                    width: `${cardWidth}px`,
                    minWidth: "110px",
                  }}
                >
                <Link to={category.link}>
                  <div className="group cursor-pointer transform transition-transform duration-300 hover:scale-105">
                    {/* Circular White Card */}
                    <div className="relative w-full aspect-square rounded-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border-2 border-gray-200 dark:border-gray-700 group-hover:border-blue-300 dark:group-hover:border-blue-600">
                      {/* Category Images */}
                      <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4 md:p-6">
                        {category.images && category.images.length > 1 ? (
                          // Multiple images fanned out
                          <div className="relative w-full h-full flex items-center justify-center">
                            {category.images.slice(0, 4).map((img, idx) => {
                              const angle = -15 + idx * 10
                              const radius = 35
                              const xOffset = Math.sin((angle * Math.PI) / 180) * radius
                              const yOffset = -Math.cos((angle * Math.PI) / 180) * radius
                              
                              return (
                                <motion.div
                                  key={idx}
                                  initial={{ opacity: 0, scale: 0.7 }}
                                  whileInView={{ opacity: 1, scale: 1 }}
                                  viewport={{ once: true }}
                                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                                  className="absolute"
                                  style={{
                                    transform: `translate(${xOffset}px, ${yOffset}px) rotate(${angle}deg)`,
                                    zIndex: idx + 1,
                                  }}
                                  whileHover={{ scale: 1.1, zIndex: 10 }}
                                >
                                  <div className="relative w-12 h-18 sm:w-16 sm:h-24 md:w-20 md:h-28">
                                    <img
                                      src={img}
                                      alt={`${category.name} ${idx + 1}`}
                                      className="object-contain drop-shadow-lg w-full h-full"
                                    />
                                  </div>
                                </motion.div>
                              )
                            })}
                          </div>
                        ) : (
                          // Single image or placeholder
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5 }}
                            className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32"
                            whileHover={{ scale: 1.1 }}
                          >
                            <img
                              src={category.image || category.images?.[0] || "/placeholder.svg"}
                              alt={category.name}
                              className="object-contain drop-shadow-lg w-full h-full"
                            />
                          </motion.div>
                        )}
                      </div>
                    </div>

                    {/* Category Info */}
                    <div className="mt-2 sm:mt-3 text-center">
                      <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-0.5 sm:mb-1">
                        {category.displayName}
                      </h3>
                      <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400">
                        {category.count} products
                      </p>
                    </div>
                  </div>
                </Link>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Right Arrow */}
          {canScrollRight && (
            <button
              onClick={() => scroll("right")}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center transition-all duration-300 hover:scale-110"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 dark:text-gray-300" />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
