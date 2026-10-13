import {
  useEffect,
  useRef,
  useId,
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
} from "react";
import { X, Search, Eye, Pencil, Plus, FolderOpen } from "lucide-react";
import type { Status } from "../types";
export const statusLabel: Record<Status, string> = {
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};
export function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      <span />
      {statusLabel[status]}
    </span>
  );
}
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      {action && (
        <button className="primary" onClick={onAction}>
          <Plus size={17} />
          {action}
        </button>
      )}
    </div>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
export function RowActions({
  name,
  onView,
  onEdit,
}: {
  name: string;
  onView: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="row-actions">
      <button
        className="icon-button"
        title="Visualizar"
        aria-label={`Visualizar ${name}`}
        onClick={onView}
      >
        <Eye size={17} />
      </button>
      <button className="icon-button" title="Editar" aria-label={`Editar ${name}`} onClick={onEdit}>
        <Pencil size={16} />
      </button>
    </div>
  );
}
export function Empty({
  text = "Nenhum registro encontrado.",
  action,
}: {
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <FolderOpen size={30} />
      <strong>{text}</strong>
      <span>Experimente ajustar os filtros ou cadastrar um novo registro.</span>
      {action}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <h2 id="modal-title">{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        <button className="icon-button" aria-label="Fechar" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  const id = useId();
  return (
    <div className={full ? "field full" : "field"}>
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child) =>
        isValidElement<{ id?: string }>(child) &&
        ["input", "select", "textarea"].includes(String(child.type))
          ? cloneElement(child, { id })
          : child,
      )}
    </div>
  );
}
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail">
      <span>{label}</span>
      <strong>{children || "—"}</strong>
    </div>
  );
}
