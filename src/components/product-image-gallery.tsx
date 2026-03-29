"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"

interface ProductImageGalleryProps {
  images: string[]
  productName: string
  condition: "new" | "used"
  externalImageIndex?: number
}

export default function ProductImageGallery({ images, productName, condition, externalImageIndex }: ProductImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState(0)

  // Sync internal state with externalIndex if provided
  useEffect(() => {
    if (typeof externalImageIndex === 'number' && externalImageIndex >= 0 && externalImageIndex < images.length) {
      setSelectedImage(externalImageIndex)
    }
  }, [externalImageIndex, images.length])

  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
      <div className="flex flex-col-reverse md:flex-row gap-4">
        {/* Thumbnail Gallery - Bottom on Mobile, Left on Desktop */}
        {images.length > 1 && (
          <div className="flex md:flex-col gap-3 overflow-x-auto pb-2 md:pb-0 flex-shrink-0 snap-x">
            {images.map((image, index) => (
              <motion.button
                key={index}
                onClick={() => setSelectedImage(index)}
                className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border-2 transition-all ${selectedImage === index ? "border-primary" : "border-border hover:border-primary/50"
                  }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <img
                  src={image || "/placeholder.svg"}
                  alt={`${productName} ${index + 1}`}
                  className="object-cover w-full h-full"
                />
              </motion.button>
            ))}
          </div>
        )}

        {/* Main Image */}
        <div className="relative w-full aspect-square md:aspect-auto md:flex-1 md:h-[500px] lg:h-[600px] bg-muted rounded-lg overflow-hidden border border-border flex items-center justify-center">
          <img
            src={images[selectedImage] || "/placeholder.svg"}
            alt={productName}
            className="object-contain w-full h-full p-4"
          />
          <div className="absolute top-4 right-4">
            <span
              className={`px-4 py-2 rounded-full text-sm font-semibold ${condition === "new" ? "bg-green-500 text-white" : "bg-amber-500 text-white"
                }`}
            >
              {condition === "new" ? "New" : "Used"}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
