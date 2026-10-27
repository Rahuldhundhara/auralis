import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Check,
  Info,
  Loader2,
  Music2,
  Sparkles,
  X,
} from 'lucide-react';
import { create } from 'zustand';
import { initials } from '../lib/format';

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  active?: boolean;
  variant?: 'ghost' | 'surface' | 'accent' | 'danger';
  children: ReactNode;
}

export function IconButton({
  label,
  size = 'md',
  active,
  variant = 'ghost',
  children,
  className = '',
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-btn icon-btn-${size} icon-btn-${variant} ${active ? 'is-active' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button type="button" className={`btn btn-${variant} btn-${size} ${className}`} {...props}>
      {icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Artwork                                                             */
/* ------------------------------------------------------------------ */

export function Artwork({
  src,
  alt,
  round,
  className = '',
  style,
  size,
}: {
  src?: string;
  alt: string;
  round?: boolean;
  className?: string;
  style?: CSSProperties;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div
      className={`artwork ${round ? 'is-round' : ''} ${className}`}
      style={{ ...(size ? { width: size, height: size } : {}), ...style }}
    >
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <div className="artwork-fallback" aria-hidden="true">
          <span>{initials(alt)}</span>
          <Music2 size={18} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Range slider                                                        */
/* ------------------------------------------------------------------ */

interface RangeProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number) => void;
  showFill?: boolean;
  buffer?: number;
}

export function Range({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onValueChange,
  className = '',
  style,
  buffer,
  ...props
}: RangeProps) {
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const bufferPercent =
    typeof buffer === 'number' && max > min ? ((buffer - min) / (max - min)) * 100 : percent;
  return (
    <input
      type="range"
      className={`range ${className}`}
      min={min}
      max={max}
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => onValueChange(Number(event.target.value))}
      style={{
        ['--range-fill' as any]: `${Math.min(100, Math.max(0, percent))}%`,
        ['--range-buffer' as any]: `${Math.min(100, Math.max(0, bufferPercent))}%`,
        ...style,
      }}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function Spinner({ size = 18, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`spin ${className}`} aria-label="Loading" />;
}

export function ExplicitBadge() {
  return (
    <span className="explicit-badge" title="Explicit">
      E
    </span>
  );
}

export function Chips({
  items,
  selected,
  onSelect,
}: {
  items: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="chips" role="tablist">
      {items.map((item) => (
        <button
          type="button"
          key={item}
          role="tab"
          aria-selected={selected === item}
          className={`chip ${selected === item ? 'is-selected' : ''}`}
          onClick={() => onSelect(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? 'is-compact' : ''}`}>
      <div className="empty-icon">{icon || <Music2 size={26} />}</div>
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function PageSkeleton() {
  return (
    <div className="page-skeleton">
      <Skeleton className="skeleton-title" />
      <div className="skeleton-row">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="skeleton-card" key={index}>
            <Skeleton className="skeleton-art" />
            <Skeleton className="skeleton-line" />
            <Skeleton className="skeleton-line short" />
          </div>
        ))}
      </div>
      <Skeleton className="skeleton-title small" />
      <div className="skeleton-list">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton className="skeleton-list-row" key={index} />
        ))}
      </div>
    </div>
  );
}

export function ErrorPanel({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-panel">
      <AlertCircle size={28} />
      <div>
        <h3>Something went wrong</h3>
        <p>{message}</p>
      </div>
      {retry ? (
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 480,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={id} style={{ width }}>
        <div className="modal-head">
          <div>
            {title ? <h2 id={id}>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <IconButton label="Close" onClick={onClose} size="sm">
            <X size={18} />
          </IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

import { useUiStore } from '../stores/ui';

export function Toasts() {
  const toasts = useUiStore((state) => state.toasts);
  const dismiss = useUiStore((state) => state.dismissToast);
  if (!toasts.length) return null;
  return createPortal(
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div className={`toast toast-${item.kind}`} key={item.id}>
          <div className="toast-icon">
            {item.kind === 'success' ? <Check size={16} /> : item.kind === 'error' ? <AlertCircle size={16} /> : item.kind === 'info' ? <Info size={16} /> : <Sparkles size={16} />}
          </div>
          <span>{item.message}</span>
          {item.action ? (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                item.action?.onClick();
                dismiss(item.id);
              }}
            >
              {item.action.label}
            </button>
          ) : null}
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(item.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Context menu                                                        */
/* ------------------------------------------------------------------ */

import type { MenuItem } from '../stores/ui';

export function ContextMenu() {
  const menu = useUiStore((state) => state.menu);
  const close = useUiStore((state) => state.closeMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [submenu, setSubmenu] = useState<number | null>(null);

  useEffect(() => {
    if (!menu) return;
    setPosition({ x: menu.x, y: menu.y });
    setSubmenu(null);
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [menu, close]);

  useEffect(() => {
    if (!menu || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = Math.min(menu.x, window.innerWidth - rect.width - 12);
    const y = Math.min(menu.y, window.innerHeight - rect.height - 12);
    setPosition({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [menu]);

  if (!menu) return null;

  const renderItem = (item: MenuItem, index: number) => {
    if (item.separator) return <div className="menu-sep" key={`sep-${index}`} />;
    const Icon = item.icon;
    return (
      <div className="menu-item-wrap" key={`${item.label}-${index}`} onMouseEnter={() => setSubmenu(item.submenu?.length ? index : null)}>
        <button
          type="button"
          className={`menu-item ${item.danger ? 'is-danger' : ''} ${item.disabled ? 'is-disabled' : ''}`}
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            item.onClick?.();
            if (!item.submenu?.length) close();
          }}
        >
          <span className="menu-icon">{Icon ? <Icon size={16} /> : item.checked ? <Check size={16} /> : null}</span>
          <span className="menu-label">{item.label}</span>
          {item.submenu?.length ? <span className="menu-arrow">›</span> : null}
        </button>
        {item.submenu?.length && submenu === index ? (
          <div className="submenu">
            {item.submenu.map((child, childIndex) => renderItem(child, childIndex))}
          </div>
        ) : null}
      </div>
    );
  };

  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.items.map(renderItem)}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Lightweight store for scroll restoration                            */
/* ------------------------------------------------------------------ */

interface ScrollState {
  positions: Record<string, number>;
  setPosition: (key: string, value: number) => void;
}

export const useScrollStore = create<ScrollState>((set) => ({
  positions: {},
  setPosition: (key, value) => set((state) => ({ positions: { ...state.positions, [key]: value } })),
}));
