"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { Link } from "react-router-dom"
import { heroSlidesService, type HeroSlide } from "@/lib/supabase/services/hero-slides"
import { useRealtimeUpdates } from "@/hooks/use-realtime-updates"

export default function HeroSection() {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [slides, setSlides] = useState<HeroSlide[]>([])
  const [loading, setLoading] = useState(true)

  const loadSlides = async (silent: boolean = false) => {
    try {
      if (!silent) {
        setLoading(true)
      }
      console.log('[HeroSection] Loading slides...')
      const data = await heroSlidesService.getAll()
      console.log('[HeroSection] Slides loaded:', data?.length || 0)
      setSlides(data || [])
      
      // Reset to first slide if current slide is out of bounds
      if (data && data.length > 0 && currentSlide >= data.length) {
        setCurrentSlide(0)
      }
    } catch (error: any) {
      console.error('[HeroSection] Failed to load slides:', error)
      if (!silent) {
        // Show empty state or fallback
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    loadSlides()
  }, [])

  // Real-time updates
  useRealtimeUpdates(() => loadSlides(true))

  // Listen for custom events
  useEffect(() => {
    const handleUpdate = () => {
      console.log('[HeroSection] Hero slides update event received')
      loadSlides(true)
    }
    window.addEventListener('heroSlidesUpdated', handleUpdate)
    return () => window.removeEventListener('heroSlidesUpdated', handleUpdate)
  }, [])

  useEffect(() => {
    if (slides.length === 0) return

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length)
    }, 6000) // Auto-advance every 6 seconds

    return () => clearInterval(interval)
  }, [slides.length])

  const goToSlide = (index: number) => {
    setCurrentSlide(index)
  }

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length)
  }

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length)
  }

  const slideVariants = {
    enter: {
      opacity: 0,
      scale: 0.95,
    },
    center: {
      zIndex: 1,
      opacity: 1,
      scale: 1,
    },
    exit: {
      zIndex: 0,
      opacity: 0,
      scale: 1.05,
    },
  }

  if (loading) {
    return (
      <section className="relative w-full overflow-hidden bg-gray-100 dark:bg-gray-900 py-8 md:py-12 lg:py-16">
        <div className="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative w-full h-[450px] sm:h-[550px] md:h-[600px] lg:h-[650px] xl:h-[700px] rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </div>
        </div>
      </section>
    )
  }

  if (slides.length === 0) {
    return null // Don't show hero section if no slides
  }

  const currentSlideData = slides[currentSlide]
  const productLink = currentSlideData.product_id 
    ? `/product/${currentSlideData.product_id}` 
    : currentSlideData.products?.id 
      ? `/product/${currentSlideData.products.id}`
      : '/shop'

  return (
    <section className="relative w-full overflow-hidden bg-gray-100 dark:bg-gray-900 py-8 md:py-12 lg:py-16">
      <div className="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Slider Container */}
        <div className="relative w-full h-[450px] sm:h-[550px] md:h-[600px] lg:h-[650px] xl:h-[700px] rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={currentSlide}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                opacity: { duration: 0.5 },
                scale: { duration: 0.5 },
              }}
              className="absolute inset-0"
            >
              {/* Gradient Background - Dark to warm brown */}
              <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900 to-[#3a2818] dark:from-black dark:via-black dark:to-[#2a1810]" />
              
              {/* Content Container */}
              <div className="relative h-full flex items-center">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 w-full">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 items-center h-full">
                    {/* Left Content */}
                    <motion.div
                      initial={{ opacity: 0, x: -50 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                      className="space-y-3 sm:space-y-4 md:space-y-6 z-10 px-2 sm:px-0"
                    >
                      {/* Brand */}
                      <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="text-sm sm:text-base font-semibold text-gray-300 dark:text-gray-400 uppercase tracking-wider"
                      >
                        {currentSlideData.brand}
                      </motion.div>

                      {/* Title with Glow Effect */}
                      <motion.h1
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white animate-text-glow"
                      >
                        {currentSlideData.title}
                      </motion.h1>

                      {/* Subtitle with Glow Effect */}
                      {currentSlideData.subtitle && (
                        <motion.p
                          initial={{ opacity: 0, y: -20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.6, delay: 0.2 }}
                          className="text-lg sm:text-xl md:text-2xl lg:text-3xl text-white/90 font-medium"
                          style={{
                            textShadow: "0 0 15px rgba(255, 255, 255, 0.25), 0 0 30px rgba(255, 255, 255, 0.15)",
                          }}
                        >
                          {currentSlideData.subtitle}
                        </motion.p>
                      )}

                      {/* CTA Button */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="pt-4"
                      >
                        <Link
                          to={productLink}
                          className="inline-block px-6 sm:px-8 py-3 sm:py-4 bg-white text-gray-900 font-semibold rounded-full hover:bg-gray-100 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                        >
                          Shop Now
                        </Link>
                      </motion.div>
                    </motion.div>

                    {/* Right Image */}
                    <motion.div
                      initial={{ opacity: 0, x: 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.8, delay: 0.4 }}
                      className="relative h-full min-h-[250px] sm:min-h-[300px] md:min-h-[400px] lg:min-h-[500px] flex items-center justify-center lg:pr-4"
                    >
                      <div className="relative w-full h-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl">
                        {/* Main Product Image */}
                        <motion.div
                          animate={{ y: [0, -10, 0] }}
                          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                          className="relative w-full h-full"
                        >
                          <img
                            src={currentSlideData.image || "/placeholder.svg"}
                            alt={currentSlideData.title}
                            className="object-contain w-full h-full"
                          />
                        </motion.div>

                        {/* Secondary Product Image (if available) */}
                        {currentSlideData.image2 && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.6, delay: 0.6 }}
                            className="absolute -right-4 sm:-right-8 md:-right-12 top-1/4 w-32 sm:w-40 md:w-48 h-auto z-10"
                          >
                            <img
                              src={currentSlideData.image2}
                              alt={`${currentSlideData.title} secondary`}
                              width={200}
                              height={400}
                              className="object-contain opacity-90"
                            />
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation Arrows */}
          {slides.length > 1 && (
            <>
              <button
                onClick={prevSlide}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 flex items-center justify-center transition-all duration-300 hover:scale-110"
                aria-label="Previous slide"
              >
                <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </button>

              <button
                onClick={nextSlide}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 backdrop-blur-sm border border-white/20 flex items-center justify-center transition-all duration-300 hover:scale-110"
                aria-label="Next slide"
              >
                <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </button>
            </>
          )}

          {/* Slide Indicators */}
          {slides.length > 1 && (
            <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    index === currentSlide
                      ? "w-8 bg-white"
                      : "w-2 bg-white/40 hover:bg-white/60"
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
