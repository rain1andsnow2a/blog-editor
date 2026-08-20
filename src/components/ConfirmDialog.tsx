interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** 危险操作用朱色确认钮 */
  danger?: boolean;
  /** 操作进行中：按钮 loading 态，防重复点击 */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = '取消',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md bg-paper rounded-md shadow-2xl border border-hairline">
        <div className="px-6 py-4 border-b border-hairline">
          <h2 className="text-lg font-medium tracking-wider text-ink">{title}</h2>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-ink-2 leading-relaxed">{body}</p>
        </div>
        <div className="px-6 py-4 border-t border-hairline flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm text-ink-2 hover:text-ink hover:bg-paper-deep rounded-sm transition-colors disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 text-sm rounded-sm transition-colors disabled:opacity-50 ${
              danger
                ? 'bg-seal text-paper hover:bg-seal/90'
                : 'bg-ink text-paper hover:bg-neutral-800'
            }`}
          >
            {busy ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
