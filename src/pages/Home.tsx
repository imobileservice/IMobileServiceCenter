import { useState, memo, useCallback, useEffect } from "react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { ArrowRight, Zap, Shield, Truck, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { lazy, Suspense } from "react"
import { productsService } from "@/lib/supabase/services/products"
import { useRealtimeUpdates } from "@/hooks/use-realtime-updates"
import type { Database } from "@/lib/supabase/types"

type Product = Database["public"]["Tables"]["products"]["Row"]

// Lazy load heavy components
const ProductCard = lazy(() => import("@/components/product-card"))
const HeroSection = lazy(() => import("@/components/hero-section"))
const BrandMarquee = lazy(() => import("@/components/brand-marquee"))
const CategoryGrid = lazy(() => import("@/components/category-grid"))
const ProductsCarousel = lazy(() => import("@/components/products-carousel"))

const LoadingPlaceholder = () => <div className="h-80 bg-muted animate-pulse rounded-lg" />

const FEATURES = [
  {
    icon: Zap,
    title: "Fast Delivery",
    description: "Get your phone delivered within 24 hours",
  },
  {
    icon: Shield,
    title: "Secure Payment",
    description: "Safe and encrypted transactions",
  },
  {
    icon: Truck,
    title: "Free Shipping",
    description: "On orders over Rs. 15,000",
  },
]

// Memoized product card component
const MemoizedProductCard = memo(ProductCard)

export default function Home() {
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([])
  const [loadingFeatured, setLoadingFeatured] = useState(true)

  // Load featured products from database
  const loadFeaturedProducts = async (silent: boolean = false) => {
    try {
      if (!silent) {
        setLoadingFeatured(true)
      }
      console.log('[Home] Loading featured products...')
      const products = await productsService.getFeatured(8)
      console.log('[Home] Featured products loaded:', products?.length || 0)
      setFeaturedProducts(products || [])
    } catch (error: any) {
      console.error('[Home] Failed to load featured products:', error)
    } finally {
      if (!silent) {
        setLoadingFeatured(false)
      }
    }
  }

  useEffect(() => {
    loadFeaturedProducts()
  }, [])

  // Real-time updates for featured products
  useRealtimeUpdates(() => loadFeaturedProducts(true))

  // Listen for custom events
  useEffect(() => {
    const handleUpdate = () => {
      console.log('[Home] Products update event received')
      loadFeaturedProducts(true)
    }
    window.addEventListener('productsUpdated', handleUpdate)
    return () => window.removeEventListener('productsUpdated', handleUpdate)
  }, [])

  // Memoized callback
  const handleProductClick = useCallback((productId: string) => {
    setSelectedProduct(productId)
  }, [])

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  }

  return (
    <div className="w-full">
      {/* Hero Section */}
      <Suspense fallback={<LoadingPlaceholder />}>
        <HeroSection />
      </Suspense>

      {/* Products Carousel - Category Carousel */}
      <Suspense fallback={<LoadingPlaceholder />}>
        <ProductsCarousel />
      </Suspense>

      {/* Features Section */}
      <section className="py-12 bg-muted">
        <div className="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 md:px-10">
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-8 xl:gap-10"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon
              return (
                <motion.div
                  key={index}
                  className="flex  items-center gap-4 p-6 bg-background rounded-xl border border-border"
                  variants={itemVariants}
                >
                  <div className="p-3 bg-gradient-primary rounded-lg text-white">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Shop by Category</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Browse our wide selection of smartphones, accessories, and parts
            </p>
          </motion.div>
          <Suspense fallback={<LoadingPlaceholder />}>
            <CategoryGrid />
          </Suspense>
        </div>
      </section>

      {/* Featured Products Section */}
      <section className="py-16 bg-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex justify-between items-center mb-12"
          >
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-2">Featured Products</h2>
              <p className="text-muted-foreground">Handpicked selection of the best phones</p>
            </div>
            <Link to="/shop">
              <Button variant="outline" className="gap-2 bg-transparent">
                View All <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </motion.div>

          {loadingFeatured ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Loading featured products...</p>
            </div>
          ) : featuredProducts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No featured products available</p>
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {featuredProducts.map((product) => {
                // Parse specs if it's a JSON string
                let specsText = ""
                if (product.specs) {
                  try {
                    const parsedSpecs = typeof product.specs === 'string' ? JSON.parse(product.specs) : product.specs
                    const storage = parsedSpecs?.Storage || parsedSpecs?.storage
                    const ram = parsedSpecs?.RAM || parsedSpecs?.ram
                    const warranty = parsedSpecs?.Warranty || parsedSpecs?.warranty || 'Company Warranty'
                    specsText = [storage, ram, warranty].filter(Boolean).join(' • ')
                  } catch (e) {
                    specsText = String(product.specs)
                  }
                }

                // Calculate discount if original_price exists
                let calculatedDiscount: number | undefined = undefined
                // @ts-ignore
                const originalPrice = product.original_price as number | null
                const currentPrice = Number(product.price)
                
                if (originalPrice && originalPrice > currentPrice) {
                  calculatedDiscount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
                }

                // @ts-ignore
                const backendDiscount = product.discount as number | null

                return (
                  <motion.div key={product.id} variants={itemVariants}>
                    <Suspense fallback={<LoadingPlaceholder />}>
                      <ProductCard
                        id={product.id}
                        name={product.name}
                        price={currentPrice}
                        image={product.image || "/placeholder.svg"}
                        condition={product.condition as "new" | "used"}
                        specs={specsText}
                        discount={backendDiscount || calculatedDiscount || undefined}
                        stock={product.stock}
                      />
                    </Suspense>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </div>
      </section>

      {/* Brand Marquee */}
      <section className="py-12 border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-muted-foreground mb-8 font-semibold">Trusted by leading brands</p>
          <Suspense fallback={<LoadingPlaceholder />}>
            <BrandMarquee />
          </Suspense>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl p-12 text-center text-white"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Find Your Perfect Smartphone Today</h2>
            <p className="text-lg mb-8 opacity-90 max-w-2xl mx-auto">
              Explore our collection of new and used phones with unbeatable prices and quality assurance
            </p>
            <Link to="/shop">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
                Shop Now
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
