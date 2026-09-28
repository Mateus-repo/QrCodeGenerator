/**
 * Temas da interface.
 *
 * O modelo é de duas peças, e essa escolha é o que permite dar variante clara e
 * escura a cada família sem duplicar código:
 *
 *  - **família** — o *caráter* visual: raio, tipo de letra, molduras 3D,
 *    gradientes dos botões, presença de barra de título. Coisas que não têm
 *    "modo". O Windows 95 é sempre com a mesma moldura 3D, tenha a página de
 *    fundo clara ou escura.
 *  - **modo** — a paleta: `--fundo`, `--superficie`, `--texto` e companhia.
 *
 * Por isso o HTML leva dois atributos e não um: `data-theme="win95"` escolhe a
 * forma, `data-modo="escuro"` escolhe as cores. O CSS tem dois blocos por
 * família e nenhum duplica a forma.
 *
 * Quatro coisas que este módulo trata e que não são óbvias:
 *
 * 1. **O modo `sistema` é resolvido em JavaScript.** O CSS não consegue dizer
 *    "usa a paleta escura se `prefers-color-scheme` for escuro" sem repetir
 *    cada paleta duas vezes — uma sob `[data-modo='escuro']` e outra dentro de
 *    um `@media`. Resolvemos no JavaScript e escrevemos o modo concreto em
 *    `data-modo`. Fica metade do CSS, e o valor guardado continua a ser
 *    `sistema`, por isso a escolha sobrevive.
 *
 * 2. **O modo tem de reagir a mudanças com a página aberta.** Alguém que ligue
 *    o modo escuro do sistema com o separador já aberto espera ver a página
 *    mudar. Daí o `matchMedia().addEventListener`.
 *
 * 3. **Aplicar antes de pintar.** Se o tema for lido de `localStorage` só
 *    depois do primeiro `paint`, a página pisca no tema errado. Por isso isto
 *    corre num script no `<head>`, antes do CSS de conteúdo.
 *
 * 4. **A cor da barra do browser no telemóvel.** O `theme-color` da meta tag
 *    pinta a barra do sistema no Android. Sem a atualizar, um tema escuro fica
 *    com a barra clara por cima.
 */

/** Modos disponíveis, pela ordem em que aparecem. */
export const MODOS = [
  { id: 'sistema', nome: 'Sistema' },
  { id: 'claro', nome: 'Claro' },
  { id: 'escuro', nome: 'Escuro' },
];

/** Modo usado quando não há nada guardado. */
export const MODO_PADRAO = 'sistema';

/**
 * As famílias, pela ordem do menu.
 *
 * `padrao` não é uma família no mesmo sentido das outras: as suas paletas são
 * as do próprio site, e foi por isso que "Claro" e "Escuro" deixaram de ser
 * temas separados — são `padrao` no modo correspondente.
 */
export const FAMILIAS = [
  { id: 'padrao', nome: 'Padrão', grupo: 'GERAL' },

  { id: 'win11', nome: 'Windows 11', grupo: 'WINDOWS' },
  { id: 'win10', nome: 'Windows 10', grupo: 'WINDOWS' },
  { id: 'win8', nome: 'Windows 8', grupo: 'WINDOWS' },
  { id: 'win7', nome: 'Windows 7', grupo: 'WINDOWS' },
  { id: 'winxp', nome: 'Windows XP', grupo: 'WINDOWS' },
  { id: 'win95', nome: 'Windows 95', grupo: 'WINDOWS' },

  { id: 'mac', nome: 'macOS', grupo: 'OUTROS' },
  { id: 'ubuntu', nome: 'Ubuntu', grupo: 'OUTROS' },
];

/** Família usada quando não há nada guardado. */
export const FAMILIA_PADRAO = 'padrao';

const CHAVE = 'tema-qrcode';

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

export function idsDeFamilia() {
  return FAMILIAS.map((f) => f.id);
}

export function idsDeModo() {
  return MODOS.map((m) => m.id);
}

export function familiaPorId(id) {
  return FAMILIAS.find((f) => f.id === id) ?? null;
}

export function modoPorId(id) {
  return MODOS.find((m) => m.id === id) ?? null;
}

function familiaConhecida(id) {
  return FAMILIAS.some((f) => f.id === id);
}

function modoConhecido(id) {
  return MODOS.some((m) => m.id === id);
}

/**
 * Todas as combinações válidas, como o menu as atravessa.
 *
 * É a lista que os testes percorrem: cada combinação tem de ter paleta
 * suficiente e contraste suficiente.
 */
export function combinacoes() {
  const saida = [];
  for (const familia of FAMILIAS) {
    for (const modo of MODOS) {
      saida.push({ familia: familia.id, modo: modo.id });
    }
  }
  return saida;
}

/**
 * O modo que o CSS recebe.
 *
 * `sistema` transforma-se em `claro` ou `escuro` conforme o que o browser
 * diz. O CSS nunca vê a palavra `sistema`.
 */
export function modoEfetivo(modo) {
  if (modo !== 'sistema') {
    return modoConhecido(modo) ? modo : MODO_PADRAO;
  }
  return sistemaPrefereEscuro() ? 'escuro' : 'claro';
}

function sistemaPrefereEscuro() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    // Browser muito antigo, ou `matchMedia` indisponível. Claro é o mais seguro.
    return false;
  }
}

/**
 * Aplica uma combinação ao documento.
 *
 * `data-theme` leva a família (a forma) e `data-modo` leva o modo já resolvido
 * (a cor). Ficarem separados é o que permite ao CSS ter dois blocos por
 * família em vez de quatro.
 */
export function aplicarTema(familia, modo) {
  const raiz = document.documentElement;

  const f = familiaConhecida(familia) ? familia : FAMILIA_PADRAO;
  const m = modoConhecido(modo) ? modo : MODO_PADRAO;

  raiz.setAttribute('data-theme', f);
  raiz.setAttribute('data-modo', modoEfetivo(m));

  atualizarThemeColor();
}

/**
 * Pinta a barra do sistema no Android com a cor de fundo do tema.
 *
 * Lê a variável CSS já resolvida, por isso funciona com gradientes e com rgba.
 */
function atualizarThemeColor() {
  const tags = document.querySelectorAll('meta[name="theme-color"]');
  if (tags.length === 0) return;

  const fundo = getComputedStyle(document.body).backgroundColor;
  if (!fundo) return;

  for (const tag of tags) {
    tag.setAttribute('content', fundo);
  }
}

// ---------------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------------

/** Lê a escolha guardada, tolerando o formato antigo (um id só). */
function lerGuardado() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return { familia: FAMILIA_PADRAO, modo: MODO_PADRAO };

    const [familia, modo] = bruto.split(':');

    if (familiaConhecida(familia)) {
      return { familia, modo: modoConhecido(modo) ? modo : MODO_PADRAO };
    }

    // Formato anterior: guardava só o id do tema. "claro" e "escuro" eram
    // temas próprios e passaram a ser modos de `padrao`; os retro mantêm o id.
    if (bruto === 'claro' || bruto === 'escuro') {
      return { familia: FAMILIA_PADRAO, modo: bruto };
    }
    if (familiaConhecida(bruto)) {
      return { familia: bruto, modo: MODO_PADRAO };
    }

    return { familia: FAMILIA_PADRAO, modo: MODO_PADRAO };
  } catch {
    // Modo privado, ou localStorage bloqueado. Não é motivo para partir.
    return { familia: FAMILIA_PADRAO, modo: MODO_PADRAO };
  }
}

function guardar(familia, modo) {
  try {
    localStorage.setItem(CHAVE, `${familia}:${modo}`);
  } catch {
    /* sem persistência, o tema dura a sessão */
  }
}

// ---------------------------------------------------------------------------
// Seletores
// ---------------------------------------------------------------------------

/** Preenche o <select> com as famílias, agrupadas. */
function preencherFamilias(select) {
  select.textContent = '';

  let grupoAtual = null;
  let optgroup = null;

  for (const familia of FAMILIAS) {
    if (familia.grupo !== grupoAtual) {
      grupoAtual = familia.grupo;
      optgroup = document.createElement('optgroup');
      optgroup.label = grupoAtual;
      select.append(optgroup);
    }

    const opcao = document.createElement('option');
    opcao.value = familia.id;
    opcao.textContent = familia.nome;
    optgroup.append(opcao);
  }
}

/** Marca o botão de modo correspondente. */
function marcarModo(botoes, modo) {
  for (const botao of botoes) {
    botao.checked = botao.value === modo;
  }
}

/** Devolve os <input type="radio"> do grupo de modos. */
function botoesDeModo(grupo) {
  return [...grupo.querySelectorAll('input[type="radio"][name="tema-modo"]')];
}

/**
 * Liga os dois seletores.
 *
 * A família e o modo são estado único: mudar a família não perde o modo, e
 * mudar o modo não perde a família. Trocar de "Windows 95 escuro" para
 * "Ubuntu escuro" é uma mudança só.
 */
export function ligarSeletores(selectFamilia, grupoModos) {
  preencherFamilias(selectFamilia);
  const botoes = botoesDeModo(grupoModos);

  const inicial = lerGuardado();
  selectFamilia.value = inicial.familia;
  marcarModo(botoes, inicial.modo);
  aplicarTema(inicial.familia, inicial.modo);

  function mudar(novo) {
    aplicarTema(novo.familia, novo.modo);
    guardar(novo.familia, novo.modo);
  }

  selectFamilia.addEventListener('change', () => {
    const marcado = botoes.find((b) => b.checked);
    mudar({ familia: selectFamilia.value, modo: marcado ? marcado.value : MODO_PADRAO });
  });

  grupoModos.addEventListener('change', () => {
    const marcado = botoes.find((b) => b.checked);
    if (!marcado) return;
    mudar({ familia: selectFamilia.value, modo: marcado.value });
  });

  // Se o sistema mudar de claro para escuro com a página aberta, a página
  // acompanha — mas só no modo `sistema`, que é o que promete seguir o SO.
  try {
    const consulta = window.matchMedia('(prefers-color-scheme: dark)');
    const aoMudar = () => {
      const marcado = botoes.find((b) => b.checked);
      if (marcado && marcado.value === 'sistema') {
        aplicarTema(selectFamilia.value, 'sistema');
      }
    };
    if (typeof consulta.addEventListener === 'function') {
      consulta.addEventListener('change', aoMudar);
    } else if (typeof consulta.addListener === 'function') {
      // Safari antigo. addListener foi removido, mas ainda existe aí.
      consulta.addListener(aoMudar);
    }
  } catch {
    /* sem matchMedia, o modo `sistema` fica em claro */
  }

  return { mudar, idsAtuais: () => ({ familia: selectFamilia.value, modo: botoes.find((b) => b.checked)?.value ?? MODO_PADRAO }) };
}

/**
 * Corre o mais cedo possível, antes do primeiro paint.
 *
 * Chamado de um script inline no <head>. Se este ficheiro não estiver
 * carregado, o site arranca no tema padrão — que é o comportamento correto na
 * ausência de JavaScript.
 */
export function prepararImediatamente() {
  const { familia, modo } = lerGuardado();
  aplicarTema(familia, modo);
}
