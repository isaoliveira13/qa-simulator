/**
 * Le a resposta de um fetch como JSON sem estourar com corpo vazio.
 *
 * `res.json()` numa resposta sem corpo (ex.: 405 da Vercel) estoura com
 * "Failed to execute 'json' on 'Response': Unexpected end of JSON input",
 * que nao diz nada. Aqui o erro sai com o status HTTP, pra dar pra saber o
 * que aconteceu (13/10/2026, bug da prioridade).
 */
export async function lerJson<T = any>(res: Response): Promise<T> {
  const texto = await res.text();
  if (!texto.trim()) {
    throw new Error(`O servidor respondeu ${res.status} sem conteúdo.`);
  }
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new Error(`O servidor respondeu ${res.status} com algo que não é JSON.`);
  }
}
