# RCA — Frontend em branco no CloudFront

**Data:** 2026-06-28  
**Ambiente:** dev (`MocaAgentCoreAppDev`) — us-east-1  
**Severidade:** Alta (frontend inacessível para todos os usuários brasileiros)  
**Status:** Resolvido

---

## Descrição do Incidente

Após deploy do ambiente dev, o acesso ao frontend via CloudFront (`https://d2hc1lhl36vctf.cloudfront.net`) resultava em página em branco. O console do browser exibia erros de MIME type incorreto para todos os assets estáticos (`.js`, `.css`).

```
Failed to load module script: Expected a JavaScript module script but the server 
responded with a MIME type of "text/html".
```

---

## Diagrama de Ishikawa (5M)

```
                           EFEITO
                    Página em branco no browser
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
     MÉTODO             MÁQUINA             MATERIAL
          │                  │                  │
 setup-env gera       CloudFront           Guia de deploy
 localhost por        GeoRestriction       não cita restrição
 padrão (design       ['JP','US']          geográfica
 intencional)         sem 'BR'             no checklist
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                                     │
      MEDIÇÃO                              MANUTENÇÃO
          │                                     │
 Logs do CloudFront        Upload manual do build substituiu
 não checados antes        o build correto do CDK (que injeta
 de escalar debugging      URLs via CodeBuild com vars corretas)
```

---

## Linha do Tempo

| Hora (BRT) | Evento |
|---|---|
| ~21:12 | Deploy CDK concluído. CDK faz build do frontend via NodejsBuild (CodeBuild) com variáveis corretas injetadas. |
| ~21:15 | `setup-env` executado — gera `.env` com `VITE_BACKEND_URL=http://localhost:3000` (comportamento padrão/intencional). |
| ~21:20 | Usuário acessa frontend — página em branco. |
| ~21:25 | Diagnóstico incorreto: acreditou-se que o build do CDK estava com variáveis vazias. |
| ~21:30 | Build local executado com `.env` de localhost → uploaded para S3 via `aws s3 sync` (sobrescreveu build correto do CDK). |
| ~21:35 | CloudFront invalida, página continua em branco. Erros de MIME type persistem. |
| ~21:45 | Identificado `Error from cloudfront` nos headers. Cache de erro investigado. |
| ~22:00 | `ErrorCachingMinTTL` zerado, nova invalidação. Página continua em branco. |
| ~22:10 | Cache policy de assets investigada (`MinTTL=31536000`). TTL zerado. |
| ~22:15 | Logs do CloudFront analisados. **Causa raiz identificada: `ClientGeoBlocked`**. |

---

## Análise dos 5 Porquês

**Por que a página estava em branco?**  
→ O browser recebia `text/html` (index.html) para todos os assets `.js` e `.css`.

**Por que o CloudFront retornava `index.html` para os assets?**  
→ O CloudFront retornava `ClientGeoBlocked` (sc-status 200 via CustomErrorResponse 403→index.html) porque o IP do usuário está no Brasil.

**Por que o acesso brasileiro estava bloqueado?**  
→ A configuração padrão de `cloudFrontGeoRestriction` no CDK é `['JP', 'US']`, e o ambiente dev não sobrescreveu esse padrão.

**Por que o ambiente dev não sobrescreveu a restrição geográfica?**  
→ A configuração de `cloudFrontGeoRestriction` não estava documentada no checklist do guia de deployment (`docs/guides/deployment-options.md`) como necessária para ambientes fora de JP/US.

**Por que o diagnóstico levou tempo?**  
→ O primeiro sintoma (MIME type errado) foi idêntico ao de "S3 com bucket vazio" ou "cache de erro do CloudFront", levando a investigações na direção errada. Os logs do CloudFront só foram consultados após múltiplas tentativas de fix.

---

## Causa Raiz

**`cloudFrontGeoRestriction` com whitelist `['JP', 'US']` configurada por padrão no CDK** (`packages/cdk/config/environment-utils.ts`), sem que o ambiente dev sobrescrevesse para incluir `'BR'` (Brasil).

O sintoma (`MIME type: text/html`) é **indistinguível** do erro de "cache de erro do CloudFront", atrasando o diagnóstico correto.

### Causa Contributiva

O upload manual via `aws s3 sync` com build local (que usa URLs de localhost do `setup-env`) sobrescreveu o build correto gerado pelo CDK via CodeBuild durante o deploy. O build do CDK já injeta as URLs de produção corretamente via variáveis de ambiente do CodeBuild — o `setup-env` é **apenas para desenvolvimento local**.

---

## Evidências

```
# Log do CloudFront (E4BIDGFY3N1YJ.2026-06-28-04.dd3f70e8.gz):
x-edge-detailed-result-type: ClientGeoBlocked
sc-status: 200  ← retorna 200 com index.html (CustomErrorResponse 403→index.html)
c-ip: 191.183.219.171  ← IP brasileiro
x-edge-location: MIA3-P7  ← Miami POP
```

---

## Fix Aplicado

Adicionar `'BR'` à lista de `cloudFrontGeoRestriction` no ambiente dev em `packages/cdk/config/environments.ts` e redeploy.

```typescript
dev: {
  cognitoDomainPrefix: 'mocadev-cirev-poc',
  cloudFrontGeoRestriction: ['JP', 'US', 'BR'],
},
```

---

## Ações Corretivas

| Ação | Responsável | Prazo |
|---|---|---|
| Adicionar `cloudFrontGeoRestriction` ao checklist de deployment em `docs/guides/deployment-options.md` | Equipe | Imediato |
| Restaurar build correto do CDK no S3 após redeploy (não usar `aws s3 sync` com build local) | Operações | Imediato |
| Adicionar nota no guia explicando que `setup-env` é apenas para dev local | Equipe | Imediato |

---

## Lições Aprendidas

1. **`ClientGeoBlocked` produz o mesmo sintoma que `S3AccessDenied`** — ambos resultam em `text/html` para todos os assets via CustomErrorResponse. Verificar logs do CloudFront deve ser o **primeiro passo** no diagnóstico.
2. **Não usar `aws s3 sync` com build local para corrigir assets do CloudFront** — o CDK gera o build correto durante o deploy via CodeBuild. O fix correto é redeploy do CDK.
3. **`setup-env` é para desenvolvimento local** — as variáveis de localhost são intencionais. O frontend em produção deve ser servido pelo build gerado durante o `cdk deploy`.
