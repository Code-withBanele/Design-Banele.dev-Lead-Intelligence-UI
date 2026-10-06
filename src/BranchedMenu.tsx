import { useEffect, useState } from "react"

export type BranchedMenuItem = {
  value: string
  label: string
  icon?: React.ReactNode
}

export type BranchedMenuBranch = {
  label: string
  children: BranchedMenuItem[]
}

type BranchedMenuProps = {
  items: BranchedMenuBranch[]
  defaultOpen?: number[]
  defaultActive?: string
  activeValue?: string
  onSelect?: (value: string, item: BranchedMenuItem) => void
  color?: string
  accentColor?: string
  lineColor?: string
  width?: number
  rowHeight?: number
  indent?: number
  trunk?: number
  radius?: number
  lineWidth?: number
  fontSize?: number
  drawDuration?: number
  foldDuration?: number
}

export default function BranchedMenu({
  items,
  defaultOpen = [],
  defaultActive,
  activeValue,
  onSelect,
  color = "#f5f5f5",
  accentColor = "#ed1c2e",
  lineColor = "#3f3f46",
  width = 240,
  rowHeight = 36,
  indent = 40,
  trunk = 14,
  radius = 10,
  lineWidth = 1.5,
  fontSize = 14,
  drawDuration = 400,
  foldDuration = 300,
}: BranchedMenuProps) {
  const [open, setOpen] = useState(() => new Set(defaultOpen))
  const [active, setActive] = useState(defaultActive)

  useEffect(() => {
    if (activeValue) setActive(activeValue)
  }, [activeValue])

  const toggle = (index: number) => {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div
      className="branched-menu"
      style={
        {
          width,
          color,
          "--branch-accent": accentColor,
          "--branch-line": lineColor,
          "--branch-row": `${rowHeight}px`,
          "--branch-indent": `${indent}px`,
          "--branch-trunk": `${trunk}px`,
          "--branch-radius": `${radius}px`,
          "--branch-line-width": `${lineWidth}px`,
          "--branch-font": `${fontSize}px`,
          "--branch-draw": `${drawDuration}ms`,
          "--branch-fold": `${foldDuration}ms`,
        } as React.CSSProperties
      }
    >
      {items.map((branch, branchIndex) => {
        const isOpen = open.has(branchIndex)
        return (
          <div
            className={`branch ${isOpen ? "is-open" : ""}`}
            key={branch.label}
          >
            <button
              className="branch-trigger"
              onClick={() => toggle(branchIndex)}
              aria-expanded={isOpen}
            >
              <span>{branch.label}</span>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="m4.5 6 3.5 3.5L11.5 6" />
              </svg>
            </button>
            <div className="branch-children">
              <div className="branch-line" />
              {branch.children.map((item) => (
                <button
                  className={`branch-item ${
                    active === item.value ? "is-active" : ""
                  }`}
                  key={item.value}
                  onClick={() => {
                    setActive(item.value)
                    onSelect?.(item.value, item)
                  }}
                >
                  <span className="branch-connector" />
                  <span className="branch-icon">{item.icon}</span>
                  <span className="branch-label">{item.label}</span>
                  {active === item.value && (
                    <span className="branch-active-dot" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
