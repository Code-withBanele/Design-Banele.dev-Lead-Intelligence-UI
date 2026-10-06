import { useEffect, useMemo, useRef, useState } from "react"

type SettleMeta = {
  velocity: number
  bounce: number
}

type CometDialProps = {
  defaultValue?: number
  value?: number | null
  readOnly?: boolean
  min?: number
  max?: number
  step?: number
  unit?: string
  label?: string
  accent?: string
  ink?: string
  size?: number
  sweep?: number
  thickness?: number
  speed?: number
  tapBounce?: number
  flickBounce?: number
  momentum?: number
  cometReach?: number
  cometWidth?: number
  onChange?: (value: number) => void
  onChangeEnd?: (value: number, meta: SettleMeta) => void
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export default function CometDial({
  defaultValue = 0,
  value: controlledValue,
  readOnly = false,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
  label = "Value",
  accent = "#ffffff",
  ink = "#ffffff",
  size = 250,
  sweep = 320,
  thickness = 5,
  speed = 25,
  tapBounce = 0.2,
  flickBounce = 0.1,
  momentum = 1,
  cometReach = 180,
  cometWidth = 12,
  onChange,
  onChangeEnd,
}: CometDialProps) {
  const [internalValue, setInternalValue] = useState(() => clamp(defaultValue, min, max))
  const [dragging, setDragging] = useState(false)
  const dialRef = useRef<HTMLDivElement>(null)
  const lastPoint = useRef({ angle: 0, time: 0, velocity: 0 })
  const raf = useRef<number | null>(null)

  const hasValue = controlledValue !== null && controlledValue !== undefined
  const value = controlledValue === undefined
    ? internalValue
    : clamp(controlledValue ?? min, min, max)

  const radius = size * 0.39
  const circumference = 2 * Math.PI * radius
  const sweepLength = circumference * (sweep / 360)
  const ratio = (value - min) / Math.max(1, max - min)
  const progressLength = sweepLength * ratio
  const gap = 360 - sweep
  const rotation = 90 + gap / 2
  const headAngle = rotation + sweep * ratio
  const radians = (headAngle * Math.PI) / 180
  const headX = size / 2 + radius * Math.cos(radians)
  const headY = size / 2 + radius * Math.sin(radians)

  const ticks = useMemo(
    () =>
      Array.from({ length: 41 }, (_, index) => {
        const tickAngle = rotation + (sweep / 40) * index
        return { tickAngle, major: index % 5 === 0 }
      }),
    [rotation, sweep],
  )

  const angleFromPointer = (clientX: number, clientY: number) => {
    const rect = dialRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return (
      ((Math.atan2(
        clientY - (rect.top + rect.height / 2),
        clientX - (rect.left + rect.width / 2),
      ) *
        180) /
        Math.PI +
        360) %
      360
    )
  }

  const valueFromAngle = (angle: number) => {
    let relative = (angle - rotation + 360) % 360
    if (relative > sweep) {
      relative = relative < sweep + gap / 2 ? sweep : 0
    }
    const raw = min + (relative / sweep) * (max - min)
    return clamp(Math.round(raw / step) * step, min, max)
  }

  const updateValue = (next: number) => {
    if (readOnly) return
    const rounded = clamp(Math.round(next / step) * step, min, max)
    setInternalValue(rounded)
    onChange?.(rounded)
  }

  const settle = (velocity: number, bounce: number) => {
    const projected = clamp(
      value + velocity * momentum * speed * 0.04,
      min,
      max,
    )
    updateValue(projected)
    onChangeEnd?.(clamp(Math.round(projected / step) * step, min, max), {
      velocity,
      bounce,
    })
  }

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    },
    [],
  )

  return (
    <div
      ref={dialRef}
      className={`comet-dial ${dragging ? "is-dragging" : ""} ${readOnly ? "is-read-only" : ""}`}
      style={
        {
          width: size,
          height: size,
          color: ink,
          "--comet-accent": accent,
          "--comet-thickness": `${thickness}px`,
          "--comet-width": `${cometWidth}px`,
          "--comet-bounce": tapBounce,
        } as React.CSSProperties
      }
      role={readOnly ? "img" : "slider"}
      aria-label={hasValue ? `${label}: ${value}${unit}` : `${label}: No data`}
      aria-valuemin={readOnly ? undefined : min}
      aria-valuemax={readOnly ? undefined : max}
      aria-valuenow={readOnly && !hasValue ? undefined : value}
      aria-valuetext={readOnly && !hasValue ? "No data" : undefined}
      tabIndex={readOnly ? -1 : 0}
      onKeyDown={(event) => {
        if (readOnly) return
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault()
          updateValue(value + step)
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault()
          updateValue(value - step)
        }
      }}
      onPointerDown={(event) => {
        if (readOnly) return
        event.currentTarget.setPointerCapture(event.pointerId)
        const angle = angleFromPointer(event.clientX, event.clientY)
        lastPoint.current = { angle, time: performance.now(), velocity: 0 }
        setDragging(true)
        updateValue(valueFromAngle(angle))
      }}
      onPointerMove={(event) => {
        if (readOnly) return
        if (!dragging) return
        const angle = angleFromPointer(event.clientX, event.clientY)
        const now = performance.now()
        let delta = angle - lastPoint.current.angle
        if (delta > 180) delta -= 360
        if (delta < -180) delta += 360
        const elapsed = Math.max(16, now - lastPoint.current.time)
        lastPoint.current = {
          angle,
          time: now,
          velocity: (delta / elapsed) * 16,
        }
        updateValue(valueFromAngle(angle))
      }}
      onPointerUp={() => {
        if (readOnly) return
        setDragging(false)
        settle(
          lastPoint.current.velocity,
          Math.abs(lastPoint.current.velocity) > 2 ? flickBounce : tapBounce,
        )
      }}
    >
      <svg
        className="comet-dial-svg"
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <defs>
          <filter
            id="comet-glow"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
          >
            <feGaussianBlur
              stdDeviation={Math.max(2, cometWidth / 3)}
              result="blur"
            />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="comet-trail" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={accent} stopOpacity="0" />
            <stop offset=".72" stopColor={accent} stopOpacity=".45" />
            <stop offset="1" stopColor={accent} />
          </linearGradient>
        </defs>
        <g transform={`rotate(${rotation} ${size / 2} ${size / 2})`}>
          <circle
            className="comet-track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            pathLength={circumference}
            strokeDasharray={`${sweepLength} ${circumference - sweepLength}`}
          />
          <circle
            className="comet-progress"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            pathLength={circumference}
            stroke="url(#comet-trail)"
            strokeDasharray={`${Math.min(progressLength, cometReach)} ${circumference - Math.min(progressLength, cometReach)}`}
            strokeDashoffset={-Math.max(0, progressLength - cometReach)}
          />
        </g>
        <g className="comet-ticks">
          {ticks.map(({ tickAngle, major }, index) => (
            <line
              key={index}
              x1={size / 2}
              y1={size * (major ? 0.075 : 0.092)}
              x2={size / 2}
              y2={size * 0.11}
              transform={`rotate(${tickAngle + 90} ${size / 2} ${size / 2})`}
            />
          ))}
        </g>
        <circle
          className="comet-head-glow"
          cx={headX}
          cy={headY}
          r={cometWidth}
          fill={accent}
          filter="url(#comet-glow)"
        />
        <circle
          className="comet-head"
          cx={headX}
          cy={headY}
          r={Math.max(3, thickness * 0.8)}
          fill={accent}
        />
      </svg>
      <div className="comet-readout">
        <span>{label}</span>
        <strong>
          {hasValue ? value : "—"}
          {hasValue && <small>{unit}</small>}
        </strong>
        <em>{readOnly ? (hasValue ? "Application data" : "No data") : "Drag to adjust"}</em>
      </div>
    </div>
  )
}
