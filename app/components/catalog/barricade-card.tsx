"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BarricadeMark } from "@/app/components/catalog/barricade-mark";

export type BarricadeCardData = {
  id: number;
  name: string;
  apiMethod: string;
  apiUrl: string;
  slug: string;
  usedLabel: string;
  checksLabel: string;
  logoVersion: string | null;
  statusLabel: string;
  statusTone: "muted" | "success" | "warning" | "danger";
};

export function BarricadeCard({ item }: { item: BarricadeCardData }) {
  const path = `/api/barricada/${item.slug}`;
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function close(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  function copyPath() {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
    const fallback = () => {
      const area = document.createElement("textarea");
      area.value = path;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    };
    const write = navigator.clipboard?.writeText(path);
    if (!write) {
      fallback();
      return;
    }
    void Promise.race([
      write,
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 400)),
    ]).catch(fallback);
  }

  return (
    <article className="api-card">
      <header className="api-card__header">
        <div className="api-card__icon">
          {item.logoVersion ? (
            <BarricadeMark id={item.id} updatedAt={item.logoVersion} />
          ) : (
            <span className="api-card__mark">{item.name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="api-card__info">
          <h3 className="api-card__title">{item.name}</h3>
          <div className="api-card__url">
            <span className={item.apiMethod === "POST" ? "api-method" : "api-method api-method--other"}>{item.apiMethod}</span>
            <span title={item.apiUrl}>{item.apiUrl}</span>
          </div>
        </div>
        <div className="api-card__menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="api-card__menu"
            aria-label="Mais opções"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <DotsIcon />
          </button>
          {menuOpen ? (
            <div className="api-card__dropdown">
              <Link href={`/barricadas/${item.id}`} onClick={() => setMenuOpen(false)}>Ver</Link>
              <Link href={`/barricadas/${item.id}/editar`} onClick={() => setMenuOpen(false)}>Editar</Link>
            </div>
          ) : null}
        </div>
      </header>

      <div className="api-route">
        <code className="api-route__path">{path}</code>
        <button type="button" className="api-route__copy" onClick={copyPath} aria-label={copied ? "Rota copiada" : "Copiar rota"}>
          <CopyIcon />
        </button>
      </div>
      {copied ? <p className="api-route__feedback">Rota copiada.</p> : null}

      <div className="api-card__stats">
        <div className="api-card__stat">
          <StackIcon />
          <span>{item.usedLabel} hoje · {item.checksLabel}</span>
        </div>
        <div className="api-card__stat">
          <span className={`api-status api-status--${item.statusTone}`} />
          <span>{item.statusLabel}</span>
        </div>
      </div>

      <footer className="api-card__actions">
        <Link href={`/barricadas/${item.id}`} className="api-button" style={{ border: "1px solid #6d82a3" }}>
          <EyeIcon />
          Ver
        </Link>
        <Link href={`/barricadas/${item.id}/editar`} className="api-button api-button--edit">
          <PencilIcon />
          Editar
        </Link>
      </footer>
    </article>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="6" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="18" r="1.4" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="8" y="8" width="10" height="12" rx="2" />
      <path d="M6 16H5.5A1.5 1.5 0 0 1 4 14.5v-9A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V6" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <ellipse cx="12" cy="7" rx="7" ry="3" />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
      <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M2.5 12S6.5 6.5 12 6.5 21.5 12 21.5 12 17.5 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M4 20h4.2L19.2 9a1.8 1.8 0 0 0 0-2.5L17.5 4.8a1.8 1.8 0 0 0-2.5 0L4 15.8V20Z" />
      <path d="M13.8 6.2 17.8 10.2" />
    </svg>
  );
}
