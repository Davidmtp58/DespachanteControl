import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchOptions, type SearchOption } from "../services/selection-search";

export function SearchSelect({
  label,
  name,
  options,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  name: string;
  options: SearchOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [touched, setTouched] = useState(false);
  const selected = options.find((option) => option.id === value);
  const result = useMemo(() => searchOptions(options, query ?? ""), [options, query]);
  const valid = !!selected && query === null;
  const message =
    value && !selected
      ? "Registro anterior indisponível. Selecione outro."
      : touched && !valid
        ? "Selecione um registro nas sugestões."
        : "";
  useEffect(() => {
    input.current?.setCustomValidity(valid ? "" : "Selecione um registro nas sugestões.");
  }, [valid]);
  useEffect(() => {
    setActive(-1);
  }, [options, query]);
  useEffect(() => {
    list.current
      ?.querySelectorAll<HTMLElement>('[role="option"]')
      [active]?.scrollIntoView({ block: "nearest" });
  }, [active]);
  function choose(option: SearchOption) {
    input.current?.focus();
    onChange(option.id);
    setQuery(null);
    setOpen(false);
    setActive(-1);
    setTouched(false);
  }
  return (
    <div className="field full search-select">
      <label htmlFor={id}>{label}</label>
      <div className="search-select-control">
        <input
          ref={input}
          id={id}
          role="combobox"
          type="text"
          autoComplete="off"
          required
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? `${id}-list` : undefined}
          aria-activedescendant={
            open && active >= 0 && result.visible[active] ? `${id}-option-${active}` : undefined
          }
          aria-invalid={touched && !valid}
          aria-describedby={message ? `${id}-help` : undefined}
          placeholder={placeholder}
          value={query ?? selected?.selectedLabel ?? selected?.label ?? ""}
          onFocus={(e) => {
            e.target.select();
            setActive(-1);
          }}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
            setTouched(true);
          }}
          onInvalid={() => setTouched(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange("");
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setActive(-1);
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive((index) =>
                result.visible.length
                  ? e.key === "ArrowDown"
                    ? (index + 1) % result.visible.length
                    : index <= 0
                      ? result.visible.length - 1
                      : index - 1
                  : -1,
              );
            }
            if (open && (e.key === "Home" || e.key === "End")) {
              e.preventDefault();
              setActive(e.key === "Home" ? 0 : result.visible.length - 1);
            }
            if (e.key === "Enter" && open) {
              e.preventDefault();
              if (result.visible[active]) choose(result.visible[active]);
              else setTouched(true);
            }
          }}
        />
        <input type="hidden" name={name} value={valid ? value : ""} />
        {open && (
          <div className="search-select-dropdown">
            <div
              ref={list}
              id={`${id}-list`}
              role="listbox"
              aria-label={label}
              className="search-select-options"
            >
              {result.visible.map((option, index) => (
                <button
                  type="button"
                  role="option"
                  tabIndex={-1}
                  id={`${id}-option-${index}`}
                  key={option.id}
                  data-value={option.id}
                  aria-selected={value === option.id}
                  className={active === index ? "active" : ""}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(option)}
                >
                  <span>{option.label}</span>
                  {option.preferred && <small>Do cliente solicitante</small>}
                </button>
              ))}
            </div>
            {(result.total === 0 || result.total > result.visible.length) && (
              <small className="search-select-hint" role="status">
                {result.total === 0
                  ? "Nenhum resultado encontrado."
                  : "Refine a busca para encontrar os demais resultados."}
              </small>
            )}
          </div>
        )}
      </div>
      <small id={`${id}-help`} className="search-select-error" role="status">
        {message}
      </small>
    </div>
  );
}
