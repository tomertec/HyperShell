import { getFileIcon } from "../utils/fileUtils";

interface FileIconProps {
  name: string;
  isDirectory: boolean;
  className?: string;
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      className={`text-accent ${className ?? ""}`}
    >
      <path
        d="M1.5 3.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function FileBaseIcon({
  className,
  children
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-text-muted ${className ?? ""}`}
    >
      <path d="M4 1.5a.5.5 0 0 0-.5.5v12a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V5.5L9 1.5H4z" />
      <path d="M9 1.5v4h3.5" />
      {children}
    </svg>
  );
}

function FileCodeIcon({ className }: { className?: string }) {
  return (
    <FileBaseIcon className={className}>
      <path d="M6 8.5l-1.5 1.5L6 11.5" />
      <path d="M10 8.5l1.5 1.5L10 11.5" />
    </FileBaseIcon>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <FileBaseIcon className={className}>
      <path d="M5.5 8h5" />
      <path d="M5.5 10h3.5" />
    </FileBaseIcon>
  );
}

function FileImageIcon({ className }: { className?: string }) {
  return (
    <FileBaseIcon className={className}>
      <path d="M5 12l2.5-3 1.5 1.5L11.5 7.5" />
    </FileBaseIcon>
  );
}

function FileArchiveIcon({ className }: { className?: string }) {
  return (
    <FileBaseIcon className={className}>
      <path d="M7 4h2" />
      <path d="M7 6h2" />
      <path d="M7 8h2" />
      <path d="M7 10h2" />
    </FileBaseIcon>
  );
}

function BlankFileIcon({ className }: { className?: string }) {
  return <FileBaseIcon className={className} />;
}

const ICON_COMPONENTS: Record<
  string,
  React.FC<{ className?: string }>
> = {
  folder: FolderIcon,
  file: BlankFileIcon,
  "file-code": FileCodeIcon,
  "file-text": FileTextIcon,
  "file-image": FileImageIcon,
  "file-archive": FileArchiveIcon
};

export function FileIcon({ name, isDirectory, className }: FileIconProps) {
  const iconType = getFileIcon(name, isDirectory);
  const Icon = ICON_COMPONENTS[iconType] ?? BlankFileIcon;
  return <Icon className={className} />;
}
