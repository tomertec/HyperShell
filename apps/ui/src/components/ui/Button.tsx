import { forwardRef } from "react";
import {
  buttonClassName,
  type ButtonSize,
  type ButtonVariant,
} from "./buttonStyles";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", className = "", type = "button", ...rest },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`${buttonClassName(variant, size)} ${className}`.trim()}
        {...rest}
      />
    );
  }
);
