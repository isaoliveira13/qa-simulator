import { NextRequest, NextResponse } from "next/server";
import { listScripts, saveScript } from "@/lib/db";
import { deleteAttachment } from "@/lib/github";
import { Framework, ScheduleConfig, ScriptEntry } from "@/lib/types";

export async function GET() {
  try {
    const scripts = await listScripts();
    return NextResponse.json({ scripts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const {
      id: existingId,
      name,
      avatar,
      ambiente,
      cenario,
      tela,
      tags,
      framework,
      content,
      attachment,
      schedule,
    }: {
      id?: string;
      name: string;
      avatar: string;
      ambiente: string;
      cenario: string;
      tela?: string | null;
      tags: string;
      framework: Framework;
      content: string;
      attachment?: { filename: string; url: string };
      schedule?: ScheduleConfig;
    } = await req.json();

    if (!name || !avatar || !ambiente || !cenario || !framework || !content) {
      return NextResponse.json(
        { error: "Preencha nome, avatar, ambiente, cenario, framework e o conteudo do script." },
        { status: 400 }
      );
    }

    const ext = framework === "playwright" ? "spec.ts" : "cy.ts";
    const baseDir = framework === "playwright" ? "tests-playwright" : "tests-cypress";

    let id = existingId;
    let path: string;
    let existingEntry: ScriptEntry | undefined;

    if (id) {
      existingEntry = (await listScripts()).find((s) => s.id === id);
      if (!existingEntry) {
        return NextResponse.json({ error: "Script nao encontrado para edicao." }, { status: 404 });
      }
      path = existingEntry.path;
    } else {
      id = `${slugify(avatar)}-${slugify(ambiente)}-${slugify(cenario)}-${Date.now().toString(36)}`;
      path = `${baseDir}/${slugify(avatar)}/${slugify(ambiente)}/${slugify(cenario)}.${ext}`;
    }

    const entry: ScriptEntry = {
      id,
      name,
      avatar,
      ambiente,
      cenario,
      ...(tela ? { tela } : {}),
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      framework,
      path,
      // Preserva a data de criacao original ao editar, em vez de sobrescrever.
      createdAt: existingEntry?.createdAt || new Date().toISOString(),
      // Preserva o anexo existente ao editar, a nao ser que um novo seja enviado abaixo.
      ...(existingEntry?.attachmentPath ? { attachmentPath: existingEntry.attachmentPath } : {}),
      // Preserva a ordem manual ao editar; script novo entra no topo (epoch de
      // agora, mesma leitura de created_at). saveScript grava isto so no
      // insert — no upsert por edicao, o UPDATE deliberadamente nao toca em
      // ordem, entao o arrastar-soltar nunca e desfeito por uma edicao.
      ordem: existingEntry?.ordem ?? Date.now() / 1000,
    };

    // O anexo desta demo já chegou como data URL (ver app/api/blob-upload) —
    // aqui só guardamos a URL/caminho recebido.
    if (attachment?.url) {
      if (existingEntry?.attachmentPath && existingEntry.attachmentPath !== attachment.url) {
        await deleteAttachment(existingEntry.attachmentPath);
      }
      entry.attachmentPath = attachment.url;
    }

    if (schedule) {
      entry.schedule = schedule;
    }

    await saveScript(entry, content);
    return NextResponse.json({ entry });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
