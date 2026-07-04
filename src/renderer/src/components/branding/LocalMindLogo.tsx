import { useState } from 'react'

interface LocalMindLogoProps {
  variant: 'light' | 'dark'
  /** When true, prefer the square mark image (for compact spots) if present. */
  markOnly?: boolean
}

/**
 * LocalMind brand logo.
 *
 * Renders the real brand image from `src/renderer/public/` if present
 * (`localmind-logo.png`, or `localmind-mark.png` when markOnly), shown exactly
 * as authored — no redraw, no compression. If the image is missing it falls
 * back to a built-in SVG "LM" monogram so the app never shows a broken logo.
 *
 * To use your own artwork, drop the PNG into:
 *   src/renderer/public/localmind-logo.png   (full logo)
 *   src/renderer/public/localmind-mark.png   (optional square mark)
 */
export function LocalMindLogo({ variant, markOnly = false }: LocalMindLogoProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const src = markOnly ? './localmind-mark.png' : './localmind-logo.png'

  if (!imgFailed) {
    return (
      <img
        src={src}
        alt="LocalMind"
        className="h-full w-auto object-contain select-none"
        draggable={false}
        onError={() => setImgFailed(true)}
      />
    )
  }

  // ── Fallback: built-in metallic "LM" monogram (used only if the image is absent) ──
  const isLight = variant === 'light'
  const wordColor = isLight ? '#1a1c1e' : '#f1f2f4'
  const viewBox = markOnly ? '0 0 180 160' : '0 0 600 160'

  return (
    <svg viewBox={viewBox} role="img" aria-label="LocalMind" className="h-full w-full" preserveAspectRatio="xMinYMid meet">
      <defs>
        <linearGradient id={`lm-metal-${variant}`} x1="0" y1="18" x2="0" y2="142" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fdfdfe" />
          <stop offset="0.18" stopColor="#d6dade" />
          <stop offset="0.5" stopColor="#9aa1ab" />
          <stop offset="0.82" stopColor="#5b626b" />
          <stop offset="1" stopColor="#2f343b" />
        </linearGradient>
      </defs>
      <g stroke="#ffffff" strokeOpacity={isLight ? 0.4 : 0.6} strokeWidth="1.6" strokeLinejoin="round">
        <path d="M16 18 H44 V112 H104 V142 H16 Z" fill={`url(#lm-metal-${variant})`} />
        <path d="M70 142 V26 H92 L122 92 L152 26 H174 V142 H150 V74 L126 124 H118 L94 74 V142 Z" fill={`url(#lm-metal-${variant})`} />
      </g>
      {!markOnly && (
        <text x="220" y="98" fill={wordColor} fontFamily="Manrope, Segoe UI, Arial, sans-serif" fontSize="58" fontWeight="800" letterSpacing="-1">
          LocalMind
        </text>
      )}
    </svg>
  )
}
