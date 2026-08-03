import { forwardRef } from "react";
import { selectClassName } from "./fieldStyles";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className = "", ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={`${selectClassName} ${className}`.trim()}
        {...rest}
      />
    );
  }
);
