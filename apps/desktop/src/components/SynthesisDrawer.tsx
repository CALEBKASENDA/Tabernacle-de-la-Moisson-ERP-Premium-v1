import { useState, type ReactNode } from 'react';
import type { SynthesisBlock } from '../api/client';
import { fmtMicro } from '../utils/format';

export function SynthesisDrawer({
  title,
  block,
  children,
  defaultOpen = false,
}: {
  title: string;
  block: SynthesisBlock;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const solde = Number(block.soldeUsd);

  return (
    <div className={`synthesis-drawer${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="synthesis-drawer-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="drawer-chevron" aria-hidden />
        <div className="synthesis-drawer-titles">
          <span className="synthesis-drawer-title">{title}</span>
          <span className="synthesis-period">Du {block.dateFrom} au {block.dateTo}</span>
        </div>
        <div className="synthesis-drawer-badges">
          <span className={`drawer-badge ${solde >= 0 ? 'positive' : 'negative'}`}>
            {fmtMicro(block.soldeUsd)} USD
          </span>
          <span className="drawer-badge drawer-badge-muted">{block.nombreOperations} op.</span>
        </div>
      </button>
      {open && <div className="synthesis-drawer-content">{children}</div>}
    </div>
  );
}
