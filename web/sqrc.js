/**
 * SQRC — o QR com conteudo cifrado.
 *
 * A especificacao e' da DENSO, e a ideia e' simples: o QR leva texto normal, e
 * qualquer camera lê. O SQRC leva **texto cifrado**, e so quem tem a chave o
 * lê. A etiqueta de uma peca de inventario, de um documento com dados
 * pessoais, de uma chave de activation — o codigo esta la, e quem o fotografa
 * fica com bytes uteis em vez do conteudo.
 *
 * ## Por que e' a decision do utilizador, e nao minha
 *
 * **A chave e' gerida por quem usa.** Nao ha chave do servidor, nao ha conta, nao
 * ha recuperacao. Quem faz o QR guarda a chave; sem ela, o conteudo esta
 * perdido — e nao "protegido", **perdido**. O aviso no ecrã diz isso antes de
 * a pessoa escolher, nao depois.
 *
 * Isto e' o oposto do que um produto faria, e e' deliberado: um servico que
 * guarda a tua chave pode sempre mostrar o teu conteudo a alguem. Um que nao a
 * guarda nao tem esse poder. O preco e' que **nao ha segunda chance**, e e'
 * melhor as pessoas saberem disso antes.
 *
 * ## O formato
 *
 * Tres campos, cada um com o seu comprimento — que e' o que torna o
 * contentor legivel sem a chave:
 *
 *     +--------+--------+--------+
 *     | versao |   id   |  texto |
 *     |  1 B   |  1 B   |   n B  |
 *     +--------+--------+--------+
 *
 *  - **versao** — quantos bytes de identificador se seguem. Vale `1`, e o valor
 *    esta no primeiro byte para que uma versao futura possa ter outro tamanho
 *    sem partir o que ja existe;
 *  - **id** — quem da chave. **Este campo e' o que permite ter varios SQRC com
 *    chaves diferentes no mesmo sistema**, e e' a razao de o comprimento ser
 *    variavel: o `id` e' o identificador do teu gestor de chaves, nao um
 *    numero de serie. Zero bytes quer dizer "uma unica chave", e e' o caso
 *    simples;
 *  - **texto** — o conteudo cifrado.
 *
 * O texto cifrado e' **AES-GCM**, que e' o que o browser tem no Web Crypto sem
 * dependencias. A escolha nao e' por ser o melhor: e' que GCM **verifica**,
 * e um QR que foi adulterado tem de **falhar a leitura** em vez de devolver
 * bytes errados. Um modo de cifragem sem verificacao — como o CTR, ou o
 * CFB — daria um codigo adulterado que se lê com a chave e devolve texto sem
 * sentido, e ninguem sabe se o erro e' do codigo ou da chave.
 *
 * ## O que o texto cifrado tem dentro
 *
 *     +---------------+-------------------+
 *     |   IV (nonce)  |  conteudo (GCM)  |
 *     |    12 bytes   |     n bytes       |
 *     +---------------+-------------------+
 *
 * O nonce e' **novo de cada vez**, mesmo com a mesma chave e o mesmo texto.
 * Nao e' opcional: com o mesmo nonce e a mesma chave, o AES-GCM produz o mesmo
 * texto cifrado, e isso **denuncia que o conteudo e' igual** — quem ve dois
 * SQRC sabe que o conteudo nao mudou, mesmo sem chave nenhuma. E o modo GCM
 * quebra a criptografia se o nonce se repete com a mesma chave.
 *
 * ## O que este modulo **nao** faz, e porquê
 *
 *  - **nao guarda a chave** em lado nenhum, e nao a manda para o servidor nem
 *    para o `localStorage`. A chave vive no campo de texto enquanto se esta a
 *    desenhar, e a partir dai e' do utilizador;
 *  - **nao descifra para mostrar**. Um descifrador no cliente seria um
 *    descifrador para quem tem o codigo, e o cliente inteiro e' publico. Quem
 *    descifra e' a aplicacao de quem tem a chave;
 *  - **nao promete que o ZXing o le**. O ZXing le o QR e devolve os **bytes
 *    cifrados** — que e' o que deve acontecer, e e' o mesmo que acontece com
 *    qualquer conteudo binario. O que nao ha, em lado nenhum, e' um leitor de
 *    SQRC no tooling de testes, e por isso **este modulo nao tem teste de leitura
 *    pelo ZXing**. O que tem, e' a property que importa: o ZXing tem de devolver
 *    **exactamente** os bytes que lhe foram dados, e um byte a mais ou a menos
 *    faria o descifrar falhar.
 */

/** Quantos bytes de nonce o AES-GCM usa. */
const TAMANHO_NONCE = 12;

/** A versao do contentor. O valor 1 diz "o `id` tem 1 byte". */
const VERSAO = 1;

/** O contentor, ja com o texto cifrado. */
export class Sqrc {
  /**
   * @param {Uint8Array} bytes  o contentor completo: versao, id, texto
   */
  constructor(bytes) {
    this.bytes = bytes;
  }

  /** Os tres campos, para quem precisar de inspecionar sem decifrar. */
  get campos() {
    if (this.bytes.length < 2) {
      throw new Error(`um SQRC tem no minimo 2 bytes (versao e id) e este tem ${this.bytes.length}`);
    }
    const versao = this.bytes[0];
    const tamanhoId = versao - VERSAO;
    if (tamanhoId < 0) {
      throw new Error(`versao de SQRC desconhecida: ${versao} - so se conhece a ${VERSAO}`);
    }
    return {
      versao,
      id: this.bytes.subarray(1, 1 + tamanhoId),
      texto: this.bytes.subarray(1 + tamanhoId),
    };
  }

  /**
   * O conteudo em base64, que e' o que vai para dentro do QR.
   *
   * E base64 e nao texto porque o texto cifrado **nao e' texto**: tem bytes que
   * nao sao caracteres, e metê-los num QR em modo byte da um codigo com bytes
   * invalidos, que o ZXing leria com substituicoes e o descifrar falharia.
   */
  get base64() {
    return bytesParaBase64(this.bytes);
  }
}

/**
 * Cifra o conteudo e devolve um `Sqrc`.
 *
 * @param {string|Uint8Array} conteudo  o que vai cifrado
 * @param {CryptoKey} chave            uma chave AES-GCM
 * @param {Uint8Array} [id]            quem da chave. Zero bytes = chave unica.
 * @returns {Promise<Sqrc>}
 */
export async function sqrc(conteudo, chave, id = new Uint8Array(0)) {
  if (id.length > 0xff) {
    throw new Error(`o id do SQRC tem ${id.length} bytes e o campo so leva 255`);
  }

  /*
   * **O primeiro byte e' a versao, que tambem diz o tamanho do id.**
   *
   * `versao = VERSAO + tamanhoId`: com id de tamanho zero a versao e' `1`, com
   * id de 3 bytes e' `4`. E' o que permite acrescentar um id maior sem partir o
   * que ja existe, e o que faz um contentor antigo continuar a ler-se.
   *
   * **A primeira versao tinha isto ao contrario** — subtraia em vez de somar, e
   * o bug aparecia com o id de zero bytes: o `sqrc()` escrevia a versao `1` e
   * o `campos` lia `1 - 0 = 1` byte de id, que nao era zero. O sintoma era um
   * contentor que **nao lia de volta** — o round-trip falhava com um erro de
   * descifragem, a apontar para a chave, e nao para o campo do id.
   *
   * E' o pior sitio para um bug: a cifra estava certa, a chave estava certa, e
   * o erro dizia "chave errada" quando o problema era um byte de cabecalho.
   */
  const tamanhoId = id.length;
  const versao = VERSAO + tamanhoId;

  const dados = typeof conteudo === 'string' ? new TextEncoder().encode(conteudo) : conteudo;

  /*
   * **O nonce e' novo de cada vez**, e nunca se repete com a mesma chave.
   *
   * `crypto.getRandomValues` e' a unica fonte aceitavel. Um nonce derivado do
   * conteudo seria deterministico - dois SQRC do mesmo texto sairiam
   * identicos, e quem os visse saberia que o conteudo nao mudou. E um nonce
   * que so avanca por contador precisa de estado, e um QR nao tem onde guardar
   * esse estado: o mesmo texto com a mesma chave tem de dar dois codigos
   * diferentes, sem nada que se lembre do anterior.
   */
  const nonce = crypto.getRandomValues(new Uint8Array(TAMANHO_NONCE));

  const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, chave, dados);

  // O nonce vai **dentro** do texto cifrado, e nao ao lado. Um SQRC que levasse
  // o nonce fora seria um contentor com uma peca a mais para o receptor
  // encontrar, e nao ha ganho nenhum: o GCM descifra com o nonce na mesma
  // posicao em que o leu.
  const cabecalho = new Uint8Array(1 + tamanhoId);
  cabecalho[0] = versao;
  cabecalho.set(id, 1);

  const corpo = new Uint8Array(nonce.length + cifrado.byteLength);
  corpo.set(nonce, 0);
  corpo.set(new Uint8Array(cifrado), nonce.length);

  const total = new Uint8Array(cabecalho.length + corpo.length);
  total.set(cabecalho, 0);
  total.set(corpo, cabecalho.length);

  return new Sqrc(total);
}

/**
 * Descifra um SQRC. **E' para a aplicacao de quem tem a chave, nao para aqui.**
 *
 * Existe porque o round-trip e' a unica verificacao possivel deste modulo, e
 * ela precisa dos dois lados. A razao de o cliente **nao** o expor e' a do
 * ponto anterior: um descifrador no cliente e' um descifrador para quem tem o
 * codigo, e nao para quem tem a chave.
 *
 * @param {Sqrc|Uint8Array} sqrc
 * @param {CryptoKey} chave
 * @returns {Promise<string>}
 */
export async function descifrar(sqrcOuBytes, chave) {
  const { texto } = sqrcOuBytes instanceof Sqrc ? sqrcOuBytes.campos : parseBytes(sqrcOuBytes);

  /*
   * **O minimo e' `nonce + 16`, e o `+ 1` da etiqueta de autenticacao conta.**
   *
   * O AES-GCM devolve sempre pelo menos 16 bytes de etiqueta, mesmo com o
   * conteudo vazio — e por isso que o limite e' `<` e nao `<=`. A primeira
   * versao usava `<=`, e **o conteudo vazio deixava de descer**: um SQRC de
   * zero bytes, que e' perfectly valido, dava "o contentor esta truncado".
   */
  const MINIMO = TAMANHO_NONCE + 16;
  if (texto.length < MINIMO) {
    throw new Error(
      `o texto cifrado tem ${texto.length} bytes e um AES-GCM precisa de ${TAMANHO_NONCE} de nonce ` +
        `e 16 de etiqueta de autenticacao - o contentor esta truncado`,
    );
  }

  const nonce = texto.subarray(0, TAMANHO_NONCE);
  const cifrado = texto.subarray(TAMANHO_NONCE);

  try {
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, chave, cifrado);
    return new TextDecoder().decode(claro);
  } catch {
    /*
     * **O GCM recusa, e a recusa e' a resposta certa.** Significa que a chave
     * nao e' a desta, ou que o conteudo foi alterado, e as duas coisas sao
     * indistinguiveis - que e' precisamente o que se quer. Um modo sem
     * verificacao devolveria bytes a um e outro, e quem lesse nao saberia
     * dizer se o erro era do codigo ou da chave.
     */
    throw new Error('nao foi possivel descifrar: a chave nao bate, ou o conteudo foi alterado');
  }
}

/** Extrai o `id` de um SQRC, para quem quiser mostrar de que chave e' sem decifrar. */
export function idDe(sqrcOuBytes) {
  return (sqrcOuBytes instanceof Sqrc ? sqrcOuBytes.campos : parseBytes(sqrcOuBytes)).id;
}

function parseBytes(bytes) {
  if (bytes instanceof Sqrc) return bytes.campos;
  if (!(bytes instanceof Uint8Array)) {
    throw new Error(`um SQRC tem de ser um Uint8Array ou um Sqrc, e veio ${typeof bytes}`);
  }
  return new Sqrc(bytes).campos;
}

/**
 * Base64 sem `btoa`, que so existe no browser.
 *
 * **`btoa` nao existe no Node**, e por isso o teste nao corre no `node --test`
 * - que e' onde este repositorio corre quase tudo. A implementacao e' a de
 * sempre e da' o mesmo resultado, e e' o que permite o round-trip ser
 * verificado sem browser.
 */
function bytesParaBase64(bytes) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let saida = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const trio = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    saida += alfabeto[(trio >> 18) & 63];
    saida += alfabeto[(trio >> 12) & 63];
    saida += i + 1 < bytes.length ? alfabeto[(trio >> 6) & 63] : '=';
    saida += i + 2 < bytes.length ? alfabeto[trio & 63] : '=';
  }

  return saida;
}

export { TAMANHO_NONCE, VERSAO };
