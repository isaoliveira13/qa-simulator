"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Como `useState`, mas sincroniza o valor com o `sessionStorage` do navegador.
 *
 * O App Router do Next.js desmonta o componente da página a cada troca de
 * rota — isso é o que fazia buscas/filtros "sumirem" ao trocar de aba dentro
 * do site. Guardando o valor no sessionStorage (por uma chave própria de cada
 * tela), o estado é restaurado ao remontar a página, mesmo já tendo passado
 * por outra tela no meio do caminho. Como é sessionStorage (não localStorage),
 * o valor não sobrevive a fechar a aba do navegador — só a navegação interna.
 *
 * @param key chave única da tela + campo (ex.: "biblioteca:search")
 * @param initialValue valor usado quando ainda não há nada salvo
 */
export function usePersistedState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const hydrated = useRef(false);

  // Hidrata a partir do sessionStorage só no cliente, depois do primeiro
  // render (evita mismatch de SSR — o servidor sempre renderiza com o valor
  // inicial).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // sessionStorage indisponível (modo privado, etc.) — segue com o valor inicial.
    } finally {
      hydrated.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // idem — falha silenciosa, não é crítico.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
