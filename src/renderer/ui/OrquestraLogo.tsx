import type { ComponentProps } from 'react'
import orquestraLogo from '../assets/orquestra.logo.png'

interface OrquestraLogoProps extends ComponentProps<'img'> {
  size?: number
  weight?: string
}

export function OrquestraLogo({ size = 24, className, weight: _weight, alt = 'Orquestra', style, ...rest }: OrquestraLogoProps) {
  return (
    <img
      src={orquestraLogo}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain', ...style }}
      {...rest}
    />
  )
}
