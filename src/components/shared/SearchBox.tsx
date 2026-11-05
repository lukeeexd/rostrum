import { RiSearchLine } from "@remixicon/react";
import { Input, SearchField } from "react-aria-components";
import { cx } from "@/utils/cx";

/** A compact pill search field (react-aria SearchField: Escape clears it). */
export function SearchBox({
  label,
  placeholder = label,
  value,
  onChange,
  inputClassName = "w-48",
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  /** Width of the text input, e.g. "w-36". */
  inputClassName?: string;
}) {
  return (
    <SearchField
      aria-label={label}
      value={value}
      onChange={onChange}
      className="flex h-8 items-center gap-1.5 rounded-full border border-border-button-default bg-background-primary-default px-3 focus-within:ring-2 focus-within:ring-border-focus-ring"
    >
      <RiSearchLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
      <Input
        placeholder={placeholder}
        className={cx(
          "bg-transparent text-body-medium text-text-primary outline-none placeholder:text-text-tertiary [&::-webkit-search-cancel-button]:hidden",
          inputClassName,
        )}
      />
    </SearchField>
  );
}
