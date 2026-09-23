import { NextResponse } from "next/server";
import { MAX_ATTACHMENT_BYTES_DEMO } from "@/lib/db";

/**
 * MODO DEMO — no hub original esta rota gerava um token pra o navegador
 * enviar o anexo DIRETO pro Vercel Blob (sem passar pela função serverless,
 * que tem limite de payload). Nesta demo não existe nenhum storage externo:
 * o arquivo é recebido aqui mesmo (multipart/form-data), convertido pra uma
 * data URL (base64) e devolvido pra ser guardado direto no registro do
 * script/rascunho em memória — sem nenhum arquivo saindo do processo.
 *
 * Por isso o limite de tamanho aqui é bem mais apertado que o do produto
 * real (200MB lá, MAX_ATTACHMENT_BYTES_DEMO aqui): cada byte do anexo vira
 * texto na memória do servidor, e essa memória é compartilhada por quem
 * estiver navegando a demo ao mesmo tempo.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Envie o arquivo no campo `file`." }, { status: 400 });
    }

    if (file.size > MAX_ATTACHMENT_BYTES_DEMO) {
      const limiteMb = (MAX_ATTACHMENT_BYTES_DEMO / (1024 * 1024)).toFixed(0);
      return NextResponse.json(
        { error: `Esta é uma demonstração: anexos de até ${limiteMb}MB. Escolha um arquivo menor.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";
    const url = `data:${contentType};base64,${buffer.toString("base64")}`;

    return NextResponse.json({ url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Falha ao processar o anexo." }, { status: 400 });
  }
}
