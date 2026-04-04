import { motion } from "framer-motion"

export default function FloatingContactButtons() {
  const ringingVariants = {
    initial: { rotate: 0, scale: 1 },
    animate: {
      rotate: [0, -10, 10, -10, 10, 0],
      transition: {
        duration: 0.5,
        repeat: Infinity,
        repeatDelay: 2, // Ring every 2 seconds
        ease: "easeInOut" as const
      }
    },
    hover: {
      scale: 1.1,
      rotate: [0, -15, 15, -15, 15, 0],
      transition: {
        duration: 0.5,
        repeat: Infinity,
        repeatDelay: 0,
        ease: "easeInOut" as const
      }
    }
  }

  const pulseVariants = {
    animate: {
      scale: [1, 1.2, 1],
      opacity: [0.5, 0.2, 0],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: "easeOut" as const
      }
    }
  }

  return (
    <div className="fixed bottom-40 md:bottom-24 right-4 md:right-8 z-50 flex flex-col gap-3">
      {/* Call Button */}
      <div className="relative">
        {/* Pulse effect background */}
        <motion.div
          variants={pulseVariants}
          animate="animate"
          className="absolute inset-0 bg-red-500 rounded-full"
        />
        <motion.a
          href="tel:+94770344273"
          variants={ringingVariants}
          initial="initial"
          animate="animate"
          whileHover="hover"
          whileTap={{ scale: 0.9 }}
          className="relative w-12 h-12 md:w-14 md:h-14 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg border border-red-400/20"
          aria-label="Call Us"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 md:w-7 md:h-7">
            <path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1.02 1.02 0 00-1.02.24l-2.2 2.2a15.045 15.045 0 01-6.59-6.59l2.2-2.21a.96.96 0 00.25-1A11.36 11.36 0 018.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1zM19 12h2a9 9 0 00-9-9v2c3.87 0 7 3.13 7 7zm-4 0h2c0-2.76-2.24-5-5-5v2c1.66 0 3 1.34 3 3z" />
          </svg>
        </motion.a>
      </div>

      {/* WhatsApp Button */}
      <div className="relative">
        <motion.div
          variants={pulseVariants}
          animate="animate"
          className="absolute inset-0 bg-green-500 rounded-full"
        />
        <motion.a
          href="https://wa.me/94770344273"
          target="_blank"
          rel="noopener noreferrer"
          variants={ringingVariants}
          initial="initial"
          animate="animate"
          whileHover="hover"
          whileTap={{ scale: 0.9 }}
          className="relative w-12 h-12 md:w-14 md:h-14 bg-[#25D366] rounded-full flex items-center justify-center text-white shadow-lg border border-green-400/20"
          aria-label="WhatsApp Us"
        >
          {/* New Clean WhatsApp SVG matching the user's image */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-7 h-7 md:w-8 md:h-8 fill-white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.832 11.832 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </motion.a>
      </div>
    </div>
  )
}
