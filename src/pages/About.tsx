"use client"

import { motion } from "framer-motion"
import { Award, Users, Zap, Globe } from "lucide-react"

const MILESTONES = [
  {
    year: "2016",
    title: "Founded",
    description: "I Mobile was established with a vision to deliver quality smartphones and trusted repair services.",
  },
  {
    year: "2018",
    title: "Expanded Services",
    description: "Opened multiple service centers to improve customer convenience and nationwide support.",
  },
  {
    year: "2020",
    title: "Digital Growth",
    description: "Introduced online booking and remote support to connect with customers more efficiently.",
  },
  {
    year: "2022",
    title: "50K Customers",
    description: "Achieved a major milestone of 50,000 satisfied customers through dedicated service and trust.",
  },
  {
    year: "2024",
    title: "Second Location",
    description: "Opened our second physical store, strengthening our presence and bringing our services closer to more customers.",
  },
  {
    year: "2025",
    title: "Online Store Launch & 8 Years of Excellence",
    description: "Launched our e-commerce platform to provide convenient smartphone and accessory shopping across Sri Lanka. Celebrating 8 years of winning customer trust and providing excellent service alongside you.",
  },
]

const VALUES = [
  {
    icon: Award,
    title: "Quality",
    description: "We guarantee authentic, high-quality smartphones and accessories",
  },
  {
    icon: Users,
    title: "Customer First",
    description: "Your satisfaction is our top priority with 24/7 support",
  },
  {
    icon: Zap,
    title: "Fast Service",
    description: "Quick delivery and hassle-free returns within 30 days",
  },
  {
    icon: Globe,
    title: "Trusted",
    description: "Certified dealer for all major smartphone brands",
  },
]

const TEAM = [
  {
    name: "Sarah Johnson",
    role: "Founder & CEO",
    image: "/placeholder.svg?key=sarah",
  },
  {
    name: "Mike Chen",
    role: "Operations Manager",
    image: "/placeholder.svg?key=mike",
  },
  {
    name: "Emma Davis",
    role: "Customer Success Lead",
    image: "/placeholder.svg?key=emma",
  },
  {
    name: "Alex Rodriguez",
    role: "Tech Specialist",
    image: "/placeholder.svg?key=alex",
  },
]

export default function AboutPage() {
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
    <div className="w-full">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-background via-background to-muted py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <h1 className="text-5xl md:text-6xl font-bold mb-6">About I Mobile</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Your trusted destination for quality smartphones, accessories, and expert support since 2016
            </p>
          </motion.div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1.2fr_1fr] gap-12 xl:gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-4xl font-bold mb-6">Our Story</h2>
              <p className="text-lg text-muted-foreground mb-4">
                I Mobile began with a clear vision — to provide reliable, high-quality service that customers can always count on.
                Our mission is to bring the best mobile devices and accessories within everyone's reach while ensuring a smooth and satisfying experience.
              </p>
              <p className="text-lg text-muted-foreground mb-4">
                Driven by trust, quality, and care, we continue to grow as a brand that values every customer and delivers excellence with every service.
              </p>
              <p className="text-lg text-muted-foreground">
                Whether you're looking for the latest flagship phone or a reliable budget option, I Mobile
                is your one-stop destination for all your smartphone needs.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <div className="relative h-96 bg-muted rounded-xl overflow-hidden">
                <img
                  src="/store-display.png"
                  alt="IMobile Service Center Store Display"
                  className="object-cover w-full h-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 xl:gap-6">
                <div className="bg-background border border-border rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-primary mb-1">50K+</p>
                  <p className="text-sm text-muted-foreground">Happy Customers</p>
                </div>

                <div className="bg-background border border-border rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-primary mb-1">100K+</p>
                  <p className="text-sm text-muted-foreground">Devices Sold</p>
                </div>

                <div className="bg-background border border-border rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-primary mb-1">8+</p>
                  <p className="text-sm text-muted-foreground">Years Experience</p>
                </div>

                <div className="bg-background border border-border rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-primary mb-1">98%</p>
                  <p className="text-sm text-muted-foreground">Satisfaction Rate</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 bg-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold mb-4">Our Values</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              These core values guide everything we do at I Mobile
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 xl:gap-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {VALUES.map((value, i) => {
              const Icon = value.icon
              return (
                <motion.div
                  key={i}
                  variants={itemVariants}
                  className="bg-background rounded-xl p-6 border border-border"
                >
                  <div className="p-3 bg-gradient-primary rounded-lg text-white w-fit mb-4">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">{value.title}</h3>
                  <p className="text-muted-foreground">{value.description}</p>
                </motion.div>
              )
            })}
          </motion.div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold mb-4">Our Journey</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Key milestones in our growth and success</p>
          </motion.div>

          <motion.div
            className="space-y-8 xl:space-y-10"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {MILESTONES.map((milestone, i) => (
              <motion.div key={i} variants={itemVariants} className="flex gap-6">
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    {i + 1}
                  </div>
                  {i < MILESTONES.length - 1 && <div className="w-1 h-20 bg-border mt-2" />}
                </div>
                <div className="pb-8">
                  <p className="text-sm font-semibold text-primary mb-1">{milestone.year}</p>
                  <h3 className="text-xl font-bold mb-2">{milestone.title}</h3>
                  <p className="text-muted-foreground">{milestone.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20 bg-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold mb-4">Our Team</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Meet the passionate people behind I Mobile
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 xl:gap-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {TEAM.map((member, i) => (
              <motion.div
                key={i}
                variants={itemVariants}
                className="bg-background rounded-xl overflow-hidden border border-border hover:shadow-lg transition-shadow"
              >
                <div className="relative h-48 bg-muted overflow-hidden">
                  <img
                    src={member.image || "/placeholder.svg"}
                    alt={member.name}
                    className="object-cover w-full h-full"
                  />
                </div>
                <div className="p-4 text-center">
                  <h3 className="font-bold text-lg mb-1">{member.name}</h3>
                  <p className="text-sm text-muted-foreground">{member.role}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>
    </div>
  )
}
