"use client";

import { useState } from "react";

export function HealthPhoto({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <p className="mt-3 text-sm text-danger">A foto não carregou.</p>;
  }
  return (
    <img
      src={src}
      alt="Foto encontrada na resposta da barricada"
      className="mt-3 max-h-72 rounded-[12px] border border-line bg-background object-contain"
      onError={() => setFailed(true)}
    />
  );
}
