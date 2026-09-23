"use client";

import { useCallback, useEffect, useState } from "react";
import { AvatarCadastro } from "./types";

/**
 * O cadastro de avatares (aba "Avatares") do lado do navegador.
 *
 * Toda tela que mostra avatar lê daqui: o switch do card, o assistente e a
 * própria aba. Enquanto a resposta não chega, a lista é vazia de propósito —
 * o switch cai na rede de segurança dos rótulos já usados pelas simulações
 * (ver avataresConhecidos em lib/destinos.ts), em vez de piscar uma lista
 * fixa que pode não ser a dela.
 */
export function useAvatares() {
  const [avatares, setAvatares] = useState<AvatarCadastro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const res = await fetch("/api/avatars");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAvatares(data.avatares || []);
      setErro(null);
    } catch (e: any) {
      setErro(e.message || String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { avatares, carregando, erro, setErro, recarregar };
}
