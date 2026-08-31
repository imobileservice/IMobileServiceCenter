"use client"

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Loader2, Search, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  phoneModelsService,
  type CompatibilityBrand,
  type PhoneModel,
} from "@/lib/supabase/services/phone-models"
import { setSelectedPhoneModel } from "@/lib/phone-model-session"

/**
 * "Find Parts For Your Phone" - brand, then model, then every product linked to
 * that model.
 *
 * Renders nothing when no phone models exist yet (or the compatibility
 * migration has not been applied), so the page is unchanged until the shop
 * starts using the feature.
 */
export default function PhoneFinder() {
  const navigate = useNavigate()
  const [brands, setBrands] = useState<CompatibilityBrand[]>([])
  const [models, setModels] = useState<PhoneModel[]>([])
  const [brandId, setBrandId] = useState("")
  const [modelId, setModelId] = useState("")
  const [loadingBrands, setLoadingBrands] = useState(true)
  const [loadingModels, setLoadingModels] = useState(false)

  useEffect(() => {
    let cancelled = false

    phoneModelsService
      .getFinderBrands()
      .then((data) => {
        if (!cancelled) setBrands(data)
      })
      .finally(() => {
        if (!cancelled) setLoadingBrands(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!brandId) {
      setModels([])
      setModelId("")
      return
    }

    let cancelled = false
    setLoadingModels(true)
    setModelId("")

    phoneModelsService
      .getFinderModels(brandId)
      .then((data) => {
        if (!cancelled) setModels(data)
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false)
      })

    return () => {
      cancelled = true
    }
  }, [brandId])

  const findParts = () => {
    if (!modelId) return
    const model = models.find((m) => m.id === modelId)

    // Remember his phone for the rest of the visit, so every part he looks at
    // is named after HIS model rather than the one it happens to be stocked as.
    if (model) {
      setSelectedPhoneModel({ id: model.id, name: model.name, label: model.label })
    }

    const params = new URLSearchParams({ phone_model: modelId })
    if (model) params.set("phone_model_name", model.label)
    navigate(`/shop?${params.toString()}`)
  }

  // Nothing to offer yet - stay out of the way.
  if (!loadingBrands && brands.length === 0) return null

  return (
    <section className="py-12 bg-muted">
      <div className="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="bg-background border border-border rounded-2xl p-6 md:p-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="p-2 rounded-lg bg-primary/10">
              <Smartphone className="w-5 h-5 text-primary" />
            </span>
            <h2 className="text-2xl md:text-3xl font-bold">Find Parts For Your Phone</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Pick your phone and see every display, battery and spare part that fits it.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
            <div>
              <label htmlFor="finder-brand" className="block text-xs font-semibold mb-1.5 text-muted-foreground">
                Brand
              </label>
              <select
                id="finder-brand"
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                disabled={loadingBrands}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-background"
              >
                <option value="">{loadingBrands ? "Loading brands..." : "Select Brand"}</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="finder-model" className="block text-xs font-semibold mb-1.5 text-muted-foreground">
                Model
              </label>
              <select
                id="finder-model"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={!brandId || loadingModels}
                className="w-full px-3 py-2.5 border border-border rounded-lg bg-background disabled:opacity-60"
              >
                <option value="">
                  {!brandId
                    ? "Select Brand first"
                    : loadingModels
                      ? "Loading models..."
                      : models.length === 0
                        ? "No models for this brand"
                        : "Select Model"}
                </option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                    {model.model_code ? ` (${model.model_code})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button onClick={findParts} disabled={!modelId} className="w-full md:w-auto h-[42px]">
                {loadingModels ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                Find Compatible Parts
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
