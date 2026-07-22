import type { ReactNode } from "react";

/**
 * A plain modal shell shared by the add/edit form and the delete confirm.
 * No dependency for this — a fixed-position backdrop and a centred panel is
 * all either use case needs.
 */
export function Modal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
