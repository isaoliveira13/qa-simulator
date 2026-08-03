// Personas por usuário — isoladas por sessão. Exige autenticação.
//   GET  -> { personas: [...], tags: [...] }              (lista e etiquetas do usuário logado)
//   PUT  { personas: [...], tags: [...] } -> { personas, tags }  (substitui os dados do usuário)
// Chave no Redis: qa:personas:<email>. Ninguém enxerga os dados de outro usuário.
// "tags" são etiquetas/perfis (ex.: "estudante de medicina") criadas pelo próprio usuário
// para marcar suas personas — não são compartilhadas com outras contas.
const { getAuthedEmail } = require('../lib/authHttp');
const { redis } = require('../lib/kv');

const PERSONAS_PREFIX = 'qa:personas:';

module.exports = async function handler(req, res) {
  try {
    const email = await getAuthedEmail(req);
    if (!email) return res.status(401).json({ erro: 'Não autenticado.' });
    const key = PERSONAS_PREFIX + email;

    if (req.method === 'GET') {
      const dados = await redis.get(key);
      // Formato antigo: apenas o array de personas. Formato novo: { personas, tags }.
      const personas = Array.isArray(dados) ? dados : (Array.isArray(dados && dados.personas) ? dados.personas : []);
      const tags = Array.isArray(dados && dados.tags) ? dados.tags : [];
      return res.status(200).json({ personas, tags });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      if (!Array.isArray(body.personas)) {
        return res.status(400).json({ erro: 'Corpo deve conter "personas" (array).' });
      }
      const tagsLimpas = (Array.isArray(body.tags) ? body.tags : []).slice(0, 100).map((t) => ({
        id: String((t && t.id) || ''),
        nome: String((t && t.nome) || '').slice(0, 60)
      })).filter((t) => t.id && t.nome);
      const idsTagsValidas = new Set(tagsLimpas.map((t) => t.id));
      const limpas = body.personas.slice(0, 200).map((p) => ({
        id: String((p && p.id) || ''),
        nome: String((p && p.nome) || '').slice(0, 200),
        cenario: String((p && p.cenario) || '').slice(0, 5000),
        criterio: String((p && p.criterio) || '').slice(0, 5000),
        foto: String((p && p.foto) || '').slice(0, 300000),
        cpf: String((p && p.cpf) || '').slice(0, 30),
        telefone: String((p && p.telefone) || '').slice(0, 30),
        genero: String((p && p.genero) || '').slice(0, 30),
        email: String((p && p.email) || '').slice(0, 120),
        nascimento: String((p && p.nascimento) || '').slice(0, 20),
        cidade: String((p && p.cidade) || '').slice(0, 120),
        campoExtraNome: String((p && p.campoExtraNome) || '').slice(0, 60),
        campoExtraValor: String((p && p.campoExtraValor) || '').slice(0, 300),
        tags: (Array.isArray(p && p.tags) ? p.tags : []).filter((tid) => idsTagsValidas.has(tid)).slice(0, 20)
      })).filter((p) => p.nome && p.cenario);
      await redis.set(key, { personas: limpas, tags: tagsLimpas });
      return res.status(200).json({ personas: limpas, tags: tagsLimpas });
    }

    return res.status(405).json({ erro: 'Use GET ou PUT.' });
  } catch (e) {
    console.error('[personas]', e && e.stack ? e.stack : e);
    return res.status(500).json({ erro: 'Erro ao acessar personas.' });
  }
};
