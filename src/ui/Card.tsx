import React from 'react'

type CardProps = React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }

export function Card({ className = '', children, ...rest }: CardProps){
  return <div className={`card ${className}`} {...rest}>{children}</div>
}