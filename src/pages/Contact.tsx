"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { Mail, Phone, MapPin, MessageSquare, Send, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import CombinedLocationMap from "@/components/combined-location-map"

const LOCATIONS = [
  {
    name: "IMobile Service Center - Main",
    address: "DexLanka Software Solution, Meegoda, Sri Lanka",
    phone: "+94 70 558 8789",
    hours: "Mon-Sat: 10AM-8PM, Sun: 12PM-6PM",
  },
  {
    name: "IMobile Service Center - Branch",
    address: "Meegoda, Sri Lanka",
    phone: "+94 70 558 8789",
    hours: "Mon-Sat: 10AM-8PM, Sun: 12PM-6PM",
  },
]

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Create WhatsApp message
    const whatsappMessage = `*New Contact Form Message*

*Name:* ${formData.name}
*Email:* ${formData.email}
*Subject:* ${formData.subject}

*Message:*
${formData.message}

---
Sent from I Mobile Contact Form`

    // Encode message for WhatsApp URL
    const encodedMessage = encodeURIComponent(whatsappMessage)
    const whatsappNumber = "94705588789" // Your WhatsApp number
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`

    // Open WhatsApp with pre-filled message
    window.open(whatsappUrl, '_blank')

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 1000))

    setSubmitted(true)
    setFormData({ name: "", email: "", subject: "", message: "" })
    setIsSubmitting(false)

    // Reset success message after 5 seconds
    setTimeout(() => setSubmitted(false), 5000)
  }

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
            <h1 className="text-5xl md:text-6xl font-bold mb-6">Get in Touch</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Have questions? We'd love to hear from you. Contact us anytime.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Info Cards */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-6 xl:gap-8 mb-12"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {/* Email */}
            <motion.div variants={itemVariants} className="bg-card border border-border rounded-lg p-6">
              <div className="p-3 bg-gradient-primary rounded-lg text-white w-fit mb-4">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Email</h3>
              <p className="text-muted-foreground mb-4">Send us an email anytime</p>
              <a
                href="mailto:imobileserviceandrepaircenter@gmail.com"
                className="text-primary font-semibold hover:underline"
              >
                imobileserviceandrepaircenter@gmail.com
              </a>
            </motion.div>

            {/* Phone */}
            <motion.div variants={itemVariants} className="bg-card border border-border rounded-lg p-6">
              <div className="p-3 bg-gradient-primary rounded-lg text-white w-fit mb-4">
                <Phone className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Phone</h3>
              <p className="text-muted-foreground mb-4">Call us during business hours</p>
              <a href="tel:+94705588789" className="text-primary font-semibold hover:underline">
                +94 70 558 8789
              </a>
            </motion.div>

            {/* WhatsApp */}
            <motion.div variants={itemVariants} className="bg-[#25D366] text-white border border-[#25D366] rounded-lg p-6">
              <div className="p-3 bg-white/20 rounded-lg text-white w-fit mb-4">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">WhatsApp</h3>
              <p className="text-white/90 mb-4">Chat with us on WhatsApp</p>
              <a href="https://wa.me/94705588789" className="text-white font-bold hover:underline flex items-center gap-2">
                Start Chat <ArrowRight className="w-4 h-4" />
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Map Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold mb-4">Find Us on the Map</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Visit our store location in Meegoda, Sri Lanka</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <CombinedLocationMap />
          </motion.div>
        </div>
      </section>

      {/* Locations Section */}
      <section className="py-20 bg-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold mb-4">Visit Our Store</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Find us at our convenient location</p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-1 gap-6"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {LOCATIONS.map((location, i) => (
              <motion.div key={i} variants={itemVariants} className="bg-background border border-border rounded-lg p-8">
                <h3 className="text-2xl font-bold mb-4">{location.name}</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                    <p className="text-muted-foreground">{location.address}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-primary flex-shrink-0" />
                    <a href={`tel:${location.phone.replace(/\s/g, "")}`} className="text-primary hover:underline">
                      {location.phone}
                    </a>
                  </div>
                  <div className="flex items-start gap-3">
                    <MessageSquare className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                    <p className="text-muted-foreground">{location.hours}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold mb-4">Send us a Message</h2>
            <p className="text-muted-foreground">
              Fill out the form below and we'll open WhatsApp with your message ready to send
            </p>
          </motion.div>

          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="bg-card border border-border rounded-lg p-8 space-y-6"
          >
            {submitted && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-green-100 text-green-800 p-4 rounded-lg"
              >
                WhatsApp opened! Your message has been prepared. Please send it to complete your inquiry.
              </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold mb-2">Full Name</label>
                <Input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Email</label>
                <Input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Subject</label>
              <Input
                type="text"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                placeholder="How can we help?"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Message</label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                placeholder="Your message here..."
                rows={6}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
              <MessageSquare className="w-4 h-4" />
              {isSubmitting ? "Opening WhatsApp..." : "Send via WhatsApp"}
            </Button>
          </motion.form>
        </div>
      </section>
    </div>
  )
}
