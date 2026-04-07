import { useCallback, useRef } from "react";

interface PaneResizeHandleProps {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
  onResizeEnd: () => void;
}

export function PaneResizeHandle({ direction, onResize, onResizeEnd }: PaneResizeHandleProps) {
  const dragging = useRef(false);
  const startPos = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!dragging.current) return;
        const currentPos = direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentPos - startPos.current;
        startPos.current = currentPos;
        onResize(delta);
      };

      const onMouseUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        onResizeEnd();
      };

      document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [direction, onResize, onResizeEnd]
  );

  const isHorizontal = direction === "horizontal";

  return (
    <div
      onMouseDown={onMouseDown}
      className={[
        "relative flex-shrink-0 group",
        isHorizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
      ].join(" ")}
    >
      {/* Visible line */}
      <div
        className={[
          "absolute bg-border/40 group-hover:bg-accent/50 transition-colors duration-150",
          isHorizontal ? "inset-y-0 left-0 w-px" : "inset-x-0 top-0 h-px",
        ].join(" ")}
      />
      {/* Wider hit area */}
      <div
        className={[
          "absolute",
          isHorizontal ? "inset-y-0 -left-1 -right-1" : "inset-x-0 -top-1 -bottom-1",
        ].join(" ")}
      />
    </div>
  );
}
