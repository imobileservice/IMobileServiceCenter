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
  comingSoon?: boolean
}

const LOCATIONS: Location[] = [
  {
    name: "IMobile Service Center - Main",
    lat: 6.844465,
    lng: 80.045214,
    address: "Meegoda, Sri Lanka",
    phone: "+94 77 034 4273",
    embedUrl:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d832.7788961424732!2d80.04424322793692!3d6.844201052019578!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ae253fcfbf3067d%3A0x12aaf11e4aab719f!2sIMobile%20Service%20and%20Repair%20Center!5e0!3m2!1sen!2slk!4v1774806255844!5m2!1sen!2slk",
  },
  {
    name: "IMobile Service Center - Branch",
    lat: 6.844465,
    lng: 80.045214,
    address: "Padukka, Sri Lanka",
    phone: "+94 77 034 4273",
    embedUrl:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d832.7788961424732!2d80.04424322793692!3d6.844201052019578!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ae253fcfbf3067d%3A0x12aaf11e4aab719f!2sIMobile%20Service%20and%20Repair%20Center!5e0!3m2!1sen!2slk!4v1774806255844!5m2!1sen!2slk",
    comingSoon: true,
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
              onClick={() => !location.comingSoon && setSelectedLocation(location)}
              disabled={location.comingSoon}
              className={`w-full text-left p-4 rounded-lg border transition-all ${location.comingSoon
                  ? "opacity-60 cursor-not-allowed border-dashed bg-gray-50/50 dark:bg-gray-900/50"
                  : selectedLocation?.name === location.name
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
            >
              <div className="flex items-start gap-3">
                <MapPin className={`w-5 h-5 flex-shrink-0 mt-1 ${location.comingSoon ? "text-gray-400" : "text-primary"}`} />
                <div>
                  <h4 className={`font-semibold text-sm flex flex-wrap items-center gap-2 ${location.comingSoon ? "text-gray-500" : ""}`}>
                    {location.name}
                    {location.comingSoon && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded-full whitespace-nowrap">
                        Coming Soon
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">{location.address}</p>
                  <p className={`text-xs mt-2 ${location.comingSoon ? "text-gray-400" : "text-primary"}`}>{location.phone}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
