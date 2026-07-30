// Personas por usuário — isoladas por sessão. Exige autenticação.
//   GET  -> { personas: [...] }              (lista do usuário logado)
//   PUT  { personas: [...] } -> { personas }  (substitui a lista do usuário)
// Chave no Redis: qa:personas:<email>. Ninguém enxerga a lista de outro usuário.
const { getAuthedEmail } = require('../lib/authHttp');
const { redis } = require('../lib/kv');

const PERSONAS_PREFIX = 'qa:personas:';

module.exports = async function handler(req, res) {
  try {
    const email = await getAuthedEmail(req);
    if (!email) return res.status(401).json({ erro: 'Não autenticado.' });
    const key = PERSONAS_PREFIX + email;

    if (req.method === 'GET') {
      const personas = await redis.get(key);
      return res.status(200).json({ personas: Array.isArray(personas) ? personas : [] });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      if (!Array.isArray(body.personas)) {
        return res.status(400).json({ erro: 'Corpo deve conter "personas" (array).' });
      }
      const limpas = body.personas.slice(0, 200).map((p) => ({
        id: String((p && p.id) || ''),
        nome: String((p && p.nome) || '').slice(0, 200),
        cenario: String((p && p.cenario) || '').slice(0, 5000),
        criterio: String((p && p.criterio) || '').slice(0, 5000)
      })).filter((p) => p.nome && p.cenario);
      await redis.set(key, limpas);
      return res.status(200).json({ personas: limpas });
    }

    return res.status(405).json({ erro: 'Use GET ou PUT.' });
  } catch (e) {
    console.error('[personas]', e && e.stack ? e.stack : e);
    return res.status(500).json({ erro: 'Erro ao acessar personas.' });
  }
};
