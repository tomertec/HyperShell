import { forwardRef } from "react";
import { inputClassName } from "./fieldStyles";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leadingIcon, className = "", ...rest },
  ref
) {
  if (!leadingIcon) {
    return (
      <input ref={ref} className={`${inputClassName} ${className}`.trim()} {...rest} />
    );
  }
  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60">
        {leadingIcon}
      </span>
      <input
        ref={ref}
        className={`${inputClassName} pl-8 ${className}`.trim()}
        {...rest}
      />
    </div>
  );
});
