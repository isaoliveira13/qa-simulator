"use client";

import { PopoverMenu } from "./popover-menu";

type Props = {
  allLabel: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  formatOption?: (value: string) => string;
};

/** Dropdown de seleção única com o mesmo visual dos demais popovers do site (em vez do <select> nativo do navegador). */
export function SelectPopover({ allLabel, value, options, onChange, formatOption }: Props) {
  function itemStyle(active: boolean) {
    return {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontSize: 14,
      lineHeight: 1.3,
      padding: "7px 8px",
      borderRadius: 6,
      cursor: "pointer",
      textAlign: "left" as const,
      background: active ? "var(--accent-soft)" : "none",
      color: active ? "var(--accent-dark)" : "var(--text)",
      border: "none",
      fontWeight: active ? 600 : 400,
      width: "100%",
      boxSizing: "border-box" as const,
      fontFamily: "inherit",
    };
  }

  return (
    <PopoverMenu
      panelWidth={220}
      trigger={({ toggle }) => (
        <button
          type="button"
          className="btn-secondary"
          onClick={toggle}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            minWidth: 170,
          }}
        >
          <span>{value ? (formatOption ? formatOption(value) : value) : allLabel}</span>
          <span style={{ opacity: 0.5, fontSize: 11 }}>▾</span>
        </button>
      )}
    >
      {({ close }) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            maxHeight: 280,
            overflowY: "auto",
            overflowX: "hidden",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <button
            type="button"
            className="popover-menu-item"
            onClick={() => {
              onChange("");
              close();
            }}
            style={itemStyle(value === "")}
          >
            {allLabel}
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className="popover-menu-item"
              onClick={() => {
                onChange(opt);
                close();
              }}
              style={itemStyle(value === opt)}
            >
              {formatOption ? formatOption(opt) : opt}
            </button>
          ))}
        </div>
      )}
    </PopoverMenu>
  );
}
