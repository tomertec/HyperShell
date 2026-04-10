import { useEffect, useRef } from "react";
import { EditorState as CMState, Compartment } from "@codemirror/state";
import { EditorView, basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { search, openSearchPanel } from "@codemirror/search";
import { indentUnit } from "@codemirror/language";
import { getLanguageExtension } from "../../sftp/utils/languageDetect";
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from "./editorConstants";
import type { EditorState } from "../stores/editorStore";
import type { StoreApi } from "zustand/vanilla";

interface EditorPaneProps {
  store: StoreApi<EditorState>;
  tabId: string;
  content: string;
}

export function EditorPane({ store, tabId, content }: EditorPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const wrapCompartment = useRef(new Compartment());
  const fontCompartment = useRef(new Compartment());
  const indentCompartment = useRef(new Compartment());
  const langCompartment = useRef(new Compartment());

  const storeRef = useRef(store);
  storeRef.current = store;

  // Create editor on mount
  useEffect(() => {
    const { tabs, settings } = storeRef.current.getState();
    const tab = tabs.find((t) => t.id === tabId);
    if (!containerRef.current || !tab) return;

    const fileName = tab.fileName;
    const originalContent = tab.originalContent;
    const updateTab = storeRef.current.getState().updateTab;

    const extensions = [
      basicSetup,
      oneDark,
      search(),
      EditorView.theme({
        "&": { height: "100%" },
        ".cm-scroller": { overflow: "auto" },
      }),
      wrapCompartment.current.of(
        settings.wordWrap ? EditorView.lineWrapping : []
      ),
      fontCompartment.current.of(
        EditorView.theme({
          "&": { fontSize: `${settings.fontSize}px` },
          ".cm-gutters": { fontSize: `${settings.fontSize}px` },
        })
      ),
      indentCompartment.current.of(
        indentUnit.of(" ".repeat(settings.indentSize))
      ),
      langCompartment.current.of([]),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged && !update.selectionSet) return;
        const cursor = update.state.selection.main.head;
        const line = update.state.doc.lineAt(cursor);
        const patch: Record<string, unknown> = {
          cursorLine: line.number,
          cursorCol: cursor - line.from + 1,
        };
        if (update.docChanged) {
          const newContent = update.state.doc.toString();
          patch.dirty = newContent !== originalContent;
          patch.content = newContent;
        }
        updateTab(tabId, patch);
      }),
    ];

    const view = new EditorView({
      state: CMState.create({ doc: content, extensions }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    void getLanguageExtension(fileName).then((ext) => {
      if (ext && viewRef.current) {
        viewRef.current.dispatch({
          effects: langCompartment.current.reconfigure(ext),
        });
      }
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // Reconfigure settings via compartments
  useEffect(() => {
    const { settings } = storeRef.current.getState();
    const unsub = storeRef.current.subscribe((state, prev) => {
      const s = state.settings;
      const p = prev.settings;
      const effects = [];
      if (s.wordWrap !== p.wordWrap) {
        effects.push(wrapCompartment.current.reconfigure(
          s.wordWrap ? EditorView.lineWrapping : []
        ));
      }
      if (s.fontSize !== p.fontSize) {
        effects.push(fontCompartment.current.reconfigure(
          EditorView.theme({
            "&": { fontSize: `${s.fontSize}px` },
            ".cm-gutters": { fontSize: `${s.fontSize}px` },
          })
        ));
      }
      if (s.indentSize !== p.indentSize) {
        effects.push(indentCompartment.current.reconfigure(
          indentUnit.of(" ".repeat(s.indentSize))
        ));
      }
      if (effects.length > 0 && viewRef.current) {
        viewRef.current.dispatch({ effects });
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // Keyboard shortcuts — stable handler, no re-registration on settings change
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && viewRef.current) {
        e.preventDefault();
        openSearchPanel(viewRef.current);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        const { fontSize } = storeRef.current.getState().settings;
        storeRef.current.getState().updateSettings({ fontSize: Math.min(FONT_SIZE_MAX, fontSize + 1) });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        const { fontSize } = storeRef.current.getState().settings;
        storeRef.current.getState().updateSettings({ fontSize: Math.max(FONT_SIZE_MIN, fontSize - 1) });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
    />
  );
}
