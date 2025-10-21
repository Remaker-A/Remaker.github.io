import React from 'react'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: React.ReactNode
}

export function Button({ className = '', children, ...rest }: ButtonProps) {
  return (
    <button className={`btn ${className}`} {...rest}>{children}</button>
  )
}