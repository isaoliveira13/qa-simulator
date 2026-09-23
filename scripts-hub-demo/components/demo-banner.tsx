/**
 * Aviso fixo de que este é o modo DEMO do Repositório de Scripts (versão de
 * portfólio). Fica visível em toda tela, de propósito — quem visita precisa
 * saber, sem precisar ler o código, que nenhum teste roda de verdade aqui e
 * que nada digitado fica guardado além desta janela de tempo.
 */
export function DemoBanner() {
  return (
    <div className="demo-banner" role="note">
      <span className="demo-banner-tag">DEMO</span>
      <span>
        Versão de demonstração de portfólio — nada aqui é salvo nem compartilhado (os dados de
        exemplo reiniciam sozinhos de tempos em tempos). <strong>Nenhum script roda de verdade</strong>:
        não existe GitHub Actions disparado nem terminal executado, os comandos mostrados servem só
        pra copiar. Anexos enviados ficam só na memória do servidor, com limite de tamanho, e nunca
        saem daqui. Nem toda função mostrada está totalmente ativa nesta versão.
      </span>
    </div>
  );
}
