import React from 'react'

type TableProps = React.TableHTMLAttributes<HTMLTableElement> & { children?: React.ReactNode }

export function Table({ className = '', children, ...rest }: TableProps){
  return <table className={`table ${className}`} {...rest}>{children}</table>
}