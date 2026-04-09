import type { SerialProfileRecord } from "@hypershell/shared";

export interface SidebarSerialListProps {
  profiles: SerialProfileRecord[];
  onConnect: (profile: SerialProfileRecord) => void;
  onEdit: (profile: SerialProfileRecord) => void;
}

export function SidebarSerialList({ profiles, onConnect, onEdit }: SidebarSerialListProps) {
  return (
    <div className="space-y-0.5 px-1">
      {profiles.map((profile) => (
        <button
          key={profile.id}
          onDoubleClick={() => onConnect(profile)}
          onClick={() => onEdit(profile)}
          className="relative flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-left text-sm transition-all duration-150 group hover:bg-base-700/60 border-l-2 border-transparent hover:border-accent/50"
          title={`${profile.path} · ${profile.baudRate} — double-click to connect`}
        >
          <span className="relative shrink-0 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-text-muted/60 group-hover:bg-success transition-colors duration-200" />
            <span className="absolute inset-0 w-2 h-2 rounded-full bg-success/0 group-hover:bg-success/30 blur-[3px] transition-all duration-200" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-text-primary truncate text-[13px] font-medium leading-tight">{profile.name}</div>
            <div className="text-text-muted text-[11px] truncate leading-tight mt-0.5">
              {profile.path} · {profile.baudRate}
            </div>
          </div>
        </button>
      ))}
      {profiles.length === 0 && (
        <div className="px-2 py-6 text-xs text-text-muted text-center">
          No serial profiles yet
        </div>
      )}
    </div>
  );
}
