"use client";

import { useMemo, useState } from "react";

interface ProfilePhotoProps {
  name: string;
  photoUrl: string | null;
}

function getInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("tr-TR");

  return initials || "D";
}

export function ProfilePhoto({ name, photoUrl }: ProfilePhotoProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const initials = useMemo(() => getInitials(name), [name]);

  if (!photoUrl || hasImageError) {
    return (
      <div
        aria-label={`${name} profil fotoğrafı`}
        className="flex h-28 w-28 shrink-0 items-center justify-center rounded-3xl border border-white/30 bg-white/20 text-3xl font-bold text-white shadow-lg backdrop-blur-sm md:h-36 md:w-36 md:text-4xl"
        data-testid="profile-photo-fallback"
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={photoUrl}
      alt={`${name} profil fotoğrafı`}
      className="h-28 w-28 shrink-0 rounded-3xl border border-white/30 object-cover shadow-lg md:h-36 md:w-36"
      data-testid="profile-photo-image"
      loading="eager"
      referrerPolicy="no-referrer"
      onError={() => setHasImageError(true)}
    />
  );
}
