// Recorte de foto de persona (upload do computador) — porta fiel de
// selecionarFotoUpload do coisasdaisa: centraliza o maior quadrado possível
// da imagem original e reduz para 200x200, guardando como data URL JPEG.
// Sem storage externo — o hub guarda a data URL direto na coluna
// personas.foto (mesma abordagem do original).
export function recortarFotoQuadrada(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) {
      reject(new Error("Selecione um arquivo de imagem."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const tam = 200;
        const canvas = document.createElement("canvas");
        canvas.width = tam;
        canvas.height = tam;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Não foi possível processar a imagem."));
          return;
        }
        const lado = Math.min(img.width, img.height);
        const sx = (img.width - lado) / 2;
        const sy = (img.height - lado) / 2;
        ctx.drawImage(img, sx, sy, lado, lado, 0, 0, tam, tam);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/** Iniciais (até 2 letras) pro placeholder de avatar quando não há foto. */
export function iniciaisPersona(nome: string): string {
  const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
