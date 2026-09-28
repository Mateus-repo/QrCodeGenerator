# Mensagens de commit

Referência para a skill `auto-commit`. O `SKILL.md` diz o *como*; isto diz o
*que uma boa mensagem diz*.

## A regra que importa

**O diff já diz o quê. A mensagem tem de dizer o porquê.**

Alguém vai ler a mensagem daqui a seis meses, com o diff fechado. A pergunta que
precisa de resposta não é "o que mudou" — isso lê-se no diff — mas sim:

- Porque foi feito assim e não de outra maneira?
- O que estava partido antes?
- O que é que ficou de fora, e porquê?

## Antipatrones

Estes são os que aparecem mais, com o motivo pelo qual são ruins.

| ❌ | Porquê está mal |
|---|---|
| `fic` | Não diz nada. Daqui a seis meses é lixo. |
| `.` | Não diz nada. |
| `fix` | Não diz o quê nem porquê. |
| `update files` | Não diz quais, nem porquê. |
| `Atualizei o README` | Passado, não imperativo. E "porquê" continua em branco. |
| `fix bug` | Qual bug? Há dezenas. |
| `feat(pix): adiciona suporte a PIX e corrige o CRC e atualiza o README` | Três commits. |
| `Merge branch 'x'` | Não é uma mudança, é um evento. |
| `wip` | Não entra no `main`. Se não está pronto, não commites. |
| `teste final` | O que falhou? O que mudou? |

A diferença entre `fix` e `fix(pix): CRC-16 calculado sobre o payload final` é
a diferença entre um histórico e um arquivo de lixo.

## Exemplos bons deste repositório

### Correcção de bug

```
fix(pix): não destruía nomes com espaço no BR Code

O payload era normalizado com strip() e "Fulano de Tal" perdia os
espaços. Um nome de recebedor com espaço é o caso normal, não a
exceção, e o resultado não era lido por nenhuma app de banco.

A validação passou a rejeitar espaço nas pontas em vez de o remover
a meio, e o CRC-16 é calculado sobre o payload exato que vai para a
matriz.
```

O que o torna bom: diz o sintoma concreto, diz que não era um caso raro, e
explica a correcção escolhida *e a alternativa rejeitada*.

### Funcionalidade com uma decisão não óbvia

```
feat(web): variantes clara e escura de cada tema

Passou a haver 9 famílias x 3 modos. A forma do tema (raio, fonte,
moldura 3D) ficou num atributo e a paleta noutro, porque a forma não
depende do modo: o Windows 95 escuro tem a mesma moldura que o claro.

O modo "sistema" é resolvido em JavaScript. Feito em CSS, cada paleta
aparecia duas vezes — uma sob [data-modo='escuro'] e outra dentro de
um @media — e o ficheiro dobrava de tamanho.
```

O que o torna bom: a segunda pessoa percebe *porque não* se fez da maneira
obvia. Sem isso, a próxima pessoa "simplifica" e desfaz o trabalho.

### Documentação

```
docs: regista que o Windows 95 e o XP não têm variante escura oficial

A lista de temas parecia implicar que sim. As variantes escuras do 95 e
do XP são interpretação nossa, a inspirationar no esquema "Dark" do
Windows 98 e no "Luna Black" de terceiros.

As do Windows 7, 8, 10, 11, macOS e Ubuntu existem de facto. Dizer isto
é o que impede alguém de tratar as onze como se tivessem o mesmo
nível de fidelidade.
```

### Refactor

```
refactor(encoder): extrai a máscara 4 para uma tabela

Só a máscara 4 era assimétrica e estava escrita à mão, com o x e o y
trocados. A tabela deixa as oito lado a lado e o bug fica visível.

Nenhuma alteração de output: as 29 matrizes do cross-check continuam
a dar o mesmo resultado.
```

O parágrafo final é o que dá valor a um refactor: **garantir que não mudou o
comportamento**, e dizer como se sabe.

## Quando não há corpo

Um `chore` mecânico às vezes só precisa de uma linha:

```
chore: ignora os ficheiros de saida do Java
```

Ou, quando nem isso se pode dizer:

```
style: formata o codigo
```

Nesses casos, um corpo a inventar contexto é pior do que nenhum. Não inventes
um "porque" que não sabes.

## Assunto: limites

- **Curtos de mais** (`fix(pix): bug`) — não identifica o bug.
- **Longos demais** — a subject line é o que aparece no `git log --oneline` e
  noutros repositórios. 72 caracteres é o limite onde deixa de caber na maioria
  das interfaces.
- **Com "e"** — sinal de dois commits.

## Âmbito (`scope`)

O âmbito é a pasta ou o módulo, minúsculo, entre parênteses:

`pix` · `web` · `java` · `encoder` · `docs` · `spec` · `themes`

Vale a pena quando o repositório é multi-módulo, como este. Num ficheiro
pequeno, `fix(pix)` é mais útil do que `fix(web/payloads/pix.js)`.

## Ao commitar em conjunto

Um bloco de trabalho pode ter 40 ficheiros e 3 assuntos. Faz 3 commits, um por
assunto:

```
git add web/themes.css web/themes.js web/styles.css
git commit -F msg1

git add web/app.js web/index.html
git commit -F msg2

git add docs/ web/README.md
git commit -F msg3
```

Um commit único com tudo é mais rápido e fica ilegível. `git bisect` sobre um
commit com quatro assuntos não é possível.
