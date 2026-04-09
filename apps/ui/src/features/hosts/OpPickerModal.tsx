import { useState, useEffect, useMemo, useCallback } from "react";
import { Modal } from "../layout/Modal";

type Step = "vaults" | "items" | "fields";

interface VaultEntry {
  id: string;
  name: string;
}

interface ItemEntry {
  id: string;
  title: string;
  category?: string;
}

interface FieldEntry {
  id: string;
  label: string;
  type?: string;
}

interface OpPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (reference: string) => void;
}

export function OpPickerModal({ open, onClose, onSelect }: OpPickerModalProps) {
  const [step, setStep] = useState<Step>("vaults");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [items, setItems] = useState<ItemEntry[]>([]);
  const [fields, setFields] = useState<FieldEntry[]>([]);

  const [selectedVault, setSelectedVault] = useState<VaultEntry | null>(null);
  const [selectedItem, setSelectedItem] = useState<ItemEntry | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep("vaults");
      setSearch("");
      setError(null);
      setSelectedVault(null);
      setSelectedItem(null);
      loadVaults();
    }
  }, [open]);

  const loadVaults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.hypershell?.opListVaults?.();
      setVaults(result ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list vaults");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadItems = useCallback(async (vaultId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.hypershell?.opListItems?.({ vaultId });
      setItems(result ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list items");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFields = useCallback(async (itemId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.hypershell?.opGetItemFields?.({ itemId });
      setFields(result ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load item fields");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleVaultSelect = (vault: VaultEntry) => {
    setSelectedVault(vault);
    setStep("items");
    setSearch("");
    loadItems(vault.id);
  };

  const handleItemSelect = (item: ItemEntry) => {
    setSelectedItem(item);
    setStep("fields");
    setSearch("");
    loadFields(item.id);
  };

  const handleFieldSelect = (field: FieldEntry) => {
    if (!selectedVault || !selectedItem) return;
    const reference = `op://${selectedVault.name}/${selectedItem.title}/${field.label}`;
    onSelect(reference);
    onClose();
  };

  const handleBack = () => {
    setSearch("");
    setError(null);
    if (step === "fields") {
      setStep("items");
    } else if (step === "items") {
      setStep("vaults");
    }
  };

  const breadcrumb = useMemo(() => {
    const parts: string[] = ["Vaults"];
    if (selectedVault && step !== "vaults") parts.push(selectedVault.name);
    if (selectedItem && step === "fields") parts.push(selectedItem.title);
    return parts.join(" › ");
  }, [step, selectedVault, selectedItem]);

  const title = step === "vaults"
    ? "Select Vault"
    : step === "items"
      ? "Select Item"
      : "Select Field";

  const filterLower = search.toLowerCase();

  const filteredVaults = useMemo(
    () => vaults.filter((v) => v.name.toLowerCase().includes(filterLower)),
    [vaults, filterLower]
  );
  const filteredItems = useMemo(
    () => items.filter((i) => i.title.toLowerCase().includes(filterLower)),
    [items, filterLower]
  );
  const filteredFields = useMemo(
    () => fields.filter((f) => f.label.toLowerCase().includes(filterLower)),
    [fields, filterLower]
  );

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        {/* Breadcrumb + Back */}
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {step !== "vaults" && (
            <button
              onClick={handleBack}
              className="rounded px-1.5 py-0.5 hover:bg-base-700 hover:text-text-primary transition-colors"
            >
              ← Back
            </button>
          )}
          <span>{breadcrumb}</span>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter..."
          autoFocus
          className="w-full rounded-md border border-border bg-base-900 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
        />

        {/* Error */}
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="py-8 text-center text-xs text-text-muted">Loading…</div>
        )}

        {/* Lists */}
        {!loading && !error && (
          <div className="max-h-64 overflow-y-auto">
            {step === "vaults" &&
              (filteredVaults.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">No vaults found</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {filteredVaults.map((v) => (
                    <li key={v.id}>
                      <button
                        onClick={() => handleVaultSelect(v)}
                        className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-base-700 transition-colors rounded"
                      >
                        {v.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ))}

            {step === "items" &&
              (filteredItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">No items found</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {filteredItems.map((i) => (
                    <li key={i.id}>
                      <button
                        onClick={() => handleItemSelect(i)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-base-700 transition-colors rounded flex items-center justify-between"
                      >
                        <span className="text-text-primary">{i.title}</span>
                        {i.category && (
                          <span className="text-[10px] text-text-muted uppercase tracking-wider">
                            {i.category}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ))}

            {step === "fields" &&
              (filteredFields.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">No fields found</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {filteredFields.map((f) => (
                    <li key={f.id}>
                      <button
                        onClick={() => handleFieldSelect(f)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-base-700 transition-colors rounded flex items-center justify-between"
                      >
                        <span className="text-text-primary">{f.label}</span>
                        {f.type && (
                          <span className="text-[10px] text-text-muted uppercase tracking-wider">
                            {f.type}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
