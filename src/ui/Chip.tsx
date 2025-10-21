import React from 'react'

type ChipProps = React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }

export function Chip({ className = '', children, ...rest }: ChipProps){
  return <div className={`chip ${className}`} {...rest}>{children}</div>
}