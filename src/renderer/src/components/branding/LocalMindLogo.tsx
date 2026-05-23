interface LocalMindLogoProps {
  variant: 'light' | 'dark'
}

export function LocalMindLogo({ variant }: LocalMindLogoProps) {
  const isLight = variant === 'light'
  const wordColor = isLight ? '#171411' : '#f7f2ec'
  const iconFill = isLight ? '#fbf8f2' : '#12100d'
  const iconStroke = isLight ? '#ddd7cd' : '#403a34'
  const tagline = isLight ? '#e89516' : '#f5a623'

  return (
    <svg
      viewBox="0 0 680 150"
      role="img"
      aria-label="LocalMind Privacy First AI"
      className="h-full w-full"
      preserveAspectRatio="xMinYMid meet"
    >
      <defs>
        <linearGradient id={`localmind-gold-${variant}`} x1="30" y1="25" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={isLight ? '#f7b23a' : '#ffc65a'} />
          <stop offset="1" stopColor={isLight ? '#ec8f0c' : '#f39a13'} />
        </linearGradient>
        {!isLight && (
          <filter id="localmind-soft-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 1 0 0.55 0 0 0.55 0 0 0.1 0 0 0 0 0 0.45 0" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      <rect x="12" y="16" width="118" height="118" rx="32" fill={iconFill} stroke={iconStroke} strokeWidth="1.8" />
      <g
        fill="none"
        stroke={`url(#localmind-gold-${variant})`}
        strokeWidth="5.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={isLight ? undefined : 'url(#localmind-soft-glow)'}
      >
        <path d="M72 44 72 112" />
        <path d="M61 42 45 55 38 77 44 99 60 116" />
        <path d="M61 42 72 51" />
        <path d="M45 55 59 68 72 75" />
        <path d="M38 77 55 88 68 101" />
        <path d="M44 99 60 116" />
        <path d="M72 75 64 88 68 101" />
        <path d="M88 44 88 112" />
        <path d="M99 42 115 55 122 77 116 99 100 116" />
        <path d="M99 42 88 51" />
        <path d="M115 55 101 68 88 75" />
        <path d="M122 77 105 88 92 101" />
        <path d="M116 99 100 116" />
        <path d="M88 75 96 88 92 101" />
      </g>
      <g fill={`url(#localmind-gold-${variant})`} filter={isLight ? undefined : 'url(#localmind-soft-glow)'}>
        {[
          [61, 42, 8], [45, 55, 7], [38, 77, 8], [44, 99, 7], [60, 116, 8],
          [59, 68, 7], [72, 75, 8], [55, 88, 7], [68, 101, 8],
          [99, 42, 8], [115, 55, 7], [122, 77, 8], [116, 99, 7], [100, 116, 8],
          [101, 68, 7], [88, 75, 8], [105, 88, 7], [92, 101, 8],
        ].map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      <text x="218" y="82" fill={wordColor} fontFamily="Manrope, Segoe UI, Arial, sans-serif" fontSize="57" fontWeight="900">
        LocalMind
      </text>
      <text x="221" y="119" fill={tagline} fontFamily="Manrope, Segoe UI, Arial, sans-serif" fontSize="18" fontWeight="700" letterSpacing="8">
        PRIVACY FIRST AI
      </text>
    </svg>
  )
}
