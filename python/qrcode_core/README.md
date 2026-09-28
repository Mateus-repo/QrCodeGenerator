# Python — implementação de referência

Payloads + geração de imagem. É aqui que a spec de `../docs/TIPOS-QR.md` é
executável e onde os testes vivem.

**Estado:** ✅ PIX (BR Code) completo e validado contra o exemplo oficial do
Banco Central. ⬜ os 10 tipos que já existem no C# ainda não foram portados.

Detalhe, comandos de build e exemplos: [`README.md`](README.md).

```bash
cd python
pip install -r requirements.txt
python -m pytest tests -q
```
