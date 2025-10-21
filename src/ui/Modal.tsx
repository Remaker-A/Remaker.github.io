import React from 'react'

type ModalProps = {
  open: boolean
  onClose?: () => void
  children?: React.ReactNode
}

export function Modal({ open, onClose, children }: ModalProps){
  if (!open) return null
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}