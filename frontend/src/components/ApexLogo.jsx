import React from 'react'
import BRAND from '../config/brand.js'
import logoSrc from '../assets/apex-logo.png'

export default function ApexLogo({ size = 32, showWordmark = true, className = '', style = {} }) {
  return (
    <div
      className={`apex-logo-container ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.max(8, Math.round(size * 0.28)),
        userSelect: 'none',
        ...style
      }}
    >
      <img
        src={logoSrc}
        alt={`${BRAND.name} Logo`}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          borderRadius: Math.max(6, Math.round(size * 0.22)),
          flexShrink: 0
        }}
      />

      {showWordmark && (
        <span
          style={{
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: Math.round(size * 0.72),
            fontWeight: 800,
            letterSpacing: '0.08em',
            background: 'linear-gradient(135deg, #ffffff 30%, #a0c4ff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textTransform: 'uppercase',
            lineHeight: 1
          }}
        >
          {BRAND.name}
        </span>
      )}
    </div>
  )
}
