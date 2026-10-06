import { useState } from "react"

import { Button, SectionHeader } from "@/components/ui"

import type { CreateLeadInput } from "@/types"

export function AddLeadForm({
  onAdd,
  onCancel,
}: {
  onAdd: (input: CreateLeadInput) => void
  onCancel: () => void
}) {
  const [name, setName] = useState("")

  const [industry, setIndustry] = useState("")

  const [location, setLocation] = useState("")

  return (
    <section className="panel mb-5 p-5">
      <SectionHeader
        title="Add a business"
        meta="No audit, score, or AI analysis is inferred from these details."
      />
      <form
        className="grid gap-4 p-4 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault()

          const trimmedName = name.trim()

          if (!trimmedName) return

          onAdd({
            name: trimmedName,
            industry: industry.trim(),
            location: location.trim(),
            status: "NEW",
          })

          setName("")

          setIndustry("")

          setLocation("")

          onCancel()
        }}
      >
        {[
          {
            key: "name",
            label: "Business name",
            value: name,
            setValue: setName,
            required: true,
          },
          {
            key: "industry",
            label: "Industry",
            value: industry,
            setValue: setIndustry,
          },
          {
            key: "location",
            label: "Location",
            value: location,
            setValue: setLocation,
          },
        ].map(({ key, label, value, setValue, required }) => (
          <label className="grid gap-2 text-xs" key={key}>
            {label}
            <input
              className="rounded border border-[#303030] bg-[#151515] p-3 text-white"
              name={key}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required={required}
              maxLength={160}
            />
          </label>
        ))}
        <div className="flex gap-3 md:col-span-3">
          <button className="button button-primary" type="submit">
            Add lead
          </button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  )
}
