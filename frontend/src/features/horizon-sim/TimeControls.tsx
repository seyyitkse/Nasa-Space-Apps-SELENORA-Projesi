import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input, Label, NativeSelect } from '@/components/ui/input'
import { formatUtc } from '@/lib/format'
import { useWorkspaceStore } from '@/stores/workspaceStore'

import { type EpochState, nearestSampleIndex } from '../analysis-data/adapter'

/** `2026-12-01T05:00` (UTC) for <input type="datetime-local">. */
export function toUtcInput(t: number): string {
  return new Date(t).toISOString().slice(0, 16)
}

export function fromUtcInput(v: string): number | null {
  const ms = Date.parse(`${v}:00Z`)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Playback steps through *sampled epochs only*. Jumping to an arbitrary UTC
 * time snaps to the nearest sample and says so.
 */
export function TimeControls({ epochs, index, onIndex }: { epochs: EpochState[]; index: number; onIndex: (i: number) => void }) {
  const { t } = useTranslation()
  const playing = useWorkspaceStore((s) => s.playing)
  const setPlaying = useWorkspaceStore((s) => s.setPlaying)
  const [speed, setSpeed] = useState(1)
  const [jump, setJump] = useState('')
  const [snapNote, setSnapNote] = useState<string | null>(null)
  const last = epochs.length - 1
  const cur = epochs[index]

  useEffect(() => {
    if (!playing) return
    if (index >= last) {
      setPlaying(false)
      return
    }
    const id = window.setTimeout(() => onIndex(Math.min(last, index + speed)), 450)
    return () => window.clearTimeout(id)
  }, [playing, index, last, speed, onIndex, setPlaying])

  useEffect(() => () => setPlaying(false), [setPlaying])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="sel-eyebrow text-[10px]">{t('sim.epoch')}</div>
          <div className="font-mono text-base text-fg" aria-live="polite">
            {cur ? formatUtc(cur.t) : '—'}
          </div>
          <div className="font-mono text-[11px] text-fg-3">
            {t('sim.sampleOf', { i: index + 1, n: epochs.length })}
          </div>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label={t('sim.playback')}>
          <Button size="icon" variant="ghost" onClick={() => onIndex(0)} disabled={index <= 0} aria-label={t('sim.first')}>
            <ChevronFirst />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onIndex(index - 1)} disabled={index <= 0} aria-label={t('sim.prev')}>
            <ChevronLeft />
          </Button>
          <Button
            size="icon"
            variant={playing ? 'secondary' : 'primary'}
            onClick={() => {
              if (!playing && index >= last) onIndex(0)
              setPlaying(!playing)
            }}
            disabled={epochs.length < 2}
            aria-label={playing ? t('sim.pause') : t('sim.play')}
            aria-pressed={playing}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onIndex(index + 1)} disabled={index >= last} aria-label={t('sim.next')}>
            <ChevronRight />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onIndex(last)} disabled={index >= last} aria-label={t('sim.last')}>
            <ChevronLast />
          </Button>
          <NativeSelect
            aria-label={t('sim.speed')}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="ml-1 h-9 w-[92px] text-xs"
          >
            {[1, 3, 6, 12].map((s) => (
              <option key={s} value={s}>
                {t('sim.speedOption', { n: s })}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, last)}
        step={1}
        value={index}
        onChange={(e) => onIndex(Number(e.target.value))}
        aria-label={t('sim.slider')}
        aria-valuetext={cur ? formatUtc(cur.t) : undefined}
        className="w-full cursor-pointer accent-[#56D9E9]"
      />
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const ms = fromUtcInput(jump)
          if (ms === null || epochs.length === 0) return
          const i = nearestSampleIndex(epochs, ms)
          onIndex(i)
          const snapped = epochs[i]!.t
          setSnapNote(snapped === ms ? null : t('sim.snapped', { time: formatUtc(snapped) }))
        }}
      >
        <div>
          <Label htmlFor="sim-jump">{t('sim.jumpTo')}</Label>
          <Input
            id="sim-jump"
            type="datetime-local"
            className="w-[210px]"
            value={jump}
            min={epochs[0] ? toUtcInput(epochs[0].t) : undefined}
            max={epochs[last] ? toUtcInput(epochs[last].t) : undefined}
            onChange={(e) => setJump(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!jump}>
          {t('sim.go')}
        </Button>
        {snapNote && <p className="w-full text-[11px] text-warning">{snapNote}</p>}
      </form>
    </div>
  )
}
