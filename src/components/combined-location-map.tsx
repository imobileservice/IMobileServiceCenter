"use client"

import { useState } from "react"
import { MapPin } from "lucide-react"

interface Location {
  name: string
  lat: number
  lng: number
  address: string
  phone: string
  embedUrl: string
}

const LOCATIONS: Location[] = [
  {
    name: "IMobile Service Center - Main",
    lat: 6.83271,
    lng: 80.040077,
    address: "DexLanka Software Solution, Meegoda, Sri Lanka",
    phone: "+94 70 558 8789",
    embedUrl:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3961.481628908141!2d80.04007767570597!3d6.832710419491383!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ae2530001cfb671%3A0xc8c24530ce10d8e6!2sDexLanka%20Software%20Solution!5e0!3m2!1sen!2slk!4v1760907106492!5m2!1sen!2slk",
  },
  {
    name: "IMobile Service Center - Branch",
    lat: 6.844465,
    lng: 80.045214,
    address: "Meegoda, Sri Lanka",
    phone: "+94 70 558 8789",
    embedUrl:
      "https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d495.1730200964206!2d80.04521433260035!3d6.844465348597728!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2slk!4v1760907169414!5m2!1sen!2slk",
  },
]

export default function CombinedLocationMap() {
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(LOCATIONS[0])

  const mapsUrl = selectedLocation?.embedUrl || LOCATIONS[0].embedUrl

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map */}
        <div className="lg:col-span-2">
          <div className="rounded-lg overflow-hidden border border-border shadow-md h-[500px]">
            <iframe
              width="100%"
              height="100%"
              frameBorder="0"
              style={{ border: 0 }}
              allowFullScreen={true}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={mapsUrl}
              title="IMobile Service Center Locations"
            />
          </div>
        </div>

        {/* Location List */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold">Our Locations</h3>
          {LOCATIONS.map((location) => (
            <button
              key={location.name}
              onClick={() => setSelectedLocation(location)}
              className={`w-full text-left p-4 rounded-lg border transition-all ${
                selectedLocation?.name === location.name
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-sm">{location.name}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{location.address}</p>
                  <p className="text-xs text-primary mt-2">{location.phone}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
