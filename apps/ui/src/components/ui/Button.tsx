import { forwardRef } from "react";
import {
  buttonClassName,
  type ButtonShape,
  type ButtonSize,
  type ButtonVariant,
} from "./buttonStyles";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      shape = "rounded",
      className = "",
      type = "button",
      ...rest
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`${buttonClassName(variant, size, shape)} ${className}`.trim()}
        {...rest}
      />
    );
  }
);
