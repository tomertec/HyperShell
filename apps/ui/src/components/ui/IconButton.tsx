import { forwardRef } from "react";
import { iconButtonClassName, type IconButtonVariant } from "./buttonStyles";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { variant = "ghost", className = "", type = "button", ...rest },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`${iconButtonClassName(variant)} ${className}`.trim()}
        {...rest}
      />
    );
  }
);
