"use client"

interface Location {
  name: string
  embedUrl: string
}

interface LocationMapProps {
  locations?: Location[]
}

export default function LocationMap({
  locations = [
    {
      name: "IMobile Service Center - Main",
      embedUrl:
        "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3961.481628908141!2d80.04007767570597!3d6.832710419491383!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ae2530001cfb671%3A0xc8c24530ce10d8e6!2sDexLanka%20Software%20Solution!5e0!3m2!1sen!2slk!4v1760907106492!5m2!1sen!2slk",
    },
    {
      name: "IMobile Service Center - Branch",
      embedUrl:
        "https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d495.1730200964206!2d80.04521433260035!3d6.844465348597728!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2slk!4v1760907169414!5m2!1sen!2slk",
    },
  ],
}: LocationMapProps) {
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {locations.map((location, index) => (
          <div key={index} className="rounded-lg overflow-hidden border border-border shadow-md">
            <div className="bg-muted p-3 border-b border-border">
              <h3 className="font-semibold text-foreground">{location.name}</h3>
            </div>
            <iframe
              width="100%"
              height="400"
              frameBorder="0"
              style={{ border: 0 }}
              allowFullScreen={true}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={location.embedUrl}
              title={location.name}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
