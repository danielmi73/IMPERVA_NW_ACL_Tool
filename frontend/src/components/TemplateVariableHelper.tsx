import React, { RefObject, useState } from 'react';

export interface TemplateVariable {
  key: string;      // e.g. "prefix"
  label: string;    // e.g. "Prefix / CIDR"
  description: string;
}

export const NOTIFICATION_VARIABLES: TemplateVariable[] = [
  { key: 'event_type',     label: 'Event Type',      description: '"Attack Started" or "Attack Stopped"' },
  { key: 'prefix',         label: 'Prefix / CIDR',   description: 'The attacked IP prefix, e.g. 203.0.113.0/24' },
  { key: 'acl_name',       label: 'ACL Name',         description: 'Human-readable name of the assigned ACL policy' },
  { key: 'acl_id',         label: 'ACL ID',           description: 'Imperva ACL policy ID' },
  { key: 'customer_name',  label: 'Customer Name',    description: 'Customer display name' },
  { key: 'detected_at',    label: 'Detected At',      description: 'Detection datetime in UTC' },
  { key: 'peak_mbps',      label: 'Peak Mbps',        description: 'Peak attack size in Mbps' },
  { key: 'threshold_mbps', label: 'Threshold Mbps',   description: 'Configured threshold (blank if not set)' },
];

interface Props {
  /** Ref to the textarea/input where variables are inserted at cursor */
  textareaRef: RefObject<HTMLTextAreaElement | HTMLInputElement>;
  /** Called after insert so parent can sync state */
  onInsert?: (newValue: string) => void;
  /** Override the default variable list */
  variables?: TemplateVariable[];
  /** Whether to show/hide the panel by default */
  defaultOpen?: boolean;
}

export default function TemplateVariableHelper({
  textareaRef,
  onInsert,
  variables = NOTIFICATION_VARIABLES,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const insertVariable = (key: string) => {
    const el = textareaRef.current;
    if (!el) return;

    const token = `{{${key}}}`;
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    const newValue = el.value.slice(0, start) + token + el.value.slice(end);

    // Update the DOM value
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set ?? Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeInputValueSetter?.call(el, newValue);
    el.dispatchEvent(new Event('input', { bubbles: true }));

    // Restore cursor after the inserted token
    const cursorPos = start + token.length;
    setTimeout(() => el.setSelectionRange(cursorPos, cursorPos), 0);
    el.focus();

    onInsert?.(newValue);
  };

  return (
    <div className="template-var-helper">
      <button
        type="button"
        className="template-var-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="template-var-toggle-icon">{open ? '▾' : '▸'}</span>
        Available Variables
      </button>

      {open && (
        <div className="template-var-panel">
          <div className="template-var-chips">
            {variables.map(v => (
              <button
                key={v.key}
                type="button"
                className="template-var-chip"
                title={v.description}
                onClick={() => insertVariable(v.key)}
              >
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>
          <div className="template-var-table">
            {variables.map(v => (
              <div key={v.key} className="template-var-row">
                <code className="template-var-code">{`{{${v.key}}}`}</code>
                <span className="template-var-label">{v.label}</span>
                <span className="template-var-desc">{v.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
