import { useEffect, useMemo, useState } from "react";

export interface DriveSelectorProps {
  currentPath: string;
  onSelect: (drive: string) => void;
}

function getCurrentDrive(path: string): string {
  const match = path.match(/^([a-zA-Z]:\\)/);
  return match?.[1] ?? "/";
}

export function DriveSelector({ currentPath, onSelect }: DriveSelectorProps) {
  const [drives, setDrives] = useState<string[]>([]);
  const currentDrive = useMemo(() => getCurrentDrive(currentPath), [currentPath]);

  useEffect(() => {
    let disposed = false;

    async function loadDrives() {
      try {
        const response = await window.sshterm?.fsGetDrives?.();
        if (disposed) {
          return;
        }

        const nextDrives = response?.drives?.length ? response.drives : [currentDrive];
        setDrives(nextDrives);
      } catch {
        if (!disposed) {
          setDrives([currentDrive]);
        }
      }
    }

    void loadDrives();

    return () => {
      disposed = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- drives rarely change; fetch once on mount

  const options = drives.length > 0 ? drives : [currentDrive];

  return (
    <select
      value={currentDrive}
      onChange={(event) => onSelect(event.target.value)}
      className="rounded border border-base-600 bg-base-800 px-2 py-1 text-sm text-text-primary"
      title="Local drive"
    >
      {options.map((drive) => (
        <option key={drive} value={drive}>
          {drive}
        </option>
      ))}
    </select>
  );
}
