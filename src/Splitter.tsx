import { useCallback, useEffect, useRef } from 'react'

export function Splitter({
  width,
  onChange,
  min = 180,
  max = 720,
  side = 'left',
}: {
  width: number
  onChange: (width: number) => void
  min?: number
  max?: number
  side?: 'left' | 'right'
}) {
  const start = useRef<{ x: number; width: number } | null>(null)

  const move = useCallback(
    (event: PointerEvent) => {
      if (!start.current) return
      const delta = event.clientX - start.current.x
      const next = side === 'left' ? start.current.width + delta : start.current.width - delta
      onChange(Math.min(max, Math.max(min, next)))
    },
    [onChange, min, max, side],
  )

  const stop = useCallback(() => {
    start.current = null
    document.body.classList.remove('resizing')
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
  }, [move, stop])

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      title="drag to resize"
      onPointerDown={(event) => {
        start.current = { x: event.clientX, width }
        document.body.classList.add('resizing')
      }}
      onDoubleClick={() => onChange(side === 'left' ? 268 : 330)}
    />
  )
}
