// Confere que o logotipo do SVG sai centrado com qualquer escala.
//
//     node spec/medir-svg.mjs
//
// **A escala nao pode entrar na conta do SVG**, e este script e' o que prova
// isso: o mesmo payload com seis escalas diferentes tem de dar o mesmo
// logotipo no mesmo sitio.
//
// **E' a razao de o `toSvg` nao dividir pela escala.** A versao anterior
// dividia, e com `escala: 9` o logotipo saia em `x = 2.78` em vez de `25` —
// vinte e cinco modulos do centro, quase o canto da zona apagada. O SVG
// continuava valido e o QR continuava a ler-se: **o unico sintoma era o
// logotipo torto**, e no ficheiro que a pessoa recebe.

import { encode, toSvg } from '../web/qrcode.js';
import { aplicarFrame } from '../web/frameqr.js';

const PAYLOAD = 'https://exemplo.pt/um/endereco/bastante/longo/para/que/o/qr/seja/grande';
const ECC = 'H';
const MODULOS_LOGO = 7;
const BORDA = 4;

const info = encode(PAYLOAD, { ecl: ECC });
const codigo = aplicarFrame(info, { modulos: MODULOS_LOGO });

// O `viewBox` e `0 0 (size + 2*borda)`, e o centro e' metade disso.
const centro = (info.size + BORDA * 2) / 2;
const larguraZona = codigo.zona.fim - codigo.zona.inicio;

console.log(`QR de ${info.size}x${info.size}, zona ${codigo.zona.inicio}-${codigo.zona.fim}`);
console.log(`centro do viewBox: ${centro}, largura da zona: ${larguraZona}`);
console.log();
console.log('escala     x       y      desvio x  desvio y');

let problemas = 0;

for (const escala of [1, 3, 6, 9, 12, 24]) {
  const svg = toSvg(PAYLOAD, {
    ecl: ECC,
    border: BORDA,
    escala,
    qr: codigo,
    logotipo: { naturalWidth: 240, naturalHeight: 160, src: 'logo.png' },
  });

  const tag = svg.match(/<image[^>]*>/);
  if (!tag) {
    console.log(`${String(escala).padStart(6)}   SEM <image>`);
    problemas++;
    continue;
  }

  const x = Number(tag[0].match(/x="([\d.]+)"/)[1]);
  const y = Number(tag[0].match(/y="([\d.]+)"/)[1]);
  const w = Number(tag[0].match(/width="([\d.]+)"/)[1]);
  const h = Number(tag[0].match(/height="([\d.]+)"/)[1]);

  const dx = Math.abs(x + w / 2 - centro);
  const dy = Math.abs(y + h / 2 - centro);
  const larguraCerta = Math.abs(w - larguraZona) < 0.05;

  console.log(
    `${String(escala).padStart(6)}  ${String(x).padStart(6)}  ${String(y).padStart(6)}  ` +
      `${dx.toFixed(4).padStart(8)}  ${dy.toFixed(4).padStart(8)}` +
      (dx < 0.05 && dy < 0.05 && larguraCerta ? '' : '   <-- problema'),
  );

  if (dx >= 0.05 || dy >= 0.05 || !larguraCerta) problemas++;
}

console.log();

if (problemas) {
  console.log(`${problemas} problemas: o logotipo do SVG move-se com a escala.`);
  process.exit(1);
}

console.log('O logotipo do SVG sai no mesmo sítio com qualquer escala, que é o que');
console.log('o viewBox em módulos obriga: a escala não entra nesta conta.');