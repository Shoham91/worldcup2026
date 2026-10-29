"use client";

export default function RandomButton({
  onClick,
  full = false,
  title = "Random",
}: {
  onClick: () => void;
  full?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded-md bg-fuchsia-100 font-semibold text-fuchsia-700 transition hover:bg-fuchsia-200 ${
        full ? "px-4 py-2 text-sm" : "px-2 py-1 text-xs"
      }`}
    >
      🎲 Random{full ? " all" : ""}
    </button>
  );
}
