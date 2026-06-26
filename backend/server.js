require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const express = require('express')
const cors    = require('cors')
const axios   = require('axios')
const https   = require('https')
const fs      = require('fs')
const path    = require('path')

const app  = express()
const PORT = 3001

const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true })

const BLIP_BASE    = 'https://api.blip.alinare.indepcloud.com.br:28876'
const COMPRAS_BASE = 'https://api.compras.alinare.indepcloud.com.br:30661'
const FOTO_BASE    = 'https://fotos.alinare.indepcloud.com.br'
const BLIP_TOKEN    = '81cbd168-790a-409b-b5d1-2df9c6a1fc61'
const COMPRAS_TOKEN = 'f7d36a19-b46b-4fc9-b064-db8e15be9110'

app.use(cors())
app.use(express.json())

// ─── cache (memória + disco) ─────────────────────────────────────────────────

const DISK_CACHE      = path.join(__dirname, 'cache_compras.json')
const CACHE_TTL       = 30 * 60 * 1000   // 30 minutos (refresh automático)
const DISK_MAX_AGE    = 12 * 60 * 60 * 1000  // disco válido por 12h para startup rápido

const cache = new Map()

function cacheGet(k) {
  const e = cache.get(k)
  return (e && Date.now() - e.ts < CACHE_TTL) ? e.data : null
}

function cacheSet(k, d) {
  cache.set(k, { data: d, ts: Date.now() })
  // Persiste "compras_all" em disco para startup rápido
  if (k === 'compras_all') {
    try {
      fs.writeFileSync(DISK_CACHE, JSON.stringify({ ts: Date.now(), data: d }))
      console.log(`[disk] cache salvo: ${d.length} produtos`)
    } catch (e) { console.error('[disk] erro ao salvar:', e.message) }
  }
}

function loadDiskCache() {
  try {
    if (!fs.existsSync(DISK_CACHE)) return null
    const raw  = fs.readFileSync(DISK_CACHE, 'utf8')
    const obj  = JSON.parse(raw)
    const age  = Date.now() - obj.ts
    if (age > DISK_MAX_AGE) { console.log('[disk] cache expirado, buscando API…'); return null }
    console.log(`[disk] cache carregado: ${obj.data.length} produtos (${Math.round(age/60000)}min atrás)`)
    cache.set('compras_all', { data: obj.data, ts: obj.ts })
    return obj.data
  } catch (e) { console.error('[disk] erro ao ler:', e.message); return null }
}

// ─── Grupos permitidos ───────────────────────────────────────────────────────

const GRUPOS = new Set([
  'PULSEIRA', 'BRINCO', 'ANEL', 'CORRENTE',
  'CONJUNTO', 'PINGENTE', 'TORNOZELEIRA', 'TARRAXA',
])

// ─── estado do pré-aquecimento ───────────────────────────────────────────────

const warmState = { done: false, pais: 0, skus: 0, error: null, startedAt: null, lastRefreshed: null }

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

let _fetchingPromise = null   // evita chamadas simultâneas

async function fetchFromAPI() {
  // Se já há uma busca em andamento, aguarda a mesma promise
  if (_fetchingPromise) return _fetchingPromise

  _fetchingPromise = (async () => {
    const PAGE      = 1000
    const MAX_RETRY = 3
    const all       = []
    let   page      = 1
    let   emptyStreak = 0

    console.log('[API] buscando produtos pai (100/pág, sequencial)…')

    while (true) {
      const url = new URL(`${COMPRAS_BASE}/Compras`)
      url.searchParams.set('limit', String(PAGE))
      url.searchParams.set('page',  String(page))

      let result = null
      for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        try {
          const { data } = await axios.get(url.toString(), {
            headers:    { Token: COMPRAS_TOKEN },
            httpsAgent,
            timeout:    300000,
            decompress: true,
          })
          result = Array.isArray(data) ? data : []
          break
        } catch (e) {
          console.warn(`[API] pág ${page} tentativa ${attempt}/${MAX_RETRY}: ${e.message}`)
          if (attempt < MAX_RETRY) await new Promise(r => setTimeout(r, 500))
        }
      }

      if (result === null) {
        emptyStreak++
        if (emptyStreak >= 3) break
      } else if (result.length === 0 || (page > 1 && result.length === 1)) {
        emptyStreak++
        if (emptyStreak >= 2) break
      } else {
        emptyStreak = 0
        all.push(...result)
        warmState.pais = all.length
        console.log(`[API] pág ${page} → +${result.length} (total ${all.length})`)
      }

      page++
      if (page > 500) break
    }

    console.log(`[API] total final: ${all.length} produtos pai`)
    return all
  })().finally(() => { _fetchingPromise = null })

  return _fetchingPromise
}

// ─── Busca TODAS as páginas (com cache) ──────────────────────────────────────

async function fetchAllCompras() {
  const key = 'compras_all'
  const hit = cacheGet(key)
  if (hit) { console.log(`[cache] ${hit.length} produtos pai`); return hit }

  const disk = loadDiskCache()
  if (disk) { warmState.pais = disk.length; return disk }

  const all = await fetchFromAPI()
  cacheSet(key, all)
  return all
}

// ─── Expande variacoes em linhas individuais ──────────────────────────────────

function expandVariacoes(parents) {
  const rows = []
  parents.forEach(pai => {
    // Filtra grupos que não interessam
    const grupoPai = (pai.grupo || '').toUpperCase()
    if (!GRUPOS.has(grupoPai)) return

    const variacoes = pai.variacoes || []
    if (variacoes.length === 0) { rows.push(buildRow(pai, null)); return }
    variacoes.forEach(v => {
      const grupoV = (v.grupo || grupoPai).toUpperCase()
      if (GRUPOS.has(grupoV)) rows.push(buildRow(pai, v))
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
  const saldo    = saldo01 + saldo04 || n(item.estoque_atual)
  const saldoD   = saldoD01 + saldoD04 || n(item.estoque_disponivel)
  const valorEst = n(item.valor_estoque_atual_01) + n(item.valor_estoque_atual_04) || n(item.valor_estoque_atual)
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
    dde  = saldo > 0 ? Math.round(saldo / (vend30 / 30)) : 0
    giro = saldo > 0 ? +((vend30 * 365 / 30) / saldo).toFixed(1) : 0
  } else if (vendida > 0) {
    const entrada = parseDateBR(item.data_entrada || pai.data_entrada)
    const dias    = entrada ? Math.max(1, (Date.now() - entrada) / 86400000) : 365
    const diario  = vendida / dias
    dde  = diario > 0 ? Math.round(saldo / diario) : 9999
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

async function getProdutos() {
  const key = 'produtos_enriched'
  const hit = cacheGet(key)
  if (hit) return hit

  const parents = await fetchAllCompras()
  const items   = expandVariacoes(parents)

  items.sort((a, b) => b._valorEst - a._valorEst)
  const total = items.reduce((s, i) => s + i._valorEst, 0)
  let cum = 0
  items.forEach(i => {
    cum += i._valorEst
    i._abc = total > 0 ? (cum / total <= 0.8 ? 'A' : cum / total <= 0.95 ? 'B' : 'C') : '-'
  })

  warmState.skus = items.length
  warmState.done = true
  cacheSet(key, items)
  return items
}

// ─── Pré-aquece e agenda refresh automático a cada 30 min ───────────────────

let refreshing = false

async function refresh() {
  if (refreshing) return
  refreshing = true
  warmState.error = null

  try {
    console.log('[refresh] buscando dados novos (dados antigos permanecem disponíveis)…')

    const parents = await fetchFromAPI()

    // Valida integridade: só aceita se tiver pelo menos 95% dos produtos anteriores
    const prevCache = cacheGet('compras_all')
    const prevCount = prevCache ? prevCache.length : 0
    if (prevCount > 0 && parents.length < prevCount * 0.95) {
      console.warn(`[refresh] DESCARTADO — novo fetch retornou ${parents.length} produtos mas o cache tem ${prevCount} (< 95%). Mantendo dados anteriores.`)
      return
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
    cacheSet('compras_all', parents)
    cacheSet('produtos_enriched', items)
    warmState.skus          = items.length
    warmState.pais          = parents.length
    warmState.done          = true
    warmState.lastRefreshed = Date.now()
    console.log(`[refresh] concluído: ${items.length} SKUs às ${new Date().toLocaleTimeString('pt-BR')}`)
  } catch (e) {
    warmState.error = e.message
    console.error('[refresh] erro:', e.message)
  } finally {
    refreshing = false
  }
}

// Carga inicial: usa disco se disponível (startup rápido), senão busca API
async function initialLoad() {
  warmState.startedAt = Date.now()
  try {
    await getProdutos()   // usa disco se fresco, senão busca API
    warmState.lastRefreshed = Date.now()
    console.log(`[warm] pronto: ${warmState.skus} SKUs`)
  } catch (e) {
    warmState.error = e.message
    console.error('[warm] erro:', e.message)
  }
}

// Loop contínuo: terminou → já inicia o próximo. Só aplica quando os dados estão completos.
async function refreshLoop() {
  await initialLoad()
  // Pré-aquece pedidos e fornecedores em background após produtos carregarem
  warmPedidosForn().catch(() => {})
  while (true) {
    await refresh()
    warmPedidosForn().catch(() => {})
  }
}

refreshLoop()

// ─── endpoints ───────────────────────────────────────────────────────────────

// ── Pedidos de compra ────────────────────────────────────────────────────────
let _pedidosCache    = null
let _pedidosCacheAt  = 0
let _pedidosItens    = null
let _pedidosItensAt  = 0
let _fornCache       = null
let _fornCacheAt     = 0
const PEDIDOS_TTL    = 10 * 60 * 1000 // 10 min

async function fetchPedidos() {
  if (_pedidosCache && Date.now() - _pedidosCacheAt < PEDIDOS_TTL) return _pedidosCache
  const { data } = await axios.get(`${COMPRAS_BASE}/Compras/Pedidos`, {
    headers: { Token: COMPRAS_TOKEN }, httpsAgent, timeout: 60000,
  })
  _pedidosCache = data
  _pedidosCacheAt = Date.now()
  return data
}

// Constrói lista de todos os itens pendentes com cache próprio
async function buildPedidosItens() {
  if (_pedidosItens && Date.now() - _pedidosItensAt < PEDIDOS_TTL) return _pedidosItens
  const raw = await fetchPedidos()
  const all = await getProdutos()
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
  _pedidosItens   = itens
  _pedidosItensAt = Date.now()
  return itens
}

// Pré-aquece pedidos + fornecedores no background
async function warmPedidosForn() {
  try {
    console.log('[warm] pré-aquecendo pedidos e fornecedores...')
    await buildPedidosItens()
    // Invalida cache de fornecedores para recomputar com dados frescos
    _fornCache   = null
    _fornCacheAt = 0
    console.log('[warm] pedidos e fornecedores prontos')
  } catch (e) {
    console.warn('[warm] erro:', e.message)
  }
}

app.get('/api/pedidos', async (req, res) => {
  try {
    const itens = await buildPedidosItens()
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
    const todos = await buildPedidosItens()
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

async function buildFornecedores() {
  if (_fornCache && Date.now() - _fornCacheAt < FORN_TTL) return _fornCache

  // fonte 1: todos os produtos do catálogo (têm nome_fornecedor)
  const prods = await getProdutos()

  // fonte 2: pedidos de compra (para cruzar qtd comprada, valor, saldo pendente)
  const pedidosItens = await buildPedidosItens()

  const result = _computeFornecedores(prods, pedidosItens, null, null, null)
  _fornCache   = result
  _fornCacheAt = Date.now()
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

        const isRuptura = (p._saldo || 0) === 0 && (p._vend30 || 0) > 0 && (p._vend90 || 0) > 0
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
    const { dataInicio, dataFim, fornecedor: fornFiltro } = req.query
    const temFiltro = dataInicio || dataFim || fornFiltro

    if (!temFiltro) {
      // Sem filtros → usa cache computado no startup
      const cached = await buildFornecedores()
      return res.json(cached)
    }

    // Com filtros → recalcula em cima dos dados já cacheados
    const prods       = await getProdutos()
    const pedidosItens = await buildPedidosItens()
    const result = _computeFornecedores(prods, pedidosItens, dataInicio, dataFim, fornFiltro)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/image-proxy', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url required' })
  try {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 })
    res.set('Content-Type', r.headers['content-type'] || 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(Buffer.from(r.data))
  } catch { res.status(404).end() }
})

app.get('/api/status', (req, res) => {
  const elapsed = Math.round((Date.now() - warmState.startedAt) / 1000)
  res.json({ ...warmState, elapsed })
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
    const all    = await getProdutos()
    const grupos     = [...new Set(all.map(i => i.grupo).filter(Boolean))].sort()
    const pedras     = [...new Set(all.map(i => i.pedra).filter(Boolean))].sort()
    const tag2s      = [...new Set(all.map(i => i.tag2).filter(Boolean))].sort()
    const categorias = [...new Set(all.map(i => i.categoria).filter(Boolean))].sort()
    res.json({ grupos, pedras, tag2s, categorias })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Aplica visão de filial — sobrescreve _saldo/_saldoDisp conforme seleção
function applyFilial(items, filial) {
  if (!filial || filial === 'todos') return items
  return items.map(i => {
    const s  = filial === '01' ? i._saldo01  : i._saldo04
    const sd = filial === '01' ? i._saldoDisp01 : i._saldoDisp04
    const dde = i._vend30 > 0 && s > 0 ? Math.round(s / (i._vend30 / 30)) : (i._vend30 > 0 && s === 0 ? 0 : 9999)
    return { ...i, _saldo: s, _saldoDisp: sd, _dde: dde }
  })
}

app.get('/api/produtos', async (req, res) => {
  try {
    const all = await getProdutos()
    const { view = 'list', page = '0', limit = '100', sort = '_valorEst', dir = 'desc', search = '', tipo = 'todos', grupo: gf = '', pedra: pf = '', tag2: tf = '', codigo: cf = '', ruptura: rf = '', categoria: catf = '', estoque: esf = '', filial: fil = '' } = req.query

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
      if (tipo !== 'todos') grpItems = grpItems.filter(i => tipo === 'novo' ? i.isNovo : !i.isNovo)
      if (rf)    grpItems = grpItems.filter(i => rf === 'risco' ? (i._dde < 30 && i._dde < 9999) : rf === 'ruptura' ? i._dde === 0 : true)
      if (esf === 'com')   grpItems = grpItems.filter(i => i._saldo > 0)
      if (esf === 'sem')   grpItems = grpItems.filter(i => i._saldo === 0)
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

    const totalNovo      = items.filter(i => i.isNovo === true).length
    const totalReposicao = items.filter(i => i.isNovo === false).length
    const totalRuptura   = items.filter(i => (i._saldo === 0 && i._vend30 > 0) || (i._dde < 30 && i._dde < 9999)).length

    if (tipo === 'novo')       items = items.filter(i => i.isNovo === true)
    if (tipo === 'reposicao')  items = items.filter(i => i.isNovo === false)
    if (rf === 'ruptura')      items = items.filter(i => i._saldo === 0 && i._vend30 > 0 && i._vend90 > 0)
    if (rf === 'risco')        items = items.filter(i => i._saldo > 0 && i._dde < 30 && i._dde < 9999 && i._vend90 > 0)
    if (rf === 'normalizado')  items = items.filter(i => !(i._saldo === 0 && i._vend30 > 0 && i._vend90 > 0) && !(i._saldo > 0 && i._dde < 30 && i._dde < 9999 && i._vend90 > 0))
    if (esf === 'com')         items = items.filter(i => i._saldo > 0)
    if (esf === 'sem')         items = items.filter(i => i._saldo === 0)
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
    const all       = await getProdutos()
    const cobertura = Math.max(1, parseInt(req.query.cobertura) || 60)
    const { grupo: gf = '', pedra: pf = '', tag2: tf = '', search: sq = '', codigo: cf = '', filial: fil = '' } = req.query

    // mapa de pedidos abertos (apenas 2026+) para descontar do valor de reposição
    const todosItens = await buildPedidosItens()
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
      return Math.max(0, Math.ceil((i._vend30 / 30) * cobertura) - i._saldo - solicitado)
    }

    // só conta produtos que AINDA precisam de compra após descontar o solicitado
    const rupturaItems = items.filter(i => i._saldo === 0 && i._vend30 > 0 && i._vend90 > 0 && calcQtd(i) > 0)
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
    const all = await getProdutos()
    const { ruptura: rf = 'risco', grupo: gf = '', pedra: pf = '', tag2: tf = '', search: sq = '', cobertura: cob = '60', filial: fil = '' } = req.query
    const cobertura = Math.max(1, parseInt(cob) || 60)

    let items = applyFilial(all, fil)
    const q = sq.trim().toLowerCase()
    if (q)  items = items.filter(i => i.descricao?.toLowerCase().includes(q))
    if (gf) items = items.filter(i => (i.grupo || '').toLowerCase() === gf.toLowerCase())
    if (pf) items = items.filter(i => (i.pedra || '').toLowerCase() === pf.toLowerCase())
    if (tf) items = items.filter(i => (i.tag2  || '').toLowerCase() === tf.toLowerCase())
    if (rf === 'ruptura') items = items.filter(i => i._saldo === 0 && i._vend30 > 0 && i._vend90 > 0)
    if (rf === 'risco')   items = items.filter(i => i._saldo > 0 && i._dde < 30 && i._dde < 9999 && i._vend90 > 0)
    if (rf === 'todos')   items = items.filter(i => (i._saldo === 0 && i._vend30 > 0 && i._vend90 > 0) || (i._saldo > 0 && i._dde < 30 && i._dde < 9999 && i._vend90 > 0))

    items.sort((a, b) => (a._dde ?? 9999) - (b._dde ?? 9999))

    const rows = items.map(i => {
      const qtdSug   = Math.max(0, Math.ceil((i._vend30 / 30) * cobertura) - i._saldo)
      const valRepor = qtdSug * (i._custo || 0)
      return {
        status:    i._saldo === 0 && i._vend30 > 0 ? 'RUPTURA' : 'RISCO',
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
      const ua = a._saldo === 0 && (a._vend30 > 0 || a._vendida > 0) ? 0 : a._dde
      const ub = b._saldo === 0 && (b._vend30 > 0 || b._vendida > 0) ? 0 : b._dde
      return ua - ub
    })
    res.json(items)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/abc', async (req, res) => {
  try {
    const all = await getProdutos()
    const {
      tipo  = 'faturamento',
      abc:  abcF = '',
      grupo: gf  = '', pedra: pf = '', tag2: tf = '', categoria: catf = '', codigo: cf = '', search: sq = '',
      page  = '0', limit = '100',
      sort  = '_metric', dir = 'desc',
      filial: fil = '',
    } = req.query

    // ── filtros ──
    let items = applyFilial(all, fil)
    const q = sq.trim().toLowerCase()
    if (q)     items = items.filter(i => i.descricao?.toLowerCase().includes(q))
    if (cf)    items = items.filter(i => (i.produto || '').toLowerCase().includes(cf.toLowerCase()) || (i.produtoBase || '').toLowerCase().includes(cf.toLowerCase()))
    if (gf)    items = items.filter(i => (i.grupo     || '').toLowerCase() === gf.toLowerCase())
    if (pf)    items = items.filter(i => (i.pedra     || '').toLowerCase() === pf.toLowerCase())
    if (tf)    items = items.filter(i => (i.tag2      || '').toLowerCase() === tf.toLowerCase())
    if (catf)  items = items.filter(i => (i.categoria || '').toLowerCase() === catf.toLowerCase())

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
    if (!warmState.done) {
      return res.json({
        loading:       true,
        pais:          warmState.pais,
        elapsed:       Math.round((Date.now() - warmState.startedAt) / 1000),
        totalProdutos: 0,
      })
    }

    const all = await getProdutos()
    const { grupo: gf = '', pedra: pf = '', tag2: tf = '', search: sq = '', codigo: cf = '', tipo = 'todos', ruptura: rf = '', estoque: esf = '', filial: fil = '' } = req.query

    let items = applyFilial(all, fil)
    const q = sq.trim().toLowerCase()
    if (q)   items = items.filter(i => i.descricao?.toLowerCase().includes(q))
    if (cf)  items = items.filter(i => i.produto?.toLowerCase().includes(cf.toLowerCase()) || i.produtoBase?.toLowerCase().includes(cf.toLowerCase()))
    if (gf)  items = items.filter(i => (i.grupo || '').toLowerCase() === gf.toLowerCase())
    if (pf)  items = items.filter(i => (i.pedra || '').toLowerCase() === pf.toLowerCase())
    if (tf)  items = items.filter(i => (i.tag2  || '').toLowerCase() === tf.toLowerCase())
    if (tipo === 'novo')      items = items.filter(i => i.isNovo === true)
    if (tipo === 'reposicao') items = items.filter(i => i.isNovo === false)
    if (rf === 'ruptura')     items = items.filter(i => i._saldo === 0 && i._vend30 > 0 && i._vend90 > 0)
    if (rf === 'risco')       items = items.filter(i => i._saldo > 0 && i._dde < 30 && i._dde < 9999 && i._vend90 > 0)
    if (rf === 'normalizado') items = items.filter(i => !(i._saldo === 0 && i._vend30 > 0 && i._vend90 > 0) && !(i._saldo > 0 && i._dde < 30 && i._dde < 9999 && i._vend90 > 0))
    if (esf === 'com')        items = items.filter(i => i._saldo > 0)
    if (esf === 'sem')        items = items.filter(i => i._saldo === 0)
    if (esf === 'baixo')      items = items.filter(i => i._saldo > 0 && i._dde < 30 && i._dde < 9999)

    let saldoTotal = 0, saldoDispTotal = 0, valorTotal = 0
    let custoPond  = 0, custoPeso = 0
    let giroTotal  = 0, giroCount = 0
    let ddeTotal   = 0, ddeCount  = 0
    let ativos = 0, vend30 = 0, vend60 = 0, vend90 = 0
    let vend30val = 0, vend60val = 0, vend90val = 0

    items.forEach(i => {
      saldoTotal     += i._saldo
      saldoDispTotal += i._saldoDisp
      valorTotal     += i._valorEst
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
      vendasPorPeriodo: { d30: vend30, d60: vend60, d90: vend90, d30val: vend30val, d60val: vend60val, d90val: vend90val },
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
    console.log('[admin/usuarios] profiles:', JSON.stringify(profs).slice(0, 200))
    console.log('[admin/usuarios] permissoes:', JSON.stringify(perms).slice(0, 200))
    res.json({ profiles: Array.isArray(profs) ? profs : [], permissoes: Array.isArray(perms) ? perms : [] })
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

app.listen(PORT, () => console.log(`✓  API em http://localhost:${PORT}`))
