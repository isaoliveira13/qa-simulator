/**
 * "Pasta memorizada" da importacao em massa (08/09/2026).
 *
 * A ideia: a Isa memoriza as pastas onde salva os testes na maquina dela (sao
 * varias, em lugares diferentes); o navegador guarda uma referencia (handle) de
 * cada uma no IndexedDB, e daí em diante o botao "Varrer" rele todas num clique
 * so, sem abrir seletor de arquivo de novo.
 *
 * Isso usa a File System Access API, que so existe no Chrome/Edge (e nao no
 * Safari nem no Firefox). Onde ela nao existe, a tela cai na selecao manual —
 * por isso `suportaPastaMemorizada()` e checado antes de mostrar o botao.
 *
 * A permissao continua valendo entre sessoes, mas o navegador pode pedir uma
 * reconfirmacao com um clique (é o `requestPermission` abaixo); por isso a
 * varredura precisa acontecer dentro de um clique da usuaria, nunca sozinha ao
 * carregar a pagina.
 */

// --- Tipos minimos da File System Access API -------------------------------
// O lib.dom desta versao do TypeScript nao traz esses tipos completos, entao
// declaramos so o pedaco que usamos.

type Permissao = "granted" | "denied" | "prompt";

interface HandleBase {
  kind: "file" | "directory";
  name: string;
  isSameEntry?: (outro: HandleBase) => Promise<boolean>;
  queryPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<Permissao>;
  requestPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<Permissao>;
}

interface HandleDeArquivo extends HandleBase {
  kind: "file";
  getFile: () => Promise<File>;
}

export interface HandleDePasta extends HandleBase {
  kind: "directory";
  values: () => AsyncIterableIterator<HandleDeArquivo | HandleDePasta>;
}

/** O navegador atual sabe memorizar uma pasta? */
export function suportaPastaMemorizada(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Abre o seletor de pasta do sistema e devolve o handle escolhido. */
export async function escolherPasta(): Promise<HandleDePasta> {
  const picker = (window as unknown as {
    showDirectoryPicker: (opts?: { mode?: "read" | "readwrite" }) => Promise<HandleDePasta>;
  }).showDirectoryPicker;
  return picker({ mode: "read" });
}

// --- Guarda o handle no IndexedDB ------------------------------------------
// localStorage nao serve: o handle e um objeto estruturado, nao texto.

const DB_NOME = "playwright-test-hub";
const STORE = "pastas";
/** Chave nova (lista de pastas). */
const CHAVE_LISTA = "pastasDeTestes";
/** Chave antiga (uma pasta so) — migrada na primeira leitura. */
const CHAVE_ANTIGA = "pastaDeTestes";

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transacao<T>(modo: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return abrirBanco().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, modo).objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      })
  );
}

/** Lista as pastas memorizadas (migra a pasta unica de versoes anteriores). */
export async function pastasGuardadas(): Promise<HandleDePasta[]> {
  try {
    const lista = await transacao<HandleDePasta[] | undefined>("readonly", (store) =>
      store.get(CHAVE_LISTA)
    );
    if (Array.isArray(lista) && lista.length > 0) return lista;

    const antiga = await transacao<HandleDePasta | undefined>("readonly", (store) =>
      store.get(CHAVE_ANTIGA)
    );
    if (antiga) {
      await guardarPastas([antiga]);
      return [antiga];
    }
    return [];
  } catch {
    return [];
  }
}

export async function guardarPastas(handles: HandleDePasta[]): Promise<void> {
  try {
    await transacao<void>("readwrite", (store) => store.put(handles, CHAVE_LISTA));
  } catch {
    // Navegador anonimo / storage bloqueado: as pastas so nao ficam memorizadas.
  }
}

/** Adiciona uma pasta a lista, sem repetir uma que ja esteja la. */
export async function adicionarPasta(handle: HandleDePasta): Promise<HandleDePasta[]> {
  const atuais = await pastasGuardadas();
  for (const existente of atuais) {
    const mesma = existente.isSameEntry
      ? await existente.isSameEntry(handle)
      : existente.name === handle.name;
    if (mesma) return atuais;
  }
  const nova = [...atuais, handle];
  await guardarPastas(nova);
  return nova;
}

/** Tira uma pasta da lista pela posicao. */
export async function removerPasta(indice: number): Promise<HandleDePasta[]> {
  const atuais = await pastasGuardadas();
  const nova = atuais.filter((_, i) => i !== indice);
  await guardarPastas(nova);
  return nova;
}

/**
 * Confere (e, se precisar, pede de novo) a permissao de leitura da pasta.
 * Precisa ser chamado de dentro de um clique, senao o navegador ignora o
 * pedido silenciosamente.
 */
export async function garantirPermissao(handle: HandleDePasta): Promise<boolean> {
  if (!handle.queryPermission) return true;
  const atual = await handle.queryPermission({ mode: "read" });
  if (atual === "granted") return true;
  if (!handle.requestPermission) return false;
  return (await handle.requestPermission({ mode: "read" })) === "granted";
}

export interface ArquivoEncontrado {
  /** Caminho relativo dentro da pasta escolhida (ex.: "hml/HML_isa_login.spec.js"). */
  caminho: string;
  arquivo: File;
}

/**
 * Varre a pasta (e as subpastas) atras de arquivos aceitos pelo filtro.
 * Ignora node_modules, .git e afins pra nao passear pelo projeto inteiro.
 */
export async function varrerPasta(
  handle: HandleDePasta,
  aceita: (nome: string) => boolean,
  prefixo = "",
  profundidade = 0
): Promise<ArquivoEncontrado[]> {
  const IGNORAR = ["node_modules", ".git", ".next", "dist", "build", "playwright-report", "test-results"];
  if (profundidade > 6) return [];

  const achados: ArquivoEncontrado[] = [];
  for await (const filho of handle.values()) {
    if (filho.kind === "file") {
      if (aceita(filho.name)) {
        achados.push({
          caminho: prefixo + filho.name,
          arquivo: await (filho as HandleDeArquivo).getFile(),
        });
      }
    } else if (!IGNORAR.includes(filho.name) && !filho.name.startsWith(".")) {
      achados.push(
        ...(await varrerPasta(filho as HandleDePasta, aceita, `${prefixo}${filho.name}/`, profundidade + 1))
      );
    }
  }
  return achados;
}
