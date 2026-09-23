/**
 * Aviso fixo de que este é o modo DEMO do coisasdaisa (versão de portfólio).
 * Fica visível em toda tela, de propósito — a Isa pediu explicitamente que
 * ficasse claro que nem toda função mostrada aqui está de fato ativa, e que
 * nenhuma simulação aqui é real.
 */
export function DemoBanner() {
  return (
    <div className="demo-banner" role="note">
      <span className="demo-banner-tag">DEMO</span>
      <span>
        Versão de demonstração de portfólio — nada aqui é salvo nem compartilhado (os dados de exemplo reiniciam
        sozinhos de tempos em tempos), e as simulações de conversa (aba <strong>Simulações</strong>) são{" "}
        <strong>100% fictícias</strong>: nenhuma chamada real é feita a nenhum avatar ou IA. Nem toda função
        mostrada aqui está totalmente ativa nesta versão.
      </span>
    </div>
  );
}
