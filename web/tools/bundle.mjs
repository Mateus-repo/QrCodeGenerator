/**
 * Gera um ficheiro HTML único, com tudo dentro.
 *
 *     node web/tools/bundle.mjs
 *     -> web/dist/qrcode-generator.html
 *
 * Porquê: módulos ES são bloqueados em `file://` pelo Chrome (CORS), por isso
 * a versão em vários ficheiros precisa de um servidor. O ficheiro único abre
 * com duplo clique em Windows, Mac e Linux, e pode ir num cartão de memória.
 *
 * A transformação é pequena e só serve para o estilo de código que este
 * projeto usa: `import { a, b as c } from './x.js'` e `export` em declarações.
 * Cada módulo é envolvido no seu próprio IIFE, por isso os nomes locais não
 * colidem entre ficheiros.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const out = join(web, 'dist');

/** Ordem de dependências: um módulo só pode vir depois de quem importa. */
const MODULES = [
  'qrcode.js',
  'symbologies/upcean.js',
  'symbologies/code128.js',
  'symbologies/index.js',
  'symbologies/linear.js',
  'payloads/text.js',
  'payloads/normalize.js',
  'payloads/pix.js',
  'payloads/types.js',
  'themes.js',
  'app.js',
];

/** Folhas de estilo, pela ordem em que são ligadas no HTML. */
const STYLESHEETS = ['styles.css', 'themes.css'];

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?\s*$/gm;
const NAMESPACE_RE = /^export\s+(function|const|let|class)\s+(\w+)/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\};?\s*$/gm;

/** `'payloads/pix.js'` -> `'__mod_payloads_pix'`. */
function namespaceOf(path) {
  return '__mod_' + posix.normalize(path).replace(/\.js$/, '').replace(/[^a-zA-Z0-9]/g, '_');
}

/** Resolve `'./text.js'` a partir de `'payloads/pix.js'`. */
function resolveImport(de, origem) {
  return posix.normalize(posix.join(posix.dirname(de), origem)).replace(/^\.\//, '');
}

/** Separa o ficheiro em { imports, exportados, corpo }. */
function parseModule(path) {
  const source = readFileSync(join(web, path), 'utf8');
  const imports = [];

  let body = source.replace(IMPORT_RE, (_, lista, origem) => {
    const from = namespaceOf(resolveImport(path, origem));
    const bindings = lista
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [nome, alias] = s.split(/\s+as\s+/).map((p) => p.trim());
        return alias ? `${nome}: ${alias}` : nome;
      });
    imports.push({ from, bindings });
    return '';
  });

  const exportados = new Set();
  body = body.replace(NAMESPACE_RE, (_, tipo, nome) => {
    exportados.add(nome);
    return `${tipo} ${nome}`;
  });

  body = body.replace(EXPORT_LIST_RE, (_, lista) => {
    for (const nome of lista.split(',').map((s) => s.trim()).filter(Boolean)) {
      exportados.add(nome);
    }
    return '';
  });

  return { path, imports, exportados: [...exportados], corpo: body.trim() };
}

function bundle() {
  const partes = [];

  for (const path of MODULES) {
    const modulo = parseModule(path);
    const ns = namespaceOf(path);

    const destructuracao = modulo.imports
      .map(({ from, bindings }) => `  const { ${bindings.join(', ')} } = ${from};`)
      .join('\n');

    partes.push(
      `// ===== ${path} =====\n` +
        `const ${ns} = (() => {\n${destructuracao}\n${modulo.corpo}\n` +
        `  return { ${modulo.exportados.join(', ')} };\n})();`,
    );
  }

  return partes.join('\n\n');
}

function html() {
  let pagina = readFileSync(join(web, 'index.html'), 'utf8');
  const js = bundle();

  // Todas as folhas de estilo são embutidas, pela ordem do HTML. Os temas têm
  // de vir depois da base, porque só substituem variáveis.
  const css = STYLESHEETS.map((file) => `/* ==== ${file} ==== */\n${readFileSync(join(web, file), 'utf8')}`).join(
    '\n',
  );

  for (const file of STYLESHEETS) {
    pagina = pagina.replace(new RegExp(`[ \\t]*<link rel="stylesheet" href="${file}" />\\n?`, 'g'), '');
  }
  pagina = pagina.replace('</head>', `  <style>\n${css}\n  </style>\n</head>`);

  // O ficheiro único não tem manifest nem service worker: não há onde os
  // registar em file://, e um 404 no console não ajuda ninguém.
  pagina = pagina.replace(/<link rel="manifest"[^>]*>/, '');
  pagina = pagina.replace(/<link rel="icon"[^>]*>/, '');

  pagina = pagina.replace(
    /<script type="module" src="app\.js"><\/script>/,
    `<script>\n(function () {\n'use strict';\n// Sem manifesto e sem service worker: num ficheiro solitário não há onde os instalar.\nconst __FICHEIRO_UNICO__ = true;\n${js}\n})();\n</script>`,
  );

  return pagina;
}

mkdirSync(out, { recursive: true });
const destino = join(out, 'qrcode-generator.html');
writeFileSync(destino, html(), 'utf8');

const kb = Math.round(readFileSync(destino).length / 1024);
console.log(`${destino} (${kb} KB, um ficheiro, sem dependências)`);
