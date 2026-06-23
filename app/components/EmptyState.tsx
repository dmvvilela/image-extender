'use client'

import { useState } from 'react'
import { Icons } from '@/app/components/icons'
import { Mode } from '@/app/lib/app'

export function EmptyState({
  mode,
  onGenerate,
  onDropFile,
  inputResetKey = 0,
}: {
  mode: Mode
  onGenerate: () => void
  onDropFile: (file: File) => void
  /** Bump to clear the native file input after "New image". */
  inputResetKey?: number
}) {
  const [drag, setDrag] = useState(false)
  const isParallax = mode === 'parallax'
  const pickLabel = isParallax ? 'Drop a starting frame' : 'Drop an image to begin'

  return (
    <div className="flex flex-1 items-center justify-center px-6 pb-8 pt-4">
      <div className="w-full max-w-2xl anim-fade">
        {isParallax && (
          <div className="mb-5 flex items-center justify-center gap-2 text-[12px]">
            <Icons.Mountain size={14} className="text-[color:var(--accent)]" />
            <span style={{ color: 'var(--text-secondary)' }}>
              Parallax mode — start with a base frame, then extend it sideways
              into a long scrolling background.
            </span>
          </div>
        )}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            const file = e.dataTransfer.files?.[0]
            if (file && file.type.startsWith('image/')) onDropFile(file)
          }}
          className="group relative cursor-pointer rounded-[var(--radius-lg)] px-8 py-20 text-center transition-all"
          style={{
            border: `1.5px dashed ${
              drag ? 'var(--accent)' : 'var(--border-strong)'
            }`,
            background: drag ? 'var(--accent-bg)' : 'var(--bg-elev)',
          }}
        >
          {/* Full-size transparent input — clicks land on the native picker directly. */}
          <input
            key={inputResetKey}
            type="file"
            accept="image/*"
            aria-label={pickLabel}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onDropFile(file)
            }}
          />
          <div className="pointer-events-none">
            <div
              className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-110"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--accent)',
              }}
            >
              <Icons.Upload size={24} />
            </div>
            <p className="mb-1.5 text-[15px] font-medium" style={{ color: 'var(--text)' }}>
              {pickLabel}
            </p>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {isParallax
                ? 'A landscape image works best — its height becomes the game resolution'
                : 'PNG, JPG, or WEBP — click anywhere in this area to browse'}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-[13px]">
          <span style={{ color: 'var(--text-muted)' }}>or</span>
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex items-center gap-1.5 font-medium transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            <Icons.Sparkle size={14} />
            {isParallax ? 'generate a 16:9 starter with AI' : 'generate one with AI'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CommandBar — floating bottom bar with prompt + style picker
// ─────────────────────────────────────────────────────────────────────────────
