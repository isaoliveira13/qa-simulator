import { NextRequest, NextResponse } from "next/server";
import { registrarAnexo } from "@/lib/db";
import { TAMANHO_MAX_ANEXO, tipoAnexoAceito } from "@/lib/anexosTurno";

/**
 * Registra um anexo de turno (imagem/PDF). MODO DEMO: recebe só nome, tipo e
 * tamanho — o arquivo em si nunca sai do navegador de quem visita.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nome = String(body.nome || "").trim().slice(0, 255);
    const tipo = String(body.tipo || "").trim().toLowerCase();
    const tamanho = Number(body.tamanho) || 0;

    if (!nome) {
      return NextResponse.json({ error: "Nome do arquivo é obrigatório." }, { status: 400 });
    }
    if (!tipoAnexoAceito(tipo)) {
      return NextResponse.json({ error: "Só dá pra anexar imagem (PNG, JPG, WEBP, GIF) ou PDF." }, { status: 400 });
    }
    if (tamanho > TAMANHO_MAX_ANEXO) {
      return NextResponse.json({ error: "Arquivo maior que 20 MB." }, { status: 400 });
    }

    const anexo = await registrarAnexo({ nome, tipo, tamanho });
    return NextResponse.json({ anexo });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
