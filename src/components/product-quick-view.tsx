"use client"

import { motion, AnimatePresence } from "framer-motion"
import { X, ShoppingCart, Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCartStore, type CartItem } from "@/lib/store"
import { formatCurrency } from "@/lib/utils/currency"

interface ProductQuickViewProps {
  product: {
    id: string
    name: string
    price: number
    image: string
    condition: "new" | "used"
    brand: string
  }
  onClose: () => void
}

export default function ProductQuickView({ product, onClose }: ProductQuickViewProps) {
  const addToCart = useCartStore((state) => state.addToCart)

  const handleAddToCart = () => {
    const item: CartItem = {
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      quantity: 1,
      condition: product.condition,
    }
    addToCart(item)
    onClose()
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-background rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-muted rounded-lg transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8">
            {/* Image */}
            <div className="flex items-center justify-center bg-muted rounded-lg h-96">
              <img
                src={product.image || "/placeholder.svg"}
                alt={product.name}
                width={300}
                height={300}
                className="object-contain"
              />
            </div>

            {/* Details */}
            <div className="flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      product.condition === "new" ? "bg-green-500 text-white" : "bg-amber-500 text-white"
                    }`}
                  >
                    {product.condition === "new" ? "New" : "Used"}
                  </span>
                  <span className="text-sm text-muted-foreground">{product.brand}</span>
                </div>

                <h2 className="text-3xl font-bold mb-4">{product.name}</h2>

                <div className="mb-6">
                  <p className="text-4xl font-bold text-primary mb-2">{formatCurrency(product.price)}</p>
                  <p className="text-muted-foreground">Free shipping on orders over Rs. 15,000</p>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Condition:</span>
                    <span className="text-sm text-muted-foreground capitalize">{product.condition}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Warranty:</span>
                    <span className="text-sm text-muted-foreground">
                      {product.condition === "new" ? "1 Year" : "6 Months"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Availability:</span>
                    <span className="text-sm text-green-600 font-semibold">In Stock</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button onClick={handleAddToCart} className="flex-1 gap-2" size="lg">
                  <ShoppingCart className="w-5 h-5" />
                  Add to Cart
                </Button>
                <Button variant="outline" size="lg" className="gap-2 bg-transparent">
                  <Heart className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
