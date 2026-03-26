"use client"

import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { Smartphone, Headphones, Zap } from "lucide-react"

const CATEGORIES = [
  {
    id: "new-phones",
    name: "New Phones",
    icon: Smartphone,
    color: "from-blue-500 to-blue-600",
    count: "150+",
  },
  {
    id: "used-phones",
    name: "Used Phones",
    icon: Smartphone,
    color: "from-purple-500 to-purple-600",
    count: "200+",
  },
  {
    id: "accessories",
    name: "Accessories",
    icon: Headphones,
    color: "from-pink-500 to-pink-600",
    count: "300+",
  },
  {
    id: "parts",
    name: "Parts & Displays",
    icon: Zap,
    color: "from-orange-500 to-orange-600",
    count: "100+",
  },
]

export default function CategoryGrid() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
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
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 xl:gap-8"
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
    >
      {CATEGORIES.map((category) => {
        const Icon = category.icon
        return (
          <motion.div key={category.id} variants={itemVariants}>
            <Link to={`/shop?category=${category.id}`}>
              <div
                className={`bg-gradient-to-br ${category.color} rounded-xl p-8 text-white cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-105 h-full`}
              >
                <Icon className="w-12 h-12 mb-4" />
                <h3 className="text-xl font-bold mb-2">{category.name}</h3>
                <p className="text-sm opacity-90 mb-4">{category.count} products</p>
                <div className="text-sm font-semibold opacity-75">Browse →</div>
              </div>
            </Link>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
