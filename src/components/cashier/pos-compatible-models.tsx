export interface PosPhoneModel {
  id: string
  name: string
  label: string
  /** The phone's brand, which may differ from the stocked part's brand. */
  brand_name?: string
}

interface PosCompatibleModelsProps {
  models?: PosPhoneModel[]
  selectedModelId?: string
}

/** Keep compatibility visible without opening the customer's phone selector. */
export default function PosCompatibleModels({ models, selectedModelId }: PosCompatibleModelsProps) {
  if (!models?.length) {
    return <p className="mt-1 text-xs text-muted-foreground">Compatible models not added</p>
  }

  return (
    <div className="mt-1.5 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Compatible models ({models.length})</p>
      <ul aria-label="Compatible models" className="flex flex-wrap gap-1">
        {models.map(model => (
          <li
            key={model.id}
            className={`max-w-full break-words rounded border px-1.5 py-0.5 text-xs ${
              model.id === selectedModelId
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-muted/50 text-foreground'
            }`}
          >
            {model.label || [model.brand_name, model.name].filter(Boolean).join(' ')}
          </li>
        ))}
      </ul>
    </div>
  )
}
