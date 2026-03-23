interface LogoProps {
  className?: string
  size?: number
}

export default function Logo({ className, size = 36 }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      role="img"
      aria-label="OpenKairo"
      width={size}
      height={size}
      className={className}
    >
      <rect width="32" height="32" rx="7" fill="#2563eb" />
      <g fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.5 8v16" />
        <path d="M10.5 16L22.5 8" />
        <path d="M10.5 16L22.5 24" />
      </g>
    </svg>
  )
}
