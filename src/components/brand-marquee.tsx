"use client"

import { motion } from "framer-motion"
import {
  siApple,
  siSamsung,
  siGoogle,
  siOneplus,
  siXiaomi,
  siOppo,
  siVivo
} from "simple-icons"

const BRANDS = [
  { name: "Apple", icon: siApple },
  { name: "Samsung", icon: siSamsung },
  { name: "Google", icon: siGoogle },
  { name: "OnePlus", icon: siOneplus },
  { name: "Xiaomi", icon: siXiaomi },
  { name: "Oppo", icon: siOppo },
  { name: "Vivo", icon: siVivo },
  { name: "Realme", icon: null }, // Realme doesn't have an official simple-icon widely used yet
]

export default function BrandMarquee() {
  return (
    <div className="overflow-hidden">
      <motion.div
        className="flex gap-16 md:gap-24"
        animate={{ x: [0, -1500] }}
        transition={{
          duration: 30,
          repeat: Number.POSITIVE_INFINITY,
          ease: "linear",
        }}
      >
        {[...BRANDS, ...BRANDS].map((brand, i) => (
          <div
            key={i}
            className="flex items-center gap-3 justify-center min-w-max px-4 py-4 opacity-50 hover:opacity-100 transition-opacity cursor-default grayscale hover:grayscale-0"
          >
            {brand.icon ? (
              <svg
                role="img"
                viewBox="0 0 24 24"
                className="w-8 h-8 md:w-10 md:h-10 fill-current"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d={brand.icon.path} />
              </svg>
            ) : null}
            <span className="text-xl md:text-2xl font-bold tracking-tight">
              {brand.name}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  )
}
