try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }) } catch (_) {}
const express = require('express')
const cors    = require('cors')
const axios   = require('axios')
const https   = require('https')
const fs      = require('fs')
const path    = require('path')

const app  = express()
const PORT = process.env.PORT || 3001

const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true })

const BLIP_BASE    = 'https://api.blip.alinare.indepcloud.com.br:28876'
const COMPRAS_BASE = 'https://api.compras.alinare.indepcloud.com.br:30661'
const FOTO_BASE    = 'https://fotos.alinare.indepcloud.com.br'
const BLIP_TOKEN    = '81cbd168-790a-409b-b5d1-2df9c6a1fc61'
const COMPRAS_TOKEN = 'f7d36a19-b46b-4fc9-b064-db8e15be9110'

// ─── Empresas (multiempresa) ─────────────────────────────────────────────────
const FIN_BASE = 'https://api.financeiro.alinare.indepcloud.com.br:30662'
const EMPRESAS = {
  alinare: { base: COMPRAS_BASE, token: COMPRAS_TOKEN, diskFile: 'cache_compras.json', seedFile: 'cache_seed.json.gz', finBase: FIN_BASE, finToken: '2c9a971c-e798-4d92-b217-f1ee4b812a8c', finDiskFile: 'fin_alinare.json.gz' },
  novitah: { base: 'https://api.compras.novitah.indepcloud.com.br:29534', token: '41074c2b-be93-49b0-92f1-14449259092c', diskFile: 'cache_novitah.json', seedFile: 'cache_novitah_seed.json.gz', finBase: 'https://api.financeiro.novitah.indepcloud.com.br:29539', finToken: '50d267c1-aab1-4640-aa5f-8c808f62a2fb', finDiskFile: 'fin_novitah.json.gz' },
}
const EMPRESA_IDS = Object.keys(EMPRESAS)
const empValida = e => (EMPRESAS[e] ? e : 'alinare')

app.use(cors())
app.use(express.json())

// ─── cache (memória + disco) ─────────────────────────────────────────────────

// CACHE_DIR: aponte para um Railway Volume (ex: /data) para o cache sobreviver a deploys.
// Sem ele, cai no diretório da app (efêmero na Railway, persistente localmente).
const CACHE_DIR       = process.env.CACHE_DIR || __dirname
const CACHE_TTL       = 30 * 60 * 1000   // 30 minutos (refresh automático)
const DISK_MAX_AGE    = 12 * 60 * 60 * 1000  // disco válido por 12h para startup rápido
const REFRESH_PAUSE   = 10 * 60 * 1000   // espera 10 min APÓS concluir antes de reatualizar

// Persiste em disco localmente OU quando há um Volume configurado (CACHE_DIR) na Railway.
const DISK_PERSIST    = !process.env.RAILWAY_ENVIRONMENT || !!process.env.CACHE_DIR

// Estado isolado por empresa (cache, warm, fetch em andamento, pedidos, fornecedores)
function novoStore() {
  return {
    cache: new Map(),
    warmState: { done: false, pais: 0, skus: 0, error: null, startedAt: null, lastRefreshed: null },
    fetching: null,
    refreshing: false,
    pedidosCache: null, pedidosCacheAt: 0,
    pedidosItens: null, pedidosItensAt: 0,
    fornCache: null, fornCacheAt: 0,
    finCache: null, finCacheAt: 0, finFetching: null,
  }
}
const STORES = Object.fromEntries(EMPRESA_IDS.map(e => [e, novoStore()]))
const S = e => STORES[empValida(e)]

function cacheGet(emp, k) {
  const e = S(emp).cache.get(k)
  return (e && Date.now() - e.ts < CACHE_TTL) ? e.data : null
}

function cacheSet(emp, k, d) {
  S(emp).cache.set(k, { data: d, ts: Date.now() })
  if (k === 'compras_all' && DISK_PERSIST) {
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
      const file = path.join(CACHE_DIR, EMPRESAS[empValida(emp)].diskFile)
      fs.writeFileSync(file, JSON.stringify({ ts: Date.now(), data: d }))
      console.log(`[disk:${emp}] cache salvo: ${d.length} produtos em ${file}`)
    } catch (e) { console.error(`[disk:${emp}] erro ao salvar:`, e.message) }
  }
}

function loadDiskCache(emp) {
  try {
    const cfg  = EMPRESAS[empValida(emp)]
    const file = path.join(CACHE_DIR, cfg.diskFile)
    let raw = null
    if (fs.existsSync(file)) {
      raw = fs.readFileSync(file, 'utf8')
    } else if (cfg.seedFile) {
      // Seed compactado versionado no repo — garante produtos no boot mesmo
      // quando a API está instável (sem depender de fetch ao vivo no deploy).
      const seed = path.join(__dirname, cfg.seedFile)
      if (fs.existsSync(seed)) {
        raw = require('zlib').gunzipSync(fs.readFileSync(seed)).toString('utf8')
        console.log(`[disk:${emp}] usando seed compactado do repositório`)
      }
    }
    if (!raw) return null
    const obj  = JSON.parse(raw)
    const age  = Date.now() - obj.ts
    // Serve o cache do disco mesmo se estiver antigo — melhor mostrar dados na hora
    // (e atualizar em background) do que travar a tela quando a API está instável.
    const tag = age > DISK_MAX_AGE ? 'ANTIGO — atualizando em background' : `${Math.round(age/60000)}min atrás`
    console.log(`[disk:${emp}] cache carregado: ${obj.data.length} produtos (${tag})`)
    S(emp).cache.set('compras_all', { data: obj.data, ts: obj.ts })
    S(emp).warmState.lastRefreshed = obj.ts  // mostra quando os dados realmente foram buscados
    return obj.data
  } catch (e) { console.error(`[disk:${emp}] erro ao ler:`, e.message); return null }
}

// ─── Grupos excluídos ─────────────────────────────────────────────────────────
// Traz TODOS os produtos; descarta apenas o que não é produto (ex.: certificados).
// (Antes era lista-branca fixa da Alinare, que derrubava grupos da Novitah como COLAR.)

const GRUPOS_EXCLUIR = new Set(['CERTIFICADO', ''])

// ─── helpers ────────────────────────────────────────────────────────────────

function n(v) {
  if (v == null) return 0
  const x = parseFloat(String(v).replace(',', '.').replace(/[^\d.-]/g, ''))
  return isNaN(x) ? 0 : x
}

function fotoUrl(raw, produto) {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null
  if (s.startsWith('http')) {
    const clean = s.replace(/\\/g, '/').replace(/([^:])\/\/+/g, '$1/')
    if (clean.endsWith('/')) return produto ? `${clean}${produto}.jpg` : null
    return clean
  }
  const clean = s.replace(/\\/g, '/').replace(/^\/+/, '')
  return clean ? `${FOTO_BASE}/${clean}` : null
}

function parseDateBR(s) {
  if (!s) return null
  const p = s.split('/')
  if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]).getTime()
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.getTime()
}

// ─── Busca direta da API (sem cache) ─────────────────────────────────────────

async function fetchFromAPI(emp = 'alinare') {
  const cfg = EMPRESAS[empValida(emp)]
  const st  = S(emp)
  // Se já há uma busca em andamento, aguarda a mesma promise
  if (st.fetching) return st.fetching

  st.fetching = (async () => {
    // Páginas menores: respostas ~2 MB carregam de forma confiável na Railway
    // (páginas de 1000 itens = ~8 MB penduravam a conexão do container).
    const PAGE        = 250
    const MAX_RETRY   = 20   // tenta muito antes de desistir de uma página
    const all         = []
    let   page        = 1
    let   emptyStreak = 0    // só conta páginas REALMENTE vazias (fim da API)

    console.log(`[API:${emp}] buscando produtos pai (sequencial, sem parar em erro)…`)

    while (true) {
      const url = new URL(`${cfg.base}/Compras`)
      url.searchParams.set('limit', String(PAGE))
      url.searchParams.set('page',  String(page))

      let result = null
      for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        try {
          const { data } = await axios.get(url.toString(), {
            headers:    { Token: cfg.token },
            httpsAgent,
            timeout:    90000,   // falha rápido (90s) se a página pendurar, e re-tenta
            decompress: true,
          })
          result = Array.isArray(data) ? data : []
          break
        } catch (e) {
          const delay = Math.min(1000 * attempt, 15000)  // backoff: 1s, 2s, … até 15s
          console.warn(`[API] pág ${page} tentativa ${attempt}/${MAX_RETRY}: ${e.message} (aguardando ${delay}ms)`)
          await new Promise(r => setTimeout(r, delay))
        }
      }

      if (result === null) {
        // Esgotou todas as tentativas → pula a página mas NÃO para
        console.warn(`[API] pág ${page} IGNORADA após ${MAX_RETRY} tentativas, continuando…`)
        page++
        if (page > 500) break
        continue
      }

      if (result.length === 0) {
        // Página realmente vazia → provavelmente fim da paginação
        emptyStreak++
        console.log(`[API] pág ${page} vazia (streak ${emptyStreak})`)
        if (emptyStreak >= 3) break
      } else {
        // Qualquer quantidade de itens (mesmo 1) é dado válido
        emptyStreak = 0
        all.push(...result)
        st.warmState.pais = all.length
        console.log(`[API:${emp}] pág ${page} → +${result.length} (total ${all.length})`)
      }

      page++
      if (page > 500) break
    }

    console.log(`[API:${emp}] total final: ${all.length} produtos pai`)
    return all
  })().finally(() => { st.fetching = null })

  return st.fetching
}

// ─── Busca TODAS as páginas (com cache) ──────────────────────────────────────

async function fetchAllCompras(emp = 'alinare') {
  const key = 'compras_all'
  const hit = cacheGet(emp, key)
  if (hit) { console.log(`[cache:${emp}] ${hit.length} produtos pai`); return hit }

  const disk = loadDiskCache(emp)
  if (disk) { S(emp).warmState.pais = disk.length; return disk }

  const all = await fetchFromAPI(emp)
  cacheSet(emp, key, all)
  return all
}

// ─── Expande variacoes em linhas individuais ──────────────────────────────────

function expandVariacoes(parents) {
  const rows = []
  parents.forEach(pai => {
    // Descarta apenas grupos que não são produto (certificado, sem grupo)
    const grupoPai = (pai.grupo || '').toUpperCase().trim()
    if (GRUPOS_EXCLUIR.has(grupoPai)) return

    const variacoes = pai.variacoes || []
    if (variacoes.length === 0) { rows.push(buildRow(pai, null)); return }
    variacoes.forEach(v => {
      const grupoV = (v.grupo || grupoPai).toUpperCase().trim()
      if (!GRUPOS_EXCLUIR.has(grupoV)) rows.push(buildRow(pai, v))
    })
  })
  return rows
}

function buildRow(pai, v) {
  const item = v || pai

  const saldo01  = n(item.estoque_atual_01)
  const saldo04  = n(item.estoque_atual_04)
  const saldoD01 = n(item.estoque_disponivel_01)
  const saldoD04 = n(item.estoque_disponivel_04)
  const saldo    = (saldo01 + saldo04) || n(item.estoque_atual)
  const saldoD   = (saldoD01 + saldoD04) || n(item.estoque_disponivel)
  const valorEst01 = n(item.valor_estoque_atual_01)
  const valorEst04 = n(item.valor_estoque_atual_04)
  const valorEst = (valorEst01 + valorEst04) || n(item.valor_estoque_atual)
  // usa sempre o código filho quando existir — o || pai.x causava herdar o total do pai
  // (soma de todas as variações) para filhos com 0 vendas, inflando os cálculos
  const vendida  = v ? n(v.qtd_vendida)           : n(pai.qtd_vendida)
  const vend30   = v ? n(v.qtd_vendido_30_dias)   : n(pai.qtd_vendido_30_dias)
  const vend60   = v ? n(v.qtd_vendido_60_dias)   : n(pai.qtd_vendido_60_dias)
  const vend90   = v ? n(v.qtd_vendido_90_dias)   : n(pai.qtd_vendido_90_dias)
  const custo    = n(item.custo_produto)
  const preco    = n(item.preco_venda)

  let dde = 9999, giro = 0
  if (vend30 > 0) {
    dde  = saldoD > 0 ? Math.round(saldoD / (vend30 / 30)) : 0
    giro = saldo  > 0 ? +((vend30 * 365 / 30) / saldo).toFixed(1) : 0
  } else if (vendida > 0) {
    const entrada = parseDateBR(item.data_entrada || pai.data_entrada)
    const dias    = entrada ? Math.max(1, (Date.now() - entrada) / 86400000) : 365
    const diario  = vendida / dias
    dde  = diario > 0 ? Math.round(saldoD / diario) : 9999
    giro = saldo  > 0 ? +((diario * 365) / saldo).toFixed(1) : 0
  }

  const taxaSaida = (vend30 + saldo) > 0 ? +((vend30 / (vend30 + saldo)) * 100).toFixed(1) : 0
  const qtdSug    = Math.max(0, Math.ceil(vend30 * 2 - saldo))

  const dataEntrada    = item.data_entrada        || pai.data_entrada
  const dataUltimaRep  = item.data_ultima_reposicao || pai.data_ultima_reposicao
  const isNovo         = !dataUltimaRep || dataUltimaRep === dataEntrada

  return {
    produto:         item.produto      || pai.produto,
    produtoBase:     pai.produto,
    descricao:       item.descricao    || pai.descricao,
    grupo:           item.grupo        || pai.grupo,
    categoria:       item.categoria    || pai.categoria,
    tag2:            item.tag2         || pai.tag2,
    pedra:           item.pedra        || pai.pedra,
    reposicao:       item.reposicao,
    dataEntrada,
    isNovo,
    nomeFornecedor:  item.nome_fornecedor || pai.nome_fornecedor || '',
    fornecedor:      item.fornecedor      || pai.fornecedor      || '',
    _foto:           fotoUrl(item.foto_url || pai.foto_url, item.produto || pai.produto),
    _saldo:      saldo,
    _saldoDisp:  saldoD,
    _saldo01:    saldo01,
    _saldoDisp01:saldoD01,
    _saldo04:    saldo04,
    _saldoDisp04:saldoD04,
    _valorEst:   valorEst,
    _valorEst01: valorEst01,
    _valorEst04: valorEst04,
    _vendida:    vendida,
    _vend30:     vend30,
    _vend60:     vend60,
    _vend90:     vend90,
    _custo:      custo,
    _preco:      preco,
    _precoMedio: preco,
    _dde:        dde,
    _giro:       giro,
    _taxaSaida:  taxaSaida,
    _qtdSug:     qtdSug,
    _abc:        '',
  }
}

// ─── Calcula ABC e retorna lista pronta ───────────────────────────────────────

async function getProdutos(emp = 'alinare') {
  const key = 'produtos_enriched'
  const hit = cacheGet(emp, key)
  if (hit) return hit

  const parents = await fetchAllCompras(emp)
  const items   = expandVariacoes(parents)

  items.sort((a, b) => b._valorEst - a._valorEst)
  const total = items.reduce((s, i) => s + i._valorEst, 0)
  let cum = 0
  items.forEach(i => {
    cum += i._valorEst
    i._abc = total > 0 ? (cum / total <= 0.8 ? 'A' : cum / total <= 0.95 ? 'B' : 'C') : '-'
  })

  S(emp).warmState.skus = items.length
  S(emp).warmState.done = true
  cacheSet(emp, key, items)
  return items
}

// ─── Pré-aquece e agenda refresh automático a cada 30 min ───────────────────

// Retorna true só quando os produtos foram efetivamente atualizados com sucesso.
async function refresh(emp = 'alinare') {
  const st = S(emp)
  if (st.refreshing) return false
  st.refreshing = true
  st.warmState.error = null

  try {
    console.log(`[refresh:${emp}] buscando dados novos (dados antigos permanecem disponíveis)…`)

    const parents = await fetchFromAPI(emp)

    // Valida integridade: só descarta se o novo fetch trouxe muito menos que o anterior
    const prevCache = cacheGet(emp, 'compras_all')
    const prevCount = prevCache ? prevCache.length : 0
    if (prevCount > 0 && parents.length < prevCount * 0.80) {
      console.warn(`[refresh:${emp}] DESCARTADO — novo fetch retornou ${parents.length} produtos mas o cache tem ${prevCount} (< 80%). Mantendo dados anteriores.`)
      return false
    }

    // Processa e classifica ABC
    const items = expandVariacoes(parents)
    items.sort((a, b) => b._valorEst - a._valorEst)
    const total = items.reduce((s, i) => s + i._valorEst, 0)
    let cum = 0
    items.forEach(i => {
      cum += i._valorEst
      i._abc = total > 0 ? (cum / total <= 0.8 ? 'A' : cum / total <= 0.95 ? 'B' : 'C') : '-'
    })

    // Substitui cache atomicamente — só agora os dados antigos são trocados
    cacheSet(emp, 'compras_all', parents)
    cacheSet(emp, 'produtos_enriched', items)
    st.warmState.skus          = items.length
    st.warmState.pais          = parents.length
    st.warmState.done          = true
    // NÃO seta lastRefreshed aqui: a "Última atualização" só avança quando TUDO
    // (produtos + assistências + financeiro) terminar — feito em refreshTudo().
    console.log(`[refresh:${emp}] produtos concluídos: ${items.length} SKUs às ${new Date().toLocaleTimeString('pt-BR')}`)
    return true
  } catch (e) {
    st.warmState.error = e.message
    console.error(`[refresh:${emp}] erro:`, e.message)
    return false
  } finally {
    st.refreshing = false
  }
}

// Carga inicial: usa disco se disponível (startup rápido), senão busca API
async function initialLoad(emp = 'alinare') {
  const st = S(emp)
  st.warmState.startedAt = Date.now()
  try {
    await getProdutos(emp)   // usa disco se fresco, senão busca API
    if (!st.warmState.lastRefreshed) st.warmState.lastRefreshed = Date.now()
    console.log(`[warm:${emp}] pronto: ${st.warmState.skus} SKUs`)
  } catch (e) {
    st.warmState.error = e.message
    console.error(`[warm:${emp}] erro:`, e.message)
  }
}

// Atualiza o financeiro e aguarda concluir (force ignora o TTL e refaz o fetch)
async function warmFinanceiro(emp = 'alinare', force = false) {
  try {
    fetchFinanceiro(emp, force)
    const f = S(emp).finFetching
    if (f) await f
  } catch { /* erro já registrado em st.finError */ }
}

// Atualiza TUDO da Alinare (produtos + assistências + financeiro) e só então
// avança a "Última atualização" — o timestamp reflete o conjunto completo.
// Espera limitada: resolve quando a promessa terminar OU quando estourar o tempo.
// (O financeiro segue rodando em background se estourar — não bloqueia o ciclo.)
const comLimite = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))])
const FIN_ESPERA_MAX = 3 * 60 * 1000   // no máx. 3 min esperando o financeiro por ciclo

async function refreshTudo() {
  const ok = await refresh('alinare')          // produtos (true só se atualizou de fato)
  await warmPedidosForn('alinare').catch(() => {})
  await warmAssistencias().catch(() => {})     // assistências
  // Financeiro é forçado a cada ciclo, mas NÃO bloqueia: espera no máx. 3 min; se a
  // API estiver lenta, o horário avança mesmo assim e o financeiro conclui em background.
  await comLimite(warmFinanceiro('alinare', true), FIN_ESPERA_MAX)
  // Só avança a "Última atualização" se os produtos atualizaram com sucesso — em erro,
  // mantém o último horário bom (nunca volta ao inicial nem mostra horário falso).
  if (ok) {
    S('alinare').warmState.lastRefreshed = Date.now()
    console.log(`[refresh] ciclo Alinare concluído às ${new Date().toLocaleTimeString('pt-BR')}`)
  } else {
    console.warn('[refresh] ciclo Alinare sem atualização de produtos — mantendo horário anterior')
  }
}

// Loop contínuo: concluiu a atualização completa → espera 10 min → reatualiza.
async function refreshLoop() {
  // Financeiro do disco → disponível instantaneamente (não espera o fetch lento/instável)
  loadFinDisk('alinare'); loadFinDisk('novitah')
  await initialLoad('alinare')              // Alinare do seed → instantâneo
  warmPedidosForn('alinare').catch(() => {})
  // Assistências (~24 MB) em paralelo já no boot: não espera o refresh de produtos,
  // então a tela abre rápido em vez de bloquear no 1º acesso frio.
  warmAssistencias().catch(() => {})
  // Novitah em background para não competir por banda/CPU no boot
  initialLoad('novitah').then(() => warmPedidosForn('novitah')).catch(() => {})
  fetchFinanceiro('novitah').catch(() => {})
  while (true) {
    await refreshTudo()                       // produtos + assistências + financeiro (Alinare)
    // Novitah em background para não atrasar o ciclo da Alinare — também avança a
    // "Última atualização" dela ao concluir produtos + fornecedores + financeiro.
    refresh('novitah')
      .then(async ok => {
        await warmPedidosForn('novitah').catch(() => {})
        if (ok) S('novitah').warmState.lastRefreshed = Date.now()   // só avança se produtos ok
        warmFinanceiro('novitah', true).catch(() => {})              // financeiro em background
      })
      .catch(() => {})
    // Pausa de 10 min após concluir antes de iniciar a próxima atualização
    await new Promise(r => setTimeout(r, REFRESH_PAUSE))
  }
}

refreshLoop()

// ─── endpoints ───────────────────────────────────────────────────────────────

// ── Pedidos de compra ────────────────────────────────────────────────────────
const PEDIDOS_TTL    = 10 * 60 * 1000 // 10 min

async function fetchPedidos(emp = 'alinare') {
  const st = S(emp), cfg = EMPRESAS[empValida(emp)]
  if (st.pedidosCache && Date.now() - st.pedidosCacheAt < PEDIDOS_TTL) return st.pedidosCache
  const { data } = await axios.get(`${cfg.base}/Compras/Pedidos`, {
    headers: { Token: cfg.token }, httpsAgent, timeout: 60000,
  })
  st.pedidosCache = data
  st.pedidosCacheAt = Date.now()
  return data
}

// Constrói lista de todos os itens pendentes com cache próprio
async function buildPedidosItens(emp = 'alinare') {
  const st = S(emp)
  if (st.pedidosItens && Date.now() - st.pedidosItensAt < PEDIDOS_TTL) return st.pedidosItens
  const raw = await fetchPedidos(emp)
  const all = await getProdutos(emp)
  const grupoMap = {}, fotoMap = {}
  all.forEach(p => {
    if (p.produto) { grupoMap[p.produto] = p.grupo || ''; fotoMap[p.produto] = p._foto || '' }
  })

  const itens = []
  raw.forEach(ped => {
    ;(ped.itens || []).forEach(it => {
      if (Number(it.qtd_saldo) <= 0) return
      itens.push({
        pedido:         ped.pedido,
        emissao:        ped.emissao,
        fornecedor:     ped.fornecedor,
        nomeFornecedor: ped.nome_fornecedor,
        moeda:          ped.moeda,
        valorTotalPed:  ped.valor_total,
        situacao:       ped.situacao,
        item:           it.item,
        refFornecedor:  it.ref_fornecedor,
        produto:        it.produto,
        descricao:      it.descricao,
        almox:          it.almox,
        quantidade:     Number(it.quantidade),
        valorBase:      Number(it.valorbase),
        valorTotal:     Number(it.valortotal),
        qtdOriginal:    Number(it.qtd_original),
        qtdCancelada:   Number(it.qtd_cancelada),
        qtdSaldo:       Number(it.qtd_saldo),
        grupo:          grupoMap[it.produto] || '',
        fotoUrl:        fotoMap[it.produto] || fotoUrl(it.foto_url, it.produto) || '',
      })
    })
  })
  st.pedidosItens   = itens
  st.pedidosItensAt = Date.now()
  return itens
}


// Pré-aquece pedidos + fornecedores no background
async function warmPedidosForn(emp = 'alinare') {
  try {
    console.log(`[warm:${emp}] pré-aquecendo pedidos e fornecedores...`)
    await buildPedidosItens(emp)
    // Invalida cache de fornecedores para recomputar com dados frescos
    S(emp).fornCache   = null
    S(emp).fornCacheAt = 0
    console.log(`[warm:${emp}] pedidos e fornecedores prontos`)
  } catch (e) {
    console.warn(`[warm:${emp}] erro:`, e.message)
  }
}

// Pré-aquece as assistências (~24 MB) para a tela abrir instantânea
async function warmAssistencias() {
  try {
    console.log('[warm] pré-aquecendo assistências...')
    await fetchAssistenciasGeral()
    console.log('[warm] assistências prontas')
  } catch (e) {
    console.warn('[warm] assistências erro:', e.message)
  }
}

app.get('/api/pedidos', async (req, res) => {
  try {
    const itens = await buildPedidosItens(empValida(req.query.empresa))
    // Totais sem filtro (para KPIs)
    const pedidosUnicos = [...new Set(itens.map(i => i.pedido))].length
    const totalSaldo    = itens.reduce((s, i) => s + i.qtdSaldo,  0)
    const totalValor    = itens.reduce((s, i) => s + i.valorTotal, 0)
    const totalQtd      = itens.reduce((s, i) => s + i.quantidade, 0)
    const fornecedores  = [...new Set(itens.map(i => i.nomeFornecedor))].filter(Boolean).sort()
    res.json({ total: itens.length, pedidosUnicos, totalSaldo, totalValor, totalQtd, fornecedores, items: itens })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Mapa produto → { qtd, datas[] } em pedidos abertos (para ComprasPage) — apenas 2026+
app.get('/api/pedidos/por-produto', async (req, res) => {
  try {
    const todos = await buildPedidosItens(empValida(req.query.empresa))
    const itens = todos.filter(it => {
      const p = (it.emissao || '').split('/'); return p.length === 3 && parseInt(p[2]) >= 2026
    })
    const mapa = {}
    itens.forEach(it => {
      if (!mapa[it.produto]) mapa[it.produto] = { qtd: 0, datas: [] }
      mapa[it.produto].qtd += it.qtdSaldo
      if (it.emissao && !mapa[it.produto].datas.includes(it.emissao))
        mapa[it.produto].datas.push(it.emissao)
    })
    res.json(mapa)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Fornecedores ─────────────────────────────────────────────────────────────
const FORN_TTL = 10 * 60 * 1000 // 10 min

async function buildFornecedores(emp = 'alinare') {
  const st = S(emp)
  if (st.fornCache && Date.now() - st.fornCacheAt < FORN_TTL) return st.fornCache

  // fonte 1: todos os produtos do catálogo (têm nome_fornecedor)
  const prods = await getProdutos(emp)

  // fonte 2: pedidos de compra (para cruzar qtd comprada, valor, saldo pendente)
  const pedidosItens = await buildPedidosItens(emp)

  const result = _computeFornecedores(prods, pedidosItens, null, null, null)
  st.fornCache   = result
  st.fornCacheAt = Date.now()
  return result
}

function _computeFornecedores(prods, pedidosItens, dataInicio, dataFim, fornFiltro) {

    function parseDMY(s) {
      const p = (s || '').split('/')
      return p.length === 3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`) : null
    }
    const dtIni = dataInicio ? new Date(dataInicio) : null
    const dtFim = dataFim    ? new Date(dataFim)    : null

    // mapa de pedidos filtrados por data: produto → { qtdComprada, qtdSaldo, valorCompra, pedidos, emissoes }
    const pedMap = {}
    pedidosItens.forEach(it => {
      if (dtIni || dtFim) {
        const dt = parseDMY(it.emissao)
        if (dtIni && dt && dt < dtIni) return
        if (dtFim && dt && dt > dtFim) return
      }
      if (!pedMap[it.produto]) pedMap[it.produto] = { qtdComprada: 0, qtdSaldo: 0, valorCompra: 0, pedidos: new Set(), emissoes: [], itens: [] }
      pedMap[it.produto].qtdComprada += it.quantidade
      pedMap[it.produto].qtdSaldo    += it.qtdSaldo
      pedMap[it.produto].valorCompra += it.valorTotal
      pedMap[it.produto].pedidos.add(it.pedido)
      if (it.emissao && !pedMap[it.produto].emissoes.includes(it.emissao)) pedMap[it.produto].emissoes.push(it.emissao)
      pedMap[it.produto].itens.push({ pedido: it.pedido, emissao: it.emissao, nomeFornecedor: it.nomeFornecedor, qtd: it.quantidade, qtdSaldo: it.qtdSaldo, valorTotal: it.valorTotal })
    })

    // lista de todos os fornecedores disponíveis (do catálogo + pedidos)
    const nomesSet = new Set()
    prods.forEach(p => { if (p.nomeFornecedor) nomesSet.add(p.nomeFornecedor) })
    pedidosItens.forEach(i => { if (i.nomeFornecedor) nomesSet.add(i.nomeFornecedor) })
    const nomesDisponiveis = [...nomesSet].sort()

    // agrupa produtos por fornecedor (fonte: catálogo)
    const byForn = {}
    prods.forEach(p => {
      const nome = p.nomeFornecedor || ''
      if (!nome) return
      if (fornFiltro && nome !== fornFiltro) return
      if (!byForn[nome]) byForn[nome] = { nome, produtos: [] }
      byForn[nome].produtos.push(p)
    })

    // para fornecedores que aparecem APENAS nos pedidos (sem cadastro no catálogo)
    pedidosItens.forEach(it => {
      const nome = it.nomeFornecedor || ''
      if (!nome || byForn[nome]) return
      if (fornFiltro && nome !== fornFiltro) return
      if (!byForn[nome]) byForn[nome] = { nome, produtos: [] }
    })

    const fornecedores = Object.values(byForn).map(f => {
      let qtdSaldo = 0, qtdVendida = 0, qtdComprada = 0, saldoPedidos = 0
      let valorEstoque = 0, custoVendas = 0, vendaReal = 0, valorCompra = 0, valorVendaPot = 0
      let pedidosSet = new Set()

      const produtos = f.produtos.map(p => {
        const ped      = pedMap[p.produto] || {}
        const vendida  = p._vendida || 0
        const custo    = p._custo   || 0
        const preco    = p._preco   || 0
        const vCusto   = vendida * custo          // custo total das peças vendidas
        const vVendido = vendida * preco           // receita real das vendas
        const lucroP   = vVendido - vCusto
        const margemP  = vVendido > 0 ? (lucroP / vVendido) * 100 : 0
        const vCompra  = ped.valorCompra || 0
        const vVendaPot= (ped.qtdComprada || 0) * preco

        qtdSaldo     += p._saldo || 0
        qtdVendida   += vendida
        qtdComprada  += ped.qtdComprada || 0
        saldoPedidos += ped.qtdSaldo    || 0
        valorEstoque += p._valorEst     || 0
        custoVendas  += vCusto
        vendaReal    += vVendido
        valorCompra  += vCompra
        valorVendaPot+= vVendaPot
        if (ped.pedidos) ped.pedidos.forEach(n => pedidosSet.add(n))

        const isRuptura = (p._saldo || 0) <= 0 && (p._vend30 || 0) > 0 && (p._vend90 || 0) > 0
        const isRisco   = (p._saldo || 0) > 0 && (p._dde || 9999) < 30 && (p._dde || 9999) < 9999 && (p._vend90 || 0) > 0

        return {
          produto: p.produto, produtoBase: p.produtoBase,
          descricao: p.descricao, grupo: p.grupo || '',
          tag2:  p.tag2  || '',
          pedra: p.pedra || '',
          saldo: p._saldo || 0, vendida,
          custo, preco,
          custoVendas: Math.round(vCusto   * 100) / 100,
          vendaReal:   Math.round(vVendido  * 100) / 100,
          lucro:       Math.round(lucroP    * 100) / 100,
          margem:      Math.round(margemP   * 10)  / 10,
          valorEstoque: p._valorEst || 0,
          ruptura: isRuptura,
          risco:   isRisco,
          // dados de pedidos
          qtdComprada: ped.qtdComprada || 0,
          qtdSaldoPed: ped.qtdSaldo    || 0,
          valorCompra: Math.round(vCompra    * 100) / 100,
          valorVendaPot: Math.round(vVendaPot* 100) / 100,
          emissoes: ped.emissoes || [],
          pedidosItens: ped.itens || [],
          fotoUrl: p._foto || '',
        }
      })

      const lucroTotal  = vendaReal - custoVendas
      const margemMedia = vendaReal > 0 ? (lucroTotal / vendaReal) * 100 : 0

      return {
        nome: f.nome,
        produtosCount: f.produtos.length,
        pedidosCount: pedidosSet.size,
        qtdSaldo, qtdVendida, qtdComprada, saldoPedidos,
        valorEstoque,
        custoVendas:  Math.round(custoVendas  * 100) / 100,
        vendaReal:    Math.round(vendaReal     * 100) / 100,
        valorCompra:  Math.round(valorCompra   * 100) / 100,
        valorVendaPot:Math.round(valorVendaPot * 100) / 100,
        lucro:  Math.round(lucroTotal  * 100) / 100,
        margem: Math.round(margemMedia * 10)  / 10,
        produtos,
      }
    }).sort((a, b) => b.vendaReal - a.vendaReal)

    // produtos em 2+ fornecedores (do catálogo)
    const prodFornCat = {}
    prods.forEach(p => {
      const nome = p.nomeFornecedor || ''
      if (!nome) return
      if (!prodFornCat[p.produto]) prodFornCat[p.produto] = []
      if (!prodFornCat[p.produto].includes(nome)) prodFornCat[p.produto].push(nome)
    })

    const duplicados = []
    Object.entries(prodFornCat).forEach(([produto, nomes]) => {
      if (nomes.length < 2) return
      const p = prods.find(x => x.produto === produto) || {}
      duplicados.push({
        produto, descricao: p.descricao || '', grupo: p.grupo || '',
        preco: p._preco || 0, fotoUrl: p._foto || '',
        fornecedores: nomes.map(nome => {
          const ped = pedMap[produto] || {}
          return { nome, qtd: ped.qtdComprada || 0, custoMedio: p._custo || 0, valorCompra: ped.valorCompra || 0 }
        }),
      })
    })

  return { nomesDisponiveis, fornecedores, duplicados }
} // fim _computeFornecedores

app.get('/api/fornecedores', async (req, res) => {
  try {
    const emp = empValida(req.query.empresa)
    const { dataInicio, dataFim, fornecedor: fornFiltro } = req.query
    const temFiltro = dataInicio || dataFim || fornFiltro

    if (!temFiltro) {
      // Sem filtros → usa cache computado no startup
      const cached = await buildFornecedores(emp)
      return res.json(cached)
    }

    // Com filtros → recalcula em cima dos dados já cacheados
    const prods        = await getProdutos(emp)
    const pedidosItens = await buildPedidosItens(emp)
    const result = _computeFornecedores(prods, pedidosItens, dataInicio, dataFim, fornFiltro)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/image-proxy', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url required' })
  try {
    const r = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 12000,
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://compras.azime.com.br/',
      },
    })
    res.set('Content-Type', r.headers['content-type'] || 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(Buffer.from(r.data))
  } catch (e) {
    console.log(`[image-proxy] FALHOU: ${url} → ${e.message}`)
    res.status(404).end()
  }
})

app.get('/api/debug/foto', async (req, res) => {
  const { produto } = req.query
  // Dados brutos da API (antes do processamento)
  const parents = await fetchAllCompras()
  let rawPai = null, rawVariacao = null
  for (const pai of parents) {
    if (pai.produto === produto) { rawPai = pai; break }
    const v = (pai.variacoes || []).find(v => v.produto === produto)
    if (v) { rawPai = pai; rawVariacao = v; break }
  }
  if (!rawPai) return res.json({ erro: 'produto não encontrado', produto })

  const rawFotoUrl = (rawVariacao || rawPai).foto_url || null
  const paiFotoUrl = rawPai.foto_url || null
  const fotoGerada = fotoUrl(rawFotoUrl || paiFotoUrl, produto)

  let testeHttp = null
  if (fotoGerada) {
    try {
      const r = await axios.head(fotoGerada, { timeout: 8000, httpsAgent, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://compras.azime.com.br/' } })
      testeHttp = { status: r.status, contentType: r.headers['content-type'] }
    } catch (e) {
      testeHttp = { erro: e.message }
    }
  }

  res.json({
    produto,
    rawFotoUrl,
    paiFotoUrl,
    fotoGerada,
    testeHttp,
    camposDisponiveis: Object.keys(rawVariacao || rawPai).filter(k => k.includes('foto') || k.includes('imag') || k.includes('url')),
  })
})

// Conta produtos na API diretamente (sem cache) para comparar com o cache atual
app.get('/api/debug/contar', async (req, res) => {
  try {
    // Pega total no cache atual
    const cached = cacheGet('alinare', 'compras_all')
    const noCache = cached ? cached.length : 0

    // Busca pág 1 e pág 2 direto da API para estimar total
    const fetchPag = async (page) => {
      const url = new URL(`${COMPRAS_BASE}/Compras`)
      url.searchParams.set('limit', '1000')
      url.searchParams.set('page', String(page))
      const { data } = await axios.get(url.toString(), {
        headers: { Token: COMPRAS_TOKEN }, httpsAgent, timeout: 60000, decompress: true,
      })
      return Array.isArray(data) ? data.length : 0
    }

    const [p1, p2, p20] = await Promise.all([fetchPag(1), fetchPag(2), fetchPag(20)])
    res.json({
      cache_atual_produtos_pai: noCache,
      pagina_1: p1,
      pagina_2: p2,
      pagina_20: p20,
      ultima_atualizacao: S('alinare').warmState.lastRefreshed ? new Date(S('alinare').warmState.lastRefreshed).toLocaleString('pt-BR') : null,
    })
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

// Busca pág 1 direto da API (sem cache) e mostra estrutura real dos campos
app.get('/api/debug/api-raw', async (req, res) => {
  try {
    const url = new URL(`${COMPRAS_BASE}/Compras`)
    url.searchParams.set('limit', '5')
    url.searchParams.set('page',  '1')
    const { data } = await axios.get(url.toString(), {
      headers: { Token: COMPRAS_TOKEN }, httpsAgent, timeout: 30000, decompress: true,
    })
    const items = Array.isArray(data) ? data : []
    // retorna os primeiros 5 produtos com TODOS os campos visíveis
    res.json({
      total_retornados: items.length,
      amostra: items.slice(0, 5).map(p => ({
        produto:   p.produto,
        descricao: p.descricao,
        grupo:     p.grupo,
        // todos os campos que possam ter foto/url
        campos_foto: Object.fromEntries(Object.entries(p).filter(([k]) =>
          k.toLowerCase().includes('foto') || k.toLowerCase().includes('imag') ||
          k.toLowerCase().includes('url')  || k.toLowerCase().includes('path')
        )),
        // variações (primeiro filho apenas)
        primeiro_filho: p.variacoes?.[0] ? {
          produto: p.variacoes[0].produto,
          campos_foto: Object.fromEntries(Object.entries(p.variacoes[0]).filter(([k]) =>
            k.toLowerCase().includes('foto') || k.toLowerCase().includes('imag') ||
            k.toLowerCase().includes('url')  || k.toLowerCase().includes('path')
          )),
        } : null,
      })),
    })
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

// Força recarregamento completo: apaga cache em disco e memória, busca API do zero
app.post('/api/admin/force-refresh', async (req, res) => {
  try {
    const emp = empValida(req.query.empresa)
    // Apaga cache de memória da empresa
    S(emp).cache.clear()
    // Apaga cache de disco da empresa
    const file = path.join(CACHE_DIR, EMPRESAS[emp].diskFile)
    if (fs.existsSync(file)) fs.unlinkSync(file)
    console.log(`[force-refresh:${emp}] cache limpo, rebuscando API do zero…`)
    res.json({ ok: true, mensagem: 'Cache limpo. Rebuscando dados da API em background…' })
    // Dispara refresh em background (não bloqueia resposta)
    refresh(emp).catch(e => console.error(`[force-refresh:${emp}] erro:`, e.message))
  } catch (e) {
    res.status(500).json({ erro: e.message })
  }
})

app.get('/api/status', (req, res) => {
  const st = S(req.query.empresa)
  const warmState = st.warmState
  const elapsed = Math.round((Date.now() - warmState.startedAt) / 1000)
  // finCacheAt: horário da última atualização do financeiro (mostrado quando na tela Financeiro)
  res.json({ ...warmState, elapsed, finCacheAt: st.finCacheAt || null })
})

app.get('/api/compras', async (req, res) => {
  try {
    const all = await fetchAllCompras()
    const limit = req.query.limit ? parseInt(req.query.limit) : all.length
    res.json(all.slice(0, limit))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/produtos/options', async (req, res) => {
  try {
    const all    = await getProdutos(empValida(req.query.empresa))
    const grupos      = [...new Set(all.map(i => i.grupo).filter(Boolean))].sort()
    const pedras      = [...new Set(all.map(i => i.pedra).filter(Boolean))].sort()
    const tag2s       = [...new Set(all.map(i => i.tag2).filter(Boolean))].sort()
    const categorias  = [...new Set(all.map(i => i.categoria).filter(Boolean))].sort()
    const fornecedores= [...new Set(all.map(i => i.nomeFornecedor).filter(Boolean))].sort()
    res.json({ grupos, pedras, tag2s, categorias, fornecedores })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Aplica visão de filial — sobrescreve _saldo/_saldoDisp/_valorEst conforme seleção
function applyFilial(items, filial) {
  if (!filial || filial === 'todos') return items
  return items.map(i => {
    const s  = filial === '01' ? i._saldo01  : i._saldo04
    const sd = filial === '01' ? i._saldoDisp01 : i._saldoDisp04
    const ve = filial === '01' ? i._valorEst01 : i._valorEst04
    const dde = i._vend30 > 0 && sd > 0 ? Math.round(sd / (i._vend30 / 30)) : (i._vend30 > 0 && sd === 0 ? 0 : 9999)
    return { ...i, _saldo: s, _saldoDisp: sd, _valorEst: ve, _dde: dde }
  })
}

app.get('/api/produtos', async (req, res) => {
  try {
    const all = await getProdutos(empValida(req.query.empresa))
    const { view = 'list', page = '0', limit = '100', sort = '_valorEst', dir = 'desc', search = '', tipo = 'todos', grupo: gf = '', pedra: pf = '', tag2: tf = '', codigo: cf = '', ruptura: rf = '', categoria: catf = '', estoque: esf = '', filial: fil = '', fornecedor: ff = '' } = req.query

    // ── Agrupado (poucas linhas, retorna tudo) ──────────────────────────────
    if (view !== 'list') {
      const DIM = view === 'grupo' ? 'grupo' : view === 'pedra' ? 'pedra' : 'tag2'
      let grpItems = applyFilial(all, fil)
      const gq = search.trim().toLowerCase()
      if (gq)    grpItems = grpItems.filter(i => i.descricao?.toLowerCase().includes(gq))
      if (cf)    grpItems = grpItems.filter(i => i.produto?.toLowerCase().includes(cf.toLowerCase()) || i.produtoBase?.toLowerCase().includes(cf.toLowerCase()))
      if (gf)    grpItems = grpItems.filter(i => (i.grupo     || '').toLowerCase() === gf.toLowerCase())
      if (pf)    grpItems = grpItems.filter(i => (i.pedra     || '').toLowerCase() === pf.toLowerCase())
      if (tf)    grpItems = grpItems.filter(i => (i.tag2      || '').toLowerCase() === tf.toLowerCase())
      if (catf)  grpItems = grpItems.filter(i => (i.categoria || '').toLowerCase() === catf.toLowerCase())
      if (ff)    grpItems = grpItems.filter(i => (i.nomeFornecedor || '').toLowerCase() === ff.toLowerCase())
      if (tipo !== 'todos') grpItems = grpItems.filter(i => tipo === 'novo' ? i.isNovo : !i.isNovo)
      if (rf)    grpItems = grpItems.filter(i => rf === 'risco' ? (i._dde < 30 && i._dde < 9999) : rf === 'ruptura' ? i._dde === 0 : true)
      if (esf === 'com')   grpItems = grpItems.filter(i => i._saldo > 0)
      if (esf === 'sem')   grpItems = grpItems.filter(i => i._saldo <= 0)
      if (esf === 'baixo') grpItems = grpItems.filter(i => i._saldo > 0 && i._dde < 30 && i._dde < 9999)
      const map = {}
      grpItems.forEach(i => {
        const k = i[DIM] || '(sem)'
        if (!map[k]) map[k] = { _key: k, _saldo: 0, _saldoDisp: 0, _vend30: 0, _vendida: 0, _valorEst: 0, _count: 0, _giroSum: 0, _giroN: 0, _ddeSum: 0, _ddeN: 0, _precoSum: 0, _precoN: 0, _taxaSum: 0, _taxaN: 0 }
        map[k]._saldo     += i._saldo
        map[k]._saldoDisp += i._saldoDisp
        map[k]._vend30    += i._vend30
        map[k]._vendida   += i._vendida || 0
        map[k]._valorEst  += i._valorEst
        map[k]._count++
        if (i._giro    > 0)    { map[k]._giroSum  += i._giro;     map[k]._giroN++ }
        if (i._dde   < 9999)   { map[k]._ddeSum   += i._dde;      map[k]._ddeN++  }
        if (i._preco   > 0)    { map[k]._precoSum += i._preco;    map[k]._precoN++ }
        if (i._taxaSaida > 0)  { map[k]._taxaSum  += i._taxaSaida; map[k]._taxaN++ }
      })
      const rows = Object.values(map).map(r => ({
        ...r,
        _giroMedio:  r._giroN > 0 ? +(r._giroSum / r._giroN).toFixed(1) : 0,
        _dde:        r._ddeN  > 0 ? Math.round(r._ddeSum / r._ddeN)      : 9999,
        _precoMedio: r._precoN > 0 ? r._precoSum / r._precoN              : 0,
        _taxaSaida:  r._taxaN > 0 ? +(r._taxaSum / r._taxaN).toFixed(1)  : 0,
      })).sort((a, b) => b._valorEst - a._valorEst)
      return res.json({ total: rows.length, items: rows })
    }

    // ── Lista paginada ──────────────────────────────────────────────────────
    let items = applyFilial(all, fil)
    const q = search.trim().toLowerCase()
    if (q)   items = items.filter(i => i.descricao?.toLowerCase().includes(q))
    if (cf)  items = items.filter(i => i.produto?.toLowerCase().includes(cf.toLowerCase()) || i.produtoBase?.toLowerCase().includes(cf.toLowerCase()))
    if (gf)    items = items.filter(i => (i.grupo     || '').toLowerCase() === gf.toLowerCase())
    if (pf)    items = items.filter(i => (i.pedra     || '').toLowerCase() === pf.toLowerCase())
    if (tf)    items = items.filter(i => (i.tag2      || '').toLowerCase() === tf.toLowerCase())
    if (catf)  items = items.filter(i => (i.categoria || '').toLowerCase() === catf.toLowerCase())
    if (ff)    items = items.filter(i => (i.nomeFornecedor || '').toLowerCase() === ff.toLowerCase())

    const totalNovo      = items.filter(i => i.isNovo === true).length
    const totalReposicao = items.filter(i => i.isNovo === false).length
    const totalRuptura   = items.filter(i => (i._saldo <= 0 && i._vend30 > 0) || (i._dde < 30 && i._dde < 9999)).length

    if (tipo === 'novo')       items = items.filter(i => i.isNovo === true)
    if (tipo === 'reposicao')  items = items.filter(i => i.isNovo === false)
    if (rf === 'ruptura')      items = items.filter(i => i._saldo <= 0 && i._vend30 > 0 && i._vend90 > 0)
    if (rf === 'risco')        items = items.filter(i => i._saldo > 0 && i._dde < 30 && i._dde < 9999 && i._vend90 > 0)
    if (rf === 'normalizado')  items = items.filter(i => !(i._saldo <= 0 && i._vend30 > 0 && i._vend90 > 0) && !(i._saldo > 0 && i._dde < 30 && i._dde < 9999 && i._vend90 > 0))
    if (esf === 'com')         items = items.filter(i => i._saldo > 0)
    if (esf === 'sem')         items = items.filter(i => i._saldo <= 0)
    if (esf === 'baixo')       items = items.filter(i => i._saldo > 0 && i._dde < 30 && i._dde < 9999)

    items = [...items].sort((a, b) => {
      const va = a[sort], vb = b[sort]
      const na = parseFloat(va), nb = parseFloat(vb)
      const cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR')
      return dir === 'asc' ? cmp : -cmp
    })

    const total = items.length
    const p = parseInt(page), l = parseInt(limit)
    res.json({ total, totalNovo, totalReposicao, totalRuptura, page: p, items: items.slice(p * l, (p + 1) * l) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/compras/totais', async (req, res) => {
  try {
    const emp       = empValida(req.query.empresa)
    const all       = await getProdutos(emp)
    const cobertura = Math.max(1, parseInt(req.query.cobertura) || 60)
    const { grupo: gf = '', pedra: pf = '', tag2: tf = '', search: sq = '', codigo: cf = '', filial: fil = '' } = req.query

    // mapa de pedidos abertos (apenas 2026+) para descontar do valor de reposição
    const todosItens = await buildPedidosItens(emp)
    const pedidosItens = todosItens.filter(it => {
      const p = (it.emissao || '').split('/'); return p.length === 3 && parseInt(p[2]) >= 2026
    })
    const pedidosMap = {}
    pedidosItens.forEach(it => { pedidosMap[it.produto] = (pedidosMap[it.produto] || 0) + it.qtdSaldo })

    let items = applyFilial(all, fil)
    const q = sq.trim().toLowerCase()
    if (q)  items = items.filter(i => i.descricao?.toLowerCase().includes(q))
    if (cf) items = items.filter(i => i.produto?.toLowerCase().includes(cf.toLowerCase()) || i.produtoBase?.toLowerCase().includes(cf.toLowerCase()))
    if (gf) items = items.filter(i => (i.grupo || '').toLowerCase() === gf.toLowerCase())
    if (pf) items = items.filter(i => (i.pedra || '').toLowerCase() === pf.toLowerCase())
    if (tf) items = items.filter(i => (i.tag2  || '').toLowerCase() === tf.toLowerCase())

    const calcQtd = i => {
      const solicitado = pedidosMap[i.produto] || 0
      return Math.max(0, Math.ceil((i._vend90 / 90) * cobertura) - i._saldo - solicitado)
    }

    // só conta produtos que AINDA precisam de compra após descontar o solicitado
    const rupturaItems = items.filter(i => i._saldo <= 0 && i._vend30 > 0 && i._vend90 > 0 && calcQtd(i) > 0)
    const riscoItems   = items.filter(i => i._saldo > 0 && i._dde < 30 && i._dde < 9999 && i._vend90 > 0 && calcQtd(i) > 0)

    const valorRuptura = rupturaItems.reduce((s, i) => s + calcQtd(i) * (i._custo || 0), 0)
    const valorRisco   = riscoItems.reduce((s, i)   => s + calcQtd(i) * (i._custo || 0), 0)

    res.json({
      ruptura: { count: rupturaItems.length, valor: valorRuptura },
      risco:   { count: riscoItems.length,   valor: valorRisco },
      total:   { count: rupturaItems.length + riscoItems.length, valor: valorRuptura + valorRisco },
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/compras/export', async (req, res) => {
  try {
    const all = await getProdutos(empValida(req.query.empresa))
    const { ruptura: rf = 'risco', grupo: gf = '', pedra: pf = '', tag2: tf = '', search: sq = '', cobertura: cob = '60', filial: fil = '' } = req.query
    const cobertura = Math.max(1, parseInt(cob) || 60)

    let items = applyFilial(all, fil)
    const q = sq.trim().toLowerCase()
    if (q)  items = items.filter(i => i.descricao?.toLowerCase().includes(q))
    if (gf) items = items.filter(i => (i.grupo || '').toLowerCase() === gf.toLowerCase())
    if (pf) items = items.filter(i => (i.pedra || '').toLowerCase() === pf.toLowerCase())
    if (tf) items = items.filter(i => (i.tag2  || '').toLowerCase() === tf.toLowerCase())
    if (rf === 'ruptura') items = items.filter(i => i._saldo <= 0 && i._vend30 > 0 && i._vend90 > 0)
    if (rf === 'risco')   items = items.filter(i => i._saldo > 0 && i._dde < 30 && i._dde < 9999 && i._vend90 > 0)
    if (rf === 'todos')   items = items.filter(i => (i._saldo <= 0 && i._vend30 > 0 && i._vend90 > 0) || (i._saldo > 0 && i._dde < 30 && i._dde < 9999 && i._vend90 > 0))

    items.sort((a, b) => (a._dde ?? 9999) - (b._dde ?? 9999))

    const rows = items.map(i => {
      const qtdSug   = Math.max(0, Math.ceil((i._vend90 / 90) * cobertura) - i._saldo)
      const valRepor = qtdSug * (i._custo || 0)
      return {
        status:    i._saldo <= 0 && i._vend30 > 0 ? 'RUPTURA' : 'RISCO',
        codigo:    i.produtoBase || i.produto || '',
        variacao:  i.produto || '',
        descricao: i.descricao || '',
        grupo:     i.grupo || '',
        pedra:     i.pedra || '',
        tag2:      i.tag2  || '',
        foto:      i._foto || '',
        saldo:     i._saldo,
        disponivel:i._saldoDisp,
        vend30:    i._vend30,
        dde:       i._dde < 9999 ? i._dde : null,
        qtdSug,
        custo:     i._custo || 0,
        valRepor,
      }
    })

    res.json({ rows, cobertura, geradoEm: new Date().toLocaleString('pt-BR') })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/sugestoes', async (req, res) => {
  try {
    const items = (await getProdutos()).map(i => ({ ...i }))
    items.sort((a, b) => {
      const ua = a._saldo <= 0 && (a._vend30 > 0 || a._vendida > 0) ? 0 : a._dde
      const ub = b._saldo <= 0 && (b._vend30 > 0 || b._vendida > 0) ? 0 : b._dde
      return ua - ub
    })
    res.json(items)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/abc', async (req, res) => {
  try {
    const all = await getProdutos(empValida(req.query.empresa))
    const {
      tipo  = 'faturamento',
      abc:  abcF = '',
      grupo: gf  = '', pedra: pf = '', tag2: tf = '', categoria: catf = '', codigo: cf = '', search: sq = '',
      fornecedor: ff = '',
      page  = '0', limit = '100',
      sort  = '_metric', dir = 'desc',
      filial: fil = '',
    } = req.query

    // ── filtros ──
    let items = applyFilial(all, fil)
    const q = sq.trim().toLowerCase()
    if (q)     items = items.filter(i => i.descricao?.toLowerCase().includes(q))
    if (cf)    items = items.filter(i => (i.produto || '').toLowerCase().includes(cf.toLowerCase()) || (i.produtoBase || '').toLowerCase().includes(cf.toLowerCase()))
    if (gf)    items = items.filter(i => (i.grupo          || '').toLowerCase() === gf.toLowerCase())
    if (pf)    items = items.filter(i => (i.pedra          || '').toLowerCase() === pf.toLowerCase())
    if (tf)    items = items.filter(i => (i.tag2           || '').toLowerCase() === tf.toLowerCase())
    if (catf)  items = items.filter(i => (i.categoria      || '').toLowerCase() === catf.toLowerCase())
    if (ff)    items = items.filter(i => (i.nomeFornecedor || '').toLowerCase() === ff.toLowerCase())

    // ── métrica por tipo ──
    const metricFn = tipo === 'faturamento' ? i => (i._vend30 || 0) * (i._precoMedio || 0)
                   : tipo === 'unidades'    ? i => i._vend30 || 0
                   :                          i => i._valorEst || 0

    const sorted = [...items]
      .map(i => ({ ...i, _metric: metricFn(i) }))
      .sort((a, b) => b._metric - a._metric)

    // ── classificação ABC (cumulativa sobre todo o conjunto filtrado) ──
    const totalMetric = sorted.reduce((s, i) => s + i._metric, 0)
    let cum = 0
    const classified = sorted.map(i => {
      cum += i._metric
      const pct = totalMetric > 0 ? cum / totalMetric : 1
      return { ...i, _abc: pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C' }
    })

    const totalA = classified.filter(i => i._abc === 'A').length
    const totalB = classified.filter(i => i._abc === 'B').length
    const totalC = classified.filter(i => i._abc === 'C').length

    // ── filtro de curva ──
    let visible = abcF ? classified.filter(i => i._abc === abcF) : classified

    // ── ordenação adicional ──
    if (sort !== '_metric') {
      visible = [...visible].sort((a, b) => {
        const va = a[sort], vb = b[sort]
        const na = parseFloat(va), nb = parseFloat(vb)
        const cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR')
        return dir === 'asc' ? cmp : -cmp
      })
    } else if (dir === 'asc') {
      visible = [...visible].reverse()
    }

    const p = parseInt(page), l = parseInt(limit)
    res.json({
      total: visible.length, totalA, totalB, totalC,
      page: p,
      items: visible.slice(p * l, (p + 1) * l),
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/dashboard', async (req, res) => {
  try {
    const emp = empValida(req.query.empresa)
    const warmState = S(emp).warmState
    if (!warmState.done) {
      return res.json({
        loading:       true,
        pais:          warmState.pais,
        elapsed:       Math.round((Date.now() - warmState.startedAt) / 1000),
        totalProdutos: 0,
      })
    }

    const all = await getProdutos(emp)
    const { grupo: gf = '', pedra: pf = '', tag2: tf = '', search: sq = '', codigo: cf = '', tipo = 'todos', ruptura: rf = '', estoque: esf = '', filial: fil = '', fornecedor: ff = '' } = req.query

    let items = applyFilial(all, fil)
    const q = sq.trim().toLowerCase()
    if (q)   items = items.filter(i => i.descricao?.toLowerCase().includes(q))
    if (cf)  items = items.filter(i => i.produto?.toLowerCase().includes(cf.toLowerCase()) || i.produtoBase?.toLowerCase().includes(cf.toLowerCase()))
    if (gf)  items = items.filter(i => (i.grupo || '').toLowerCase() === gf.toLowerCase())
    if (pf)  items = items.filter(i => (i.pedra || '').toLowerCase() === pf.toLowerCase())
    if (tf)  items = items.filter(i => (i.tag2  || '').toLowerCase() === tf.toLowerCase())
    if (ff)  items = items.filter(i => (i.nomeFornecedor || '').toLowerCase() === ff.toLowerCase())
    if (tipo === 'novo')      items = items.filter(i => i.isNovo === true)
    if (tipo === 'reposicao') items = items.filter(i => i.isNovo === false)
    if (rf === 'ruptura')     items = items.filter(i => i._saldo <= 0 && i._vend30 > 0 && i._vend90 > 0)
    if (rf === 'risco')       items = items.filter(i => i._saldo > 0 && i._dde < 30 && i._dde < 9999 && i._vend90 > 0)
    if (rf === 'normalizado') items = items.filter(i => !(i._saldo <= 0 && i._vend30 > 0 && i._vend90 > 0) && !(i._saldo > 0 && i._dde < 30 && i._dde < 9999 && i._vend90 > 0))
    if (esf === 'com')        items = items.filter(i => i._saldo > 0)
    if (esf === 'sem')        items = items.filter(i => i._saldo <= 0)
    if (esf === 'baixo')      items = items.filter(i => i._saldo > 0 && i._dde < 30 && i._dde < 9999)

    let saldoTotal = 0, saldoDispTotal = 0, valorTotal = 0
    let custoPond  = 0, custoPeso = 0
    let giroTotal  = 0, giroCount = 0
    let ddeTotal   = 0, ddeCount  = 0
    let ativos = 0, vend30 = 0, vend60 = 0, vend90 = 0
    let vend30val = 0, vend60val = 0, vend90val = 0
    let vendidaTotal = 0

    items.forEach(i => {
      saldoTotal     += i._saldo
      saldoDispTotal += i._saldoDisp
      valorTotal     += i._valorEst
      vendidaTotal   += i._vendida
      vend30         += i._vend30
      vend60         += i._vend60
      vend90         += i._vend90
      vend30val      += i._vend30 * (i._preco || 0)
      vend60val      += i._vend60 * (i._preco || 0)
      vend90val      += i._vend90 * (i._preco || 0)
      if (i._saldo >= 1) ativos++
      if (i._custo > 0 && i._saldo > 0) { custoPond += i._custo * i._saldo; custoPeso += i._saldo }
      if (i._giro  > 0) { giroTotal += i._giro; giroCount++ }
      if (i._dde < 9999) { ddeTotal += i._dde; ddeCount++ }
    })

    // Período anterior (dias 31-60): diferença entre 60d e 30d
    const prevD30    = vend60 - vend30
    const prevD30val = vend60val - vend30val

    res.json({
      loading:          false,
      totalProdutos:    items.length,
      saldoEstoque:     saldoTotal,
      saldoDisponivel:  saldoDispTotal,
      valorEstoque:     valorTotal,
      custoMedio:       custoPeso > 0 ? custoPond / custoPeso : 0,
      giroMedio:        giroCount > 0 ? giroTotal / giroCount : 0,
      ddeMedio:         ddeCount  > 0 ? ddeTotal  / ddeCount  : 0,
      produtosAtivos:   ativos,
      totalVendidoUn:   vendidaTotal,
      vendasPorPeriodo: { d30: vend30, d60: vend60, d90: vend90, d30val: vend30val, d60val: vend60val, d90val: vend90val, prevD30, prevD30val },
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Blip ─────────────────────────────────────────────────────────────────────

async function blipGet(path, params = {}) {
  const url = new URL(`${BLIP_BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v) })
  const { data } = await axios.get(url.toString(), { headers: { Token: BLIP_TOKEN }, httpsAgent, timeout: 20000 })
  return data
}

app.get('/api/blip/clientes', async (req, res) => {
  try { res.json(await blipGet('/blip/clientes', { cpfcnpj: req.query.cpfcnpj })) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/blip/assistencia', async (req, res) => {
  try { res.json(await blipGet('/blip/assistencia', { cpfcnpj: req.query.cpfcnpj, limit: req.query.limit })) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/blip/assistencia/itens/:id', async (req, res) => {
  try { res.json(await blipGet(`/blip/assistencia/itens/${req.params.id}`, { cpfcnpj: req.query.cpfcnpj })) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Assistências (visão geral) ─────────────────────────────────────────────────
// Endpoint pesado (~24 MB). Cache próprio de 15 min. Agrega cards + linhas por produto.

let _assistCache = null, _assistCacheAt = 0, _assistFetching = null
const ASSIST_TTL = 15 * 60 * 1000

// Dispara o download pesado (~24 MB) e atualiza o cache ao concluir. Dedup: uma
// única promessa em andamento é compartilhada por todos os chamadores.
function startAssistFetch() {
  if (_assistFetching) return _assistFetching
  _assistFetching = (async () => {
    try {
      const { data } = await axios.get(`${COMPRAS_BASE}/assistencias/geral`, {
        headers: { Token: COMPRAS_TOKEN }, httpsAgent, timeout: 300000, decompress: true,
      })
      _assistCache = data
      _assistCacheAt = Date.now()
      return data
    } finally {
      _assistFetching = null
    }
  })()
  return _assistFetching
}

async function fetchAssistenciasGeral() {
  // Cache fresco → resposta instantânea
  if (_assistCache && Date.now() - _assistCacheAt < ASSIST_TTL) return _assistCache
  // Cache vencido mas existente → serve o "stale" na hora e atualiza em background
  // (não bloqueia a resposta nos ~8s do refetch; o próximo hit já pega o novo)
  if (_assistCache) {
    startAssistFetch().catch(() => {})
    return _assistCache
  }
  // Primeira carga (sem cache algum) → precisa aguardar o download
  return startAssistFetch()
}

// "28/04/2026" ou "28/04/2026 00:00:00" → Date (ou null)
function parseBRDate(s) {
  if (!s) return null
  const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  const d = new Date(+m[3], +m[2] - 1, +m[1])
  return isNaN(d.getTime()) ? null : d
}
const diasEntre = (a, b) => Math.round((b - a) / 86400000)

// status_assistencia: "Aberta" = em aberto; demais (Fechada/Cancelada/Resíduo/…) = encerrada
const isAberta = st => /abert/i.test(String(st || ''))

function buildAssistencias(geral, filtroStatus = 'abertas') {
  const clientes = Array.isArray(geral?.clientes) ? geral.clientes : []
  const hoje = new Date()

  let ossAbertas = 0, ossEncerradas = 0, produtosAbertos = 0
  let valorAberto = 0, valorFechado = 0
  let slaSoma = 0, slaBase = 0

  const rows = []

  for (const cli of clientes) {
    for (const os of (cli.assistencias_cliente || [])) {
      const produtos = os.produtos || []
      const valorOss = produtos.reduce((s, p) => {
        const sv = (p.servico || [])[0] || {}
        const u = Number(sv.valor_unitario) || 0, pg = Number(sv.peso_total_gramas) || 0, q = Number(p.quantidade) || 0
        return s + (pg > 0 ? u * pg : u) * q
      }, 0)
      const entrada  = parseBRDate(os.emissao)

      // Data de encerramento = maior data_retorno entre as assistências do fornecedor
      let dataRetorno = null
      for (const f of (os.assistencia_fornecedor || [])) {
        const d = parseBRDate(f.data_retorno)
        if (d && (!dataRetorno || d > dataRetorno)) dataRetorno = d
      }
      // Encerrada = tem data de encerramento (data_retorno); sem ela, está em aberto
      const aberta = !dataRetorno
      // Tem OSS do fornecedor? (assistência do fornecedor gerada)
      const temForn = (os.assistencia_fornecedor || []).length > 0
      // Fornecedor da OSS (nome) para fallback quando o produto não tem serviço
      const fornOss = (os.assistencia_fornecedor || [])[0] || {}

      if (aberta) {
        ossAbertas++; produtosAbertos += produtos.length; valorAberto += valorOss
        // SLA = tempo médio em aberto (aging): hoje − emissão das OSS abertas
        if (entrada) {
          const dias = diasEntre(entrada, hoje)
          if (dias >= 0) { slaSoma += dias; slaBase++ }
        }
      } else {
        ossEncerradas++; valorFechado += valorOss
      }

      // Filtro de quais linhas retornar
      if (filtroStatus === 'abertas'    && !aberta) continue
      if (filtroStatus === 'encerradas' &&  aberta) continue

      // Dias em aberto: conta da entrada até hoje; para de contar quando há data de encerramento (data_retorno)
      const diasEmAberto  = entrada ? Math.max(0, diasEntre(entrada, dataRetorno || hoje)) : null
      const diasDuracao   = (entrada && dataRetorno) ? Math.max(0, diasEntre(entrada, dataRetorno)) : null

      for (const p of produtos) {
        const serv = (p.servico || [])[0] || {}
        const valorUnit = Number(serv.valor_unitario) || 0
        const peso      = Number(serv.peso_total_gramas) || 0
        const qtd       = Number(p.quantidade) || 0
        // Serviço por grama (peso>0): unit × peso. Serviço por peça (peso=0): unit.
        const valorServ = peso > 0 ? valorUnit * peso : valorUnit
        rows.push({
          cliente:         cli.cliente,
          clienteNome:     cli.nome_cliente || cli.fantasia_cliente || '',
          osCliente:       os.codigo,
          codigoAssistencia: p.codigo_assistencia || os.codigo || '',
          item:            p.item || '',
          statusOss:       os.status_assistencia || '',
          aberta,
          temForn,
          produtoCod:      p.produto,
          produto:         p.descricao || '',
          codBarras:       p.cod_barras || '',
          quantidade:      qtd,
          valorProduto:    Number(p.valor_produto) || 0,
          operacao:        p.operacao || '',
          ultSituacao:     p.ult_situacao_servico || '',
          statusProduto:   p.situacao || p.ult_situacao_servico || '',
          fornecedor:      serv.nfornecedor_servico?.trim() || fornOss.nfornecedor?.trim() || '',
          fornecedorCod:   serv.fornecedor_servico || fornOss.fornecedor || '',
          osFornecedor:    serv.assistencia_fornecedor || fornOss.codigo || '',
          servicoDesc:     serv.descricao_servico?.trim() || '',
          valorUnit,
          peso,
          valor:           valorServ,          // valor do serviço (por grama: unit×peso; por peça: unit)
          valorTotal:      valorServ * qtd,     // valor total = valor serviço × quantidade
          dataEntrada:     os.emissao || '',
          diasEmAberto,
          dataEncerramento: dataRetorno ? dataRetorno.toLocaleDateString('pt-BR') : '',
          diasDuracao,
        })
      }
    }
  }

  return {
    updatedAt: new Date().toISOString(),
    cards: {
      ossAbertas,
      ossEncerradas,
      produtosAbertos,
      slaMedio:   slaBase > 0 ? Math.round(slaSoma / slaBase) : 0,
      slaBase,
      valorAberto,
      valorFechado,
      valorTotal: valorAberto + valorFechado,
    },
    rows,
  }
}

app.get('/api/assistencias/geral', async (req, res) => {
  try {
    const geral = await fetchAssistenciasGeral()
    const status = ['abertas', 'encerradas', 'todas'].includes(req.query.status) ? req.query.status : 'abertas'
    res.json(buildAssistencias(geral, status))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Financeiro (contas a receber) ──────────────────────────────────────────────
// O financeiro é atualizado no mesmo ciclo dos produtos (refreshTudo, com force):
// puxa tudo → pausa de 10 min → puxa de novo, idêntico ao compras. O TTL só evita que
// um hit no endpoint entre ciclos dispare fetch redundante (serve do cache/disco).
const FIN_TTL       = 15 * 60 * 1000        // 15 min
const FIN_PAGE_SIZE = 5000     // teto por resposta do endpoint
const FIN_MAX_PAGES = 60       // trava de segurança

// Persistência do financeiro em disco (gzip) — sobrevive a restart/deploy no volume.
function saveFinDisk(emp) {
  if (!DISK_PERSIST) return
  const st = S(emp), cfg = EMPRESAS[empValida(emp)]
  if (!st.finCache || !cfg.finDiskFile) return
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    const file = path.join(CACHE_DIR, cfg.finDiskFile)
    const payload = JSON.stringify({ ts: st.finCacheAt, total: st.finTotal || 0, data: st.finCache })
    fs.writeFileSync(file, require('zlib').gzipSync(Buffer.from(payload)))
    console.log(`[fin:${emp}] salvo em disco: ${st.finTotal} contas → ${file}`)
  } catch (e) { console.error(`[fin:${emp}] erro ao salvar disco:`, e.message) }
}

function loadFinDisk(emp) {
  try {
    const cfg = EMPRESAS[empValida(emp)]
    if (!cfg.finDiskFile) return
    const file = path.join(CACHE_DIR, cfg.finDiskFile)
    if (!fs.existsSync(file)) return
    const obj = JSON.parse(require('zlib').gunzipSync(fs.readFileSync(file)).toString('utf8'))
    const st = S(emp)
    st.finCache   = obj.data
    st.finTotal   = obj.total || 0
    st.finCacheAt = obj.ts || 0
    const age = Date.now() - (obj.ts || 0)
    console.log(`[fin:${emp}] cache carregado do disco: ${st.finTotal} contas (${Math.round(age / 3600000)}h atrás)`)
  } catch (e) { console.error(`[fin:${emp}] erro ao ler disco:`, e.message) }
}

// Enxuga cada conta para só os campos usados no build — evita reter ~190MB de JSON cru
function slimVendedores(V) {
  return (Array.isArray(V) ? V : []).map(v => ({
    Vendedor: v.Vendedor, NVendedor: v.NVendedor,
    ContasAReceber: (v.ContasAReceber || []).map(c => ({
      Numero: c.Numero, Prefixo: c.Prefixo, Emissao: c.Emissao, Historico: c.Historico,
      Nome: c.Nome, Cliente: c.Cliente,
      Parcelas: (c.Parcelas || []).map(p => ({
        Parcela: p.Parcela, ValorPago: p.ValorPago, SaldoAberto: p.SaldoAberto, ValorTotal: p.ValorTotal,
        Vencimento: p.Vencimento, VencimentoReal: p.VencimentoReal,
      })),
      Pagamentos: (c.Pagamentos || []).map(p => ({
        Tipo: p.Tipo, FormaPagamento: p.FormaPagamento,
        Numerario: p.Numerario, ValorPagoReais: p.ValorPagoReais,
        DataPagamento: p.DataPagamento,
      })),
    })),
  }))
}

const FIN_BATCH = 6    // páginas baixadas em paralelo por lote
const FIN_RETRY = 4    // tentativas por página para erros TRANSITÓRIOS (timeout/rede/502)

// Detecta o FIM real da paginação: a página fora do range faz a API gerar um SQL
// inválido e devolver 500 com {"mensagem":"ERROR [42601] ... erro de sintaxe ..."}.
// Só esse erro específico é "fim"; timeout / HTTP 000 / 502 = instabilidade (outage).
function isEndOfRange(e) {
  if (e.response?.status !== 500) return false
  const body = e.response?.data
  const msg = typeof body === 'string' ? body : (body?.mensagem || JSON.stringify(body || ''))
  return /42601|erro de sintaxe|syntax error/i.test(msg)
}

// Busca uma página. 4xx (403 token) propaga na hora. Fim de range → lança err.finEnd.
// Transitórios (timeout/rede/502) → re-tenta; se persistir, lança err.outage.
async function fetchFinPage(cfg, page, emp) {
  let lastErr
  for (let attempt = 1; attempt <= FIN_RETRY; attempt++) {
    try {
      const r = await axios.get(
        `${cfg.finBase}/financeiro/conta/receber?limit=${FIN_PAGE_SIZE}&page=${page}`,
        { headers: { Token: cfg.finToken }, httpsAgent, timeout: 300000, decompress: true }   // 5 min: a API às vezes demora minutos
      )
      return r.data
    } catch (e) {
      const st = e.response?.status
      if (st && st >= 400 && st < 500) throw e                    // 4xx (403) → propaga
      if (isEndOfRange(e)) { const end = new Error('fim do range'); end.finEnd = true; throw end }
      lastErr = e
      if (attempt < FIN_RETRY) {
        const delay = Math.min(1500 * attempt, 8000)
        console.warn(`[fin:${emp}] página ${page} tentativa ${attempt}/${FIN_RETRY}: ${e.message} (aguardando ${delay}ms)`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  const out = new Error(`página ${page} indisponível após ${FIN_RETRY} tentativas: ${lastErr?.message}`)
  out.outage = true
  throw out
}

// O endpoint é PAGINADO (?page=): a página 1 traz só "Sem Vendedor"; os vendedores
// reais estão nas seguintes. Percorro TODAS (em lotes paralelos) e junto os Vendedores.
// Fim = página vazia (0 contas) ou erro de fim-de-range (SQL 42601). Outage (timeout
// persistente) LANÇA err.outage — não trunca; o chamador re-tenta depois sem gravar lixo.
async function fetchFinanceiroAllPages(cfg, emp) {
  let vendedores = [], pagGeral = null, total = 0, done = false

  const first = await fetchFinPage(cfg, 1, emp)     // 403/outage na 1ª propaga
  if (Array.isArray(first?.PagamentoGeral)) pagGeral = first.PagamentoGeral
  {
    const V = Array.isArray(first?.Vendedores) ? first.Vendedores : []
    let c = 0; for (const v of V) c += (v.ContasAReceber || []).length
    if (c === 0) return { PagamentoGeral: pagGeral || [], Vendedores: [], total: 0 }
    vendedores = vendedores.concat(slimVendedores(V)); total += c
    console.log(`[fin:${emp}] página 1: ${c} contas (acum ${total})`)
  }

  let next = 2
  while (!done && next <= FIN_MAX_PAGES) {
    const pages = []
    for (let p = next; p < next + FIN_BATCH && p <= FIN_MAX_PAGES; p++) pages.push(p)
    const results = await Promise.all(pages.map(p =>
      fetchFinPage(cfg, p, emp).then(d => ({ p, d })).catch(e => ({ p, err: e }))
    ))
    results.sort((a, b) => a.p - b.p)
    for (const { p, d, err } of results) {
      if (done) break
      if (err) {
        if (err.finEnd) { console.log(`[fin:${emp}] fim do range na página ${p} (total ${total})`); done = true; break }
        throw err                                   // outage → aborta o fetch inteiro (não trunca)
      }
      const V = Array.isArray(d?.Vendedores) ? d.Vendedores : []
      let c = 0; for (const v of V) c += (v.ContasAReceber || []).length
      if (c === 0) { done = true; break }
      vendedores = vendedores.concat(slimVendedores(V)); total += c
      console.log(`[fin:${emp}] página ${p}: ${c} contas (acum ${total})`)
    }
    next += FIN_BATCH
  }
  return { PagamentoGeral: pagGeral || [], Vendedores: vendedores, total }
}

async function fetchFinanceiro(emp = 'alinare', force = false) {
  const st = S(emp), cfg = EMPRESAS[empValida(emp)]
  const fresh = st.finCache && Date.now() - st.finCacheAt < FIN_TTL
  if (fresh && !force) return st.finCache
  // dispara atualização (deduplicada) em segundo plano — NÃO bloqueia a resposta.
  // Cooldown após falha (outage) para não martelar a API a cada poll do front.
  if (!st.finFetching && Date.now() >= (st.finRetryAfter || 0)) {
    st.finFetching = (async () => {
      try {
        st.finError = null
        const data = await fetchFinanceiroAllPages(cfg, emp)
        const nova = data.total || 0, antiga = st.finTotal || 0
        // Guarda: não substitui um cache bom por um resultado menor.
        if (!st.finCache || nova >= antiga * 0.9) {
          st.finCache = data
          st.finCacheAt = Date.now()
          st.finTotal = nova
          console.log(`[fin:${emp}] cache atualizado: ${nova} contas`)
          saveFinDisk(emp)                 // persiste no volume — sobrevive a restart/deploy
        } else {
          st.finCacheAt = Date.now()
          console.warn(`[fin:${emp}] resultado ${nova} < ${antiga} — mantendo cache anterior`)
        }
        return st.finCache
      } catch (e) {
        st.finError = e                    // 403 (token) ou outage (instabilidade)
        // Outage: espera 20s antes de nova tentativa; 403: espera 5 min (token errado)
        st.finRetryAfter = Date.now() + (e.response?.status === 403 ? 300000 : 20000)
        console.warn(`[fin:${emp}] atualização falhou: ${e.message}`)
        throw e
      } finally { st.finFetching = null }
    })()
    st.finFetching.catch(() => {})       // evita unhandledRejection
  }
  // Nunca bloqueia: devolve o cache atual (pode ser null durante a 1ª carga).
  // O endpoint traduz null em { carregando: true }.
  return st.finCache
}

const brToInt = s => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? +(m[3] + m[2] + m[1]) : null }

// Parcela(s) de um título: nº quando única, lista quando parcelado (ex. "01/02/03")
function parcelaDeConta(c) {
  const nums = []
  for (const p of (c.Parcelas || [])) if (p.Parcela != null && String(p.Parcela).trim()) nums.push(String(p.Parcela).trim())
  return [...new Set(nums)].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).join('/')
}

function buildFinanceiro(fin, filtros = {}) {
  const vendedoresRaw = Array.isArray(fin?.Vendedores) ? fin.Vendedores : []
  const pagGeral      = Array.isArray(fin?.PagamentoGeral) ? fin.PagamentoGeral : []

  // Multi-seleção: valores separados por "|" (checkbox no front). Vazio = sem filtro.
  const splitSet = (s, low) => new Set(String(s || '').split('|').map(x => (low ? x.trim().toLowerCase() : x.trim())).filter(Boolean))
  const sitSet   = splitSet(filtros.situacao)            // 'pago' | 'aberto'
  const cliSet   = splitSet(filtros.cliente)             // códigos de cliente
  const modSet   = splitSet(filtros.modalidade, true)    // formas de pagamento (lower)
  const parcSet  = splitSet(filtros.parcela)             // parcelas (ex. "01", "01/02")
  const vencidas = filtros.vencidas === 'true' || filtros.vencidas === true
  const deInt    = filtros.de  ? +String(filtros.de).replace(/-/g, '')  : null   // aaaa-mm-dd
  const ateInt   = filtros.ate ? +String(filtros.ate).replace(/-/g, '') : null
  const pagDeInt  = filtros.pagDe  ? +String(filtros.pagDe).replace(/-/g, '')  : null
  const pagAteInt = filtros.pagAte ? +String(filtros.pagAte).replace(/-/g, '') : null
  const hoje     = new Date(); const hojeInt = hoje.getFullYear() * 10000 + (hoje.getMonth() + 1) * 100 + hoje.getDate()

  // Opções de cliente e de parcela = todo o cache (independe dos filtros ativos)
  const cliOpcMap = new Map()
  const parcOpcSet = new Set()
  for (const v of vendedoresRaw) for (const c of (v.ContasAReceber || [])) {
    const cod = c.Cliente || ''
    if (cod && !cliOpcMap.has(cod)) cliOpcMap.set(cod, c.Nome || cod)
    const pc = parcelaDeConta(c); if (pc) parcOpcSet.add(pc)
  }
  const clientesOpcoes = [...cliOpcMap.entries()]
    .map(([codigo, nome]) => ({ codigo, nome }))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
  const parcelasOpcoes = [...parcOpcSet].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))

  // Hierarquia: VENDEDOR → CLIENTE → CONTAS (filtros aplicados no nível da conta)
  const mapaV = {}
  for (const v of vendedoresRaw) {
    const vk = v.Vendedor || v.NVendedor || '—'
    for (const c of (v.ContasAReceber || [])) {
      let cPago = 0, cPend = 0, cDevido = 0, venc = ''
      for (const p of (c.Parcelas || [])) {
        cPago += Number(p.ValorPago) || 0
        cDevido += Number(p.ValorTotal) || 0            // valor devido (valor a pagar)
        const saldo = Number(p.SaldoAberto) || 0
        if (saldo > 0) { cPend += saldo; if (!venc) venc = p.VencimentoReal || p.Vencimento || '' }
      }
      const parcela = parcelaDeConta(c)   // nº quando única, lista quando parcelado
      const aberto = cPend > 0
      const formas = {}
      let pgData = '', pgDataInt = 0                     // última data de pagamento
      for (const pg of (c.Pagamentos || [])) {
        if ((pg.Tipo || '') !== 'Entrada') continue
        const forma = (pg.FormaPagamento || pg.Numerario || '—').trim()
        formas[forma] = (formas[forma] || 0) + (Number(pg.ValorPagoReais) || 0)
        const di = brToInt(pg.DataPagamento)
        if (di && di >= pgDataInt) { pgDataInt = di; pgData = pg.DataPagamento }
      }

      // ── filtros (multi-seleção) ──
      if (sitSet.size && !((aberto && sitSet.has('aberto')) || (!aberto && sitSet.has('pago')))) continue
      const emiInt = brToInt(c.Emissao)
      if (deInt  && (!emiInt || emiInt < deInt))  continue
      if (ateInt && (!emiInt || emiInt > ateInt)) continue
      // filtro por data de pagamento (contas sem pagamento saem quando o filtro está ativo)
      if (pagDeInt  && (!pgDataInt || pgDataInt < pagDeInt))  continue
      if (pagAteInt && (!pgDataInt || pgDataInt > pagAteInt)) continue
      if (vencidas) { const vInt = brToInt(venc); if (!(aberto && vInt && vInt < hojeInt)) continue }
      if (cliSet.size && !cliSet.has(c.Cliente)) continue
      if (modSet.size && !Object.keys(formas).some(f => modSet.has(f.toLowerCase()))) continue
      if (parcSet.size && !parcSet.has(parcela)) continue

      // Na visão "vencidas" só interessa o valor vencido a receber — zera o Concluído
      const pagoEf = vencidas ? 0 : cPago
      if (!mapaV[vk]) mapaV[vk] = { nome: v.NVendedor || v.Vendedor || '—', codigo: v.Vendedor || '', cli: {}, mod: {} }
      const cliMap = mapaV[vk].cli
      const key = c.Cliente || c.Nome || '—'
      if (!cliMap[key]) cliMap[key] = { nome: c.Nome || key, codigo: c.Cliente || '', devido: 0, pago: 0, pend: 0, mod: {}, contas: [] }
      cliMap[key].pago += pagoEf
      cliMap[key].pend += cPend
      cliMap[key].devido += cDevido
      // Modalidade(s) de pagamento desta conta — forma(s) ordenada(s) por valor
      const modalidadeConta = Object.entries(formas).filter(([, val]) => val > 0)
        .sort((a, b) => b[1] - a[1]).map(([f]) => f).join(', ')
      cliMap[key].contas.push({
        numero: c.Numero || '', prefixo: c.Prefixo || '', emissao: c.Emissao || '',
        historico: c.Historico || '', vencimento: venc, pagamento: vencidas ? '' : pgData,
        modalidade: vencidas ? '' : modalidadeConta, parcela,
        devido: cDevido, pago: pagoEf, pend: cPend, total: pagoEf + cPend, aberto,
      })
      if (!vencidas) for (const [forma, val] of Object.entries(formas)) {
        cliMap[key].mod[forma]  = (cliMap[key].mod[forma]  || 0) + val
        mapaV[vk].mod[forma]    = (mapaV[vk].mod[forma]    || 0) + val   // agregado do vendedor
      }
    }
  }

  let totPago = 0, totPend = 0, totDevido = 0
  const vendedores = Object.values(mapaV).map(v => {
    let vp = 0, vpe = 0, vd = 0
    const clientes = Object.values(v.cli).map(c => {
      const total = c.pago + c.pend
      const modalidades = Object.entries(c.mod).filter(([, x]) => x > 0)
        .map(([forma, valor]) => ({ forma, valor })).sort((a, b) => b.valor - a.valor)
      const { mod, ...rest } = c
      vp += c.pago; vpe += c.pend; vd += c.devido
      return { ...rest, total, pctPend: total > 0 ? (c.pend / total) * 100 : 0, modalidades }
    }).sort((a, b) => b.total - a.total)
    const vtotal = vp + vpe
    totPago += vp; totPend += vpe; totDevido += vd
    const modalidades = Object.entries(v.mod).filter(([, x]) => x > 0)
      .map(([forma, valor]) => ({ forma, valor })).sort((a, b) => b.valor - a.valor)
    return { nome: v.nome, codigo: v.codigo, devido: vd, pago: vp, pend: vpe, total: vtotal, pctPend: vtotal > 0 ? (vpe / vtotal) * 100 : 0, clientesCount: clientes.length, modalidades, clientes }
  }).sort((a, b) => b.total - a.total)
  const totGeral = totPago + totPend

  // Modalidade de pagamento (só valores pagos > 0)
  const modTotal = pagGeral.reduce((s, p) => s + (Number(p.ValorPago) || 0), 0)
  const modalidade = pagGeral
    .filter(p => (Number(p.ValorPago) || 0) > 0)
    .map(p => ({ forma: p.FormaPagamento || p.Numerario || '—', valor: Number(p.ValorPago) || 0, pct: modTotal > 0 ? (Number(p.ValorPago) / modTotal) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor)

  return {
    updatedAt: new Date().toISOString(),
    cards: { concluido: totPago, pendente: totPend, total: totGeral, pctPend: totGeral > 0 ? (totPend / totGeral) * 100 : 0 },
    vendedores,
    modalidade,
    modalidadeTotal: modTotal,
    clientes: clientesOpcoes,
    parcelas: parcelasOpcoes,
  }
}

app.get('/api/financeiro', async (req, res) => {
  try {
    const emp = empValida(req.query.empresa)
    const fin = await fetchFinanceiro(emp)
    if (!fin) {
      const st = S(emp), err = st.finError
      if (err && err.response?.status === 403) {
        return res.json({ erro: 'Acesso negado ao financeiro desta empresa (token).', cards: {}, vendedores: [], modalidade: [] })
      }
      // 1ª carga ou instabilidade da API (outage) — frontend fica "carregando" e repolla
      return res.json({ carregando: true, cards: {}, vendedores: [], modalidade: [] })
    }
    const { de, ate, pagDe, pagAte, situacao, vencidas, cliente, modalidade, parcela } = req.query
    res.json(buildFinanceiro(fin, { de, ate, pagDe, pagAte, situacao, vencidas, cliente, modalidade, parcela }))
  } catch (e) {
    res.status(200).json({ erro: e.message, cards: {}, vendedores: [], modalidade: [] })
  }
})

// ─── Alertas de ruptura ───────────────────────────────────────────────────────
app.get('/api/alertas', async (req, res) => {
  try {
    const emp = empValida(req.query.empresa)
    if (!S(emp).warmState.done) return res.json({ loading: true, ruptura: [], risco: [] })
    const [all, pedItens] = await Promise.all([getProdutos(emp), buildPedidosItens(emp)])

    // mapa produto → saldo pendente em pedidos de compra
    const pedSaldo = {}
    pedItens.forEach(it => {
      pedSaldo[it.produto] = (pedSaldo[it.produto] || 0) + (it.qtdSaldo || 0)
    })

    // se o saldo de pedidos cobre >= 30 dias de vendas, produto não precisa de alerta
    function cobertoPorPedido(i) {
      const saldoPed = pedSaldo[i.produto] || 0
      if (saldoPed <= 0) return false
      const vendaDia = (i._vend30 ?? 0) / 30
      if (vendaDia <= 0) return false
      return saldoPed / vendaDia >= 30
    }

    const ruptura = all
      .filter(i => i._saldo <= 0 && (i._vend30 ?? 0) > 0 && !cobertoPorPedido(i))
      .sort((a, b) => (b._vend30 ?? 0) - (a._vend30 ?? 0))
      .slice(0, 50)
      .map(i => ({ produto: i.produto, descricao: i.descricao, grupo: i.grupo, vend30: i._vend30, foto: i._foto, nomeFornecedor: i.nomeFornecedor }))

    const risco = all
      .filter(i => i._saldo > 0 && (i._dde ?? 9999) < 30 && (i._dde ?? 9999) < 9999 && (i._vend90 ?? 0) > 0 && !cobertoPorPedido(i))
      .sort((a, b) => (a._dde ?? 9999) - (b._dde ?? 9999))
      .slice(0, 30)
      .map(i => ({ produto: i.produto, descricao: i.descricao, grupo: i.grupo, dde: i._dde, saldo: i._saldo, vend30: i._vend30, foto: i._foto, nomeFornecedor: i.nomeFornecedor }))

    res.json({ loading: false, ruptura, risco })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/cache', (req, res) => {
  refresh()   // inicia refresh em background, retorna imediatamente
  res.json({ ok: true, message: 'Atualização iniciada em background' })
})

// ─── Admin: gerenciar usuários via service role ───────────────────────────────
const SUPABASE_URL     = process.env.SUPABASE_URL     || 'https://xfepdojkkxdivfykopwj.supabase.co'
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_KEY || ''

async function supabaseAdmin(method, path, body, extra = {}) {
  const res = await axios({ method, url: `${SUPABASE_URL}${path}`,
    headers: {
      apikey: SUPABASE_SVC_KEY,
      Authorization: `Bearer ${SUPABASE_SVC_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
      ...extra,
    },
    data: body, httpsAgent, validateStatus: () => true })
  if (res.status >= 400) console.error(`[supabaseAdmin] ${method} ${path} → ${res.status}`, JSON.stringify(res.data).slice(0,300))
  return res.data
}

// Lista todos os perfis + permissões
app.get('/api/admin/usuarios', async (req, res) => {
  try {
    const [profs, perms] = await Promise.all([
      supabaseAdmin('GET', '/rest/v1/profiles?select=*&order=nome.asc'),
      supabaseAdmin('GET', '/rest/v1/permissoes?select=*'),
    ])
    const profList = Array.isArray(profs) ? profs : []

    // Mescla com os usuários de autenticação — garante que TODOS apareçam,
    // mesmo quem ainda não tem linha em profiles (ex.: nunca fez login).
    try {
      const auth = await supabaseAdmin('GET', '/auth/v1/admin/users?per_page=1000')
      const authUsers = auth?.users || (Array.isArray(auth) ? auth : [])
      const byId = new Map(profList.map(p => [p.id, p]))
      for (const u of authUsers) {
        const p = byId.get(u.id)
        if (!p) {
          profList.push({ id: u.id, nome: u.email || 'Usuário', email: u.email, empresa: 'ambas', role: 'usuario', ativo: true, semProfile: true })
        } else if (!p.email) {
          p.email = u.email
        }
      }
      profList.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')))
    } catch (e) { console.warn('[admin/usuarios] auth merge falhou:', e.message) }

    res.json({ profiles: profList, permissoes: Array.isArray(perms) ? perms : [] })
  } catch (e) { console.error('[admin/usuarios] erro:', e.message); res.status(500).json({ error: e.message }) }
})

// Atualiza perfil
app.patch('/api/admin/usuarios/:id', async (req, res) => {
  try {
    const { id } = req.params
    await supabaseAdmin('PATCH', `/rest/v1/profiles?id=eq.${id}`, req.body)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Deleta usuário (Auth + perfil + permissões)
app.delete('/api/admin/usuarios/:id', async (req, res) => {
  try {
    const { id } = req.params
    await Promise.all([
      supabaseAdmin('DELETE', `/rest/v1/permissoes?user_id=eq.${id}`),
      supabaseAdmin('DELETE', `/rest/v1/profiles?id=eq.${id}`),
    ])
    await supabaseAdmin('DELETE', `/auth/v1/admin/users/${id}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Upsert permissão
app.post('/api/admin/permissoes', async (req, res) => {
  try {
    const rows = Array.isArray(req.body) ? req.body : [req.body]
    const result = await supabaseAdmin('POST', '/rest/v1/permissoes', rows)
    console.log('[admin/permissoes] result:', JSON.stringify(result).slice(0, 200))
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/admin/criar-usuario', async (req, res) => {
  try {
    const { email, password, nome, empresa, role } = req.body
    if (!email || !password || !nome) return res.status(400).json({ error: 'email, password e nome são obrigatórios' })

    // Cria usuário no Supabase Auth
    const authRes = await axios.post(`${SUPABASE_URL}/auth/v1/admin/users`,
      { email, password, email_confirm: true, user_metadata: { nome, empresa, role } },
      { headers: { apikey: SUPABASE_SVC_KEY, Authorization: `Bearer ${SUPABASE_SVC_KEY}` }, httpsAgent, validateStatus: () => true }
    )
    if (authRes.data?.error || authRes.status >= 400) {
      const msg = authRes.data?.msg || authRes.data?.error || 'Erro ao criar usuário'
      return res.status(400).json({ error: msg })
    }

    const userId = authRes.data.id
    const PAGINAS = ['dashboard','curva_abc','compras','compras.exportar','pedidos','fornecedores','fornecedores.duplicados','clientes','assistencias']

    // Upsert profile
    await axios.post(`${SUPABASE_URL}/rest/v1/profiles`,
      { id: userId, nome, empresa: empresa || 'ambas', role: role || 'usuario', ativo: true },
      { headers: { apikey: SUPABASE_SVC_KEY, Authorization: `Bearer ${SUPABASE_SVC_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, httpsAgent }
    )

    // Insere permissões (todas negadas por padrão para usuário)
    if (role !== 'admin') {
      const perms = PAGINAS.map(chave => ({ user_id: userId, chave, liberado: false }))
      await axios.post(`${SUPABASE_URL}/rest/v1/permissoes`, perms,
        { headers: { apikey: SUPABASE_SVC_KEY, Authorization: `Bearer ${SUPABASE_SVC_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, httpsAgent }
      )
    }

    res.json({ ok: true, userId })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Serve o frontend em produção
const distPath = require('path').join(__dirname, '..', 'dist')
if (require('fs').existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (req, res) => res.sendFile(require('path').join(distPath, 'index.html')))
}

app.listen(PORT, () => console.log(`✓  API em http://localhost:${PORT}`))
