import { Buffer } from 'buffer'
if (typeof window !== 'undefined') window.Buffer = Buffer

import { useState } from 'react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, WidthType, ImageRun } from 'docx'

// ── Traduções ─────────────────────────────────────────────────────────────────
const LABELS = {
  pt: {
    foto: 'Foto', status: 'Status', codigo: 'Código', variacao: 'Variação',
    descricao: 'Descrição', grupo: 'Grupo', pedra: 'Tipo de Pedra', tag2: 'TAG 2',
    saldo: 'Saldo', disponivel: 'Disponível', vend30: 'Vend. 30D', dde: 'DDE',
    qtd: (d) => `Qtd/${d}d`, reposicao: 'R$ Reposição', custo: 'Custo Unit.',
    total: (n) => `Total: ${n} produtos`,
    valorTotal: (v) => `Valor total de reposição: ${v}`,
    titulo: (tab) => tab === 'ruptura' ? 'Sugestão de Compras — RUPTURA' : 'Sugestão de Compras — RISCO DE RUPTURA',
    cobertura: (d) => `Cobertura: ${d} dias`,
    gerado: 'Gerado em',
    ruptura: 'RUPTURA', risco: 'RISCO',
    pagina: (n, t) => `Pág. ${n} / ${t}`,
    planilha: 'Compras',
    empresa: 'ALINARE — Purchasing System',
  },
  en: {
    foto: 'Photo', status: 'Status', codigo: 'Code', variacao: 'Variant',
    descricao: 'Description', grupo: 'Group', pedra: 'Stone Type', tag2: 'TAG 2',
    saldo: 'Stock', disponivel: 'Available', vend30: 'Sales 30D', dde: 'DSS',
    qtd: (d) => `Qty/${d}d`, reposicao: 'USD Reorder', custo: 'Unit Cost',
    total: (n) => `Total: ${n} products`,
    valorTotal: (v) => `Total reorder value: ${v}`,
    titulo: (tab) => tab === 'ruptura' ? 'Purchase Suggestion — STOCKOUT' : 'Purchase Suggestion — STOCKOUT RISK',
    cobertura: (d) => `Coverage: ${d} days`,
    gerado: 'Generated at',
    ruptura: 'STOCKOUT', risco: 'AT RISK',
    pagina: (n, t) => `Page ${n} / ${t}`,
    planilha: 'Purchases',
    empresa: 'ALINARE — Purchasing System',
  },
}

function fmtMoeda(v, lang) {
  if (lang === 'en') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v ?? 0)
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)
}
function fmtNum(v) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR').format(v)
}

async function fetchImageBase64(url) {
  if (!url) return null
  try {
    const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

async function fetchImageBuffer(url) {
  if (!url) return null
  try {
    const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch { return null }
}

async function fetchAllImages(rows, onProgress) {
  const results = []
  const BATCH = 8
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const imgs  = await Promise.all(slice.map(r => fetchImageBase64(r.foto)))
    results.push(...imgs)
    onProgress(Math.min(i + BATCH, rows.length), rows.length)
  }
  return results
}

// ── Cores do tema ─────────────────────────────────────────────────────────────
const C = {
  navy:    'FF0D1B2A',
  gold:    'FFF5C518',
  white:   'FFFFFFFF',
  gray1:   'FFF4F5F7',   // linha par
  gray2:   'FFEEF0F4',   // linha ímpar
  text:    'FF1A1A2E',
  muted:   'FF6B7280',
  green:   'FF16A34A',
  red:     'FFB91C1C',
  orange:  'FFC2410C',
  lime:    'FF4D7C0F',
  border:  'FFD1D5DB',
}

export default function ExportCompras({ rupturaTab, grupoFilter, pedraFilter, tag2Filter, dbSearch, cobertura }) {
  const [loading,  setLoading]  = useState(null)
  const [progress, setProgress] = useState(null)
  const [erro,     setErro]     = useState(null)
  const [lang,     setLang]     = useState('pt')

  const L = LABELS[lang]

  async function fetchData() {
    const params = new URLSearchParams({
      ruptura: rupturaTab || '', grupo: grupoFilter || '', pedra: pedraFilter || '',
      tag2: tag2Filter || '', search: dbSearch || '', cobertura: String(cobertura),
    })
    const res = await fetch(`/api/compras/export?${params}`)
    if (!res.ok) throw new Error(`Erro ${res.status}`)
    return res.json()
  }

  const titulo    = L.titulo(rupturaTab)
  const subTitulo = `${L.cobertura(cobertura)}  |  ${new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`

  function statusLabel(s) { return s === 'RUPTURA' ? L.ruptura : L.risco }

  // ── EXCEL ──────────────────────────────────────────────────────────────────
  async function exportExcel() {
    setLoading('excel'); setErro(null); setProgress('Buscando dados…')
    try {
      const { rows, geradoEm } = await fetchData()
      setProgress(`Carregando fotos (0/${rows.length})…`)
      const images = await fetchAllImages(rows, (done, total) => setProgress(`Carregando fotos (${done}/${total})…`))
      setProgress('Montando arquivo…')

      const wb = new ExcelJS.Workbook()
      wb.creator = 'Alinare'
      const ws = wb.addWorksheet(L.planilha)

      const COLS = 14
      const merge = (r, c1, c2) => ws.mergeCells(r, c1, r, c2)

      // ── Linha 1: Logo / Empresa ──
      ws.addRow([])
      ws.getRow(1).height = 30
      merge(1, 1, COLS)
      const c1 = ws.getCell(1, 1)
      c1.value     = L.empresa
      c1.font      = { bold: true, size: 18, color: { argb: C.gold }, name: 'Calibri' }
      c1.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
      c1.alignment = { horizontal: 'center', vertical: 'middle' }

      // ── Linha 2: Título ──
      ws.addRow([])
      ws.getRow(2).height = 22
      merge(2, 1, COLS)
      const c2 = ws.getCell(2, 1)
      c2.value     = titulo
      c2.font      = { bold: true, size: 13, color: { argb: C.white }, name: 'Calibri' }
      c2.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
      c2.alignment = { horizontal: 'center', vertical: 'middle' }

      // ── Linha 3: Subtítulo ──
      ws.addRow([])
      ws.getRow(3).height = 16
      merge(3, 1, COLS)
      const c3 = ws.getCell(3, 1)
      c3.value     = `${subTitulo}   |   ${L.gerado}: ${geradoEm}`
      c3.font      = { italic: true, size: 9, color: { argb: 'FF9CA3AF' }, name: 'Calibri' }
      c3.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
      c3.alignment = { horizontal: 'center', vertical: 'middle' }

      // ── Linha 4: Espaço ──
      ws.addRow([])
      ws.getRow(4).height = 6
      for (let c = 1; c <= COLS; c++) {
        ws.getCell(4, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.gold } }
      }

      // ── Linha 5: Cabeçalho ──
      const HDR = [
        L.foto, L.status, L.codigo, L.variacao, L.descricao,
        L.grupo, L.pedra, L.tag2, L.saldo, L.disponivel,
        L.vend30, L.dde, L.qtd(cobertura), L.reposicao,
      ]
      const hRow = ws.addRow(HDR)
      hRow.height = 24
      hRow.eachCell((cell, colNum) => {
        cell.font      = { bold: true, size: 10, color: { argb: C.navy }, name: 'Calibri' }
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.gold } }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false }
        cell.border    = {
          bottom: { style: 'medium', color: { argb: C.navy } },
          right:  colNum < COLS ? { style: 'thin', color: { argb: C.border } } : undefined,
        }
      })

      // ── Larguras ──
      ws.columns = [
        { width: 9 }, { width: 11 }, { width: 12 }, { width: 13 }, { width: 40 },
        { width: 14 }, { width: 20 }, { width: 11 }, { width: 8 }, { width: 9 },
        { width: 9 }, { width: 7 }, { width: 11 }, { width: 15 },
      ]

      const totalValor = rows.reduce((s, r) => s + r.valRepor, 0)

      // ── Dados ──
      rows.forEach((r, idx) => {
        const excelRowNum = 5 + 1 + idx   // 5=hdr, 1=offset
        const isEven = idx % 2 === 0
        const bgColor = isEven ? C.gray1 : C.gray2

        const dataRow = ws.addRow([
          '',
          statusLabel(r.status),
          r.codigo, r.variacao, r.descricao, r.grupo, r.pedra, r.tag2,
          r.saldo, r.disponivel, r.vend30,
          r.dde ?? '—', r.qtdSug, r.valRepor,
        ])
        dataRow.height = 56

        dataRow.eachCell((cell, colNum) => {
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
          cell.font      = { size: 9, color: { argb: C.text }, name: 'Calibri' }
          cell.alignment = { vertical: 'middle', horizontal: colNum >= 9 ? 'center' : 'left', wrapText: colNum === 5 }
          cell.border    = {
            bottom: { style: 'thin', color: { argb: C.border } },
            right:  colNum < COLS ? { style: 'hair', color: { argb: C.border } } : undefined,
          }
        })

        // Status colorido
        const statusCell = dataRow.getCell(2)
        const isRuptura  = r.status === 'RUPTURA'
        statusCell.font  = { bold: true, size: 9, color: { argb: isRuptura ? 'FFF87171' : 'FFFB923C' }, name: 'Calibri' }
        statusCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: isRuptura ? 'FF450A0A' : 'FF431407' } }
        statusCell.alignment = { horizontal: 'center', vertical: 'middle' }

        // Valor reposição verde
        const valCell = dataRow.getCell(14)
        valCell.numFmt    = lang === 'en' ? '$#,##0.00' : 'R$ #,##0.00'
        valCell.font      = { bold: true, size: 9, color: { argb: C.lime }, name: 'Calibri' }
        valCell.value     = r.valRepor
        valCell.alignment = { horizontal: 'right', vertical: 'middle' }

        // Qtd sugerida
        const qtdCell = dataRow.getCell(13)
        qtdCell.font  = { bold: true, size: 10, color: { argb: 'FFF59E0B' }, name: 'Calibri' }
        qtdCell.alignment = { horizontal: 'center', vertical: 'middle' }

        // Foto
        const imgBase64 = images[idx]
        if (imgBase64) {
          try {
            const ext  = imgBase64.startsWith('data:image/png') ? 'png' : 'jpeg'
            const b64  = imgBase64.split(',')[1]
            const imgId = wb.addImage({ base64: b64, extension: ext })
            ws.addImage(imgId, {
              tl: { col: 0, row: excelRowNum - 1 },
              ext: { width: 54, height: 54 },
              editAs: 'oneCell',
            })
          } catch {}
        }
      })

      // ── Linha separadora ──
      const sepRow = ws.addRow([])
      sepRow.height = 4
      for (let c = 1; c <= COLS; c++) {
        ws.getCell(sepRow.number, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.gold } }
      }

      // ── Rodapé ──
      const footRow = ws.addRow(['', '', '', '', L.total(rows.length), '', '', '', '', '', '', '', '', totalValor])
      footRow.height = 20
      footRow.eachCell((cell, colNum) => {
        cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
        cell.font  = { bold: true, size: 10, color: { argb: C.gold }, name: 'Calibri' }
        cell.alignment = { vertical: 'middle', horizontal: colNum === 14 ? 'right' : 'left' }
      })
      const footValCell = footRow.getCell(14)
      footValCell.numFmt = lang === 'en' ? '$#,##0.00' : 'R$ #,##0.00'
      footValCell.font   = { bold: true, size: 10, color: { argb: C.lime }, name: 'Calibri' }

      // ── Congelar cabeçalho ──
      ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 0 }]

      const buf = await wb.xlsx.writeBuffer()
      saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `Alinare_Compras_${lang}_${rupturaTab}_${cobertura}d.xlsx`)

    } catch (e) { setErro(`Excel: ${e.message}`) } finally { setLoading(null); setProgress(null) }
  }

  // ── PDF ────────────────────────────────────────────────────────────────────
  async function exportPDF() {
    setLoading('pdf'); setErro(null); setProgress('Buscando dados…')
    try {
      const { rows, geradoEm } = await fetchData()
      setProgress(`Carregando fotos (0/${rows.length})…`)
      const images = await fetchAllImages(rows, (done, total) => setProgress(`Carregando fotos (${done}/${total})…`))
      setProgress('Gerando PDF…')

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const W = doc.internal.pageSize.getWidth()
      const H = doc.internal.pageSize.getHeight()

      function addWatermark() {
        doc.setFontSize(72); doc.setFont('helvetica', 'bold')
        doc.setTextColor(248, 238, 150)
        doc.text('ALINARE', W / 2, H / 2, { align: 'center', angle: 35 })
        doc.setTextColor(30, 30, 30)
      }

      function addHeader(pageNum, totalPages) {
        doc.setFillColor(13, 27, 42); doc.rect(0, 0, W, 22, 'F')
        doc.setFont('times', 'italic'); doc.setFontSize(16); doc.setTextColor(255, 255, 255)
        doc.text('Alinare', 10, 12)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(245, 197, 24)
        doc.text(titulo, W / 2, 9, { align: 'center' })
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(160, 160, 160)
        doc.text(subTitulo, W / 2, 16, { align: 'center' })
        doc.setFontSize(7)
        doc.text(L.pagina(pageNum, totalPages), W - 10, 9, { align: 'right' })
        doc.text(`${L.gerado}: ${geradoEm}`, W - 10, 16, { align: 'right' })
      }

      autoTable(doc, {
        startY: 25,
        head: [[L.foto, L.status, L.codigo, L.descricao, L.grupo, L.pedra, L.tag2,
                L.saldo, 'Disp.', L.vend30, L.dde, L.qtd(cobertura), L.reposicao]],
        body: rows.map((r) => ['', statusLabel(r.status), r.codigo, r.descricao, r.grupo, r.pedra, r.tag2,
          fmtNum(r.saldo), fmtNum(r.disponivel), fmtNum(r.vend30),
          r.dde != null ? `${r.dde}d` : '—', fmtNum(r.qtdSug), fmtMoeda(r.valRepor, lang)]),
        foot: [['','','',L.total(rows.length),'','','','','','','','', fmtMoeda(rows.reduce((s,r)=>s+r.valRepor,0), lang)]],
        styles:      { fontSize: 7, cellPadding: 1.5, minCellHeight: 14, textColor: [26,26,46] },
        headStyles:  { fillColor: [245,197,24], textColor: [13,27,42], fontStyle: 'bold', fontSize: 7 },
        footStyles:  { fillColor: [13,27,42], textColor: [245,197,24], fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [238, 240, 244] },
        columnStyles: {
          0:  { cellWidth: 14 }, 1: { cellWidth: 14, fontStyle: 'bold' },
          2:  { cellWidth: 20 }, 3: { cellWidth: 52 }, 4: { cellWidth: 18 },
          5:  { cellWidth: 20 }, 6: { cellWidth: 12 }, 7: { cellWidth: 10, halign: 'center' },
          8:  { cellWidth: 10, halign: 'center' }, 9: { cellWidth: 12, halign: 'center' },
          10: { cellWidth: 9, halign: 'center' }, 11: { cellWidth: 11, halign: 'center' },
          12: { cellWidth: 22, halign: 'right' },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 1) {
            const isR = data.cell.raw === L.ruptura
            data.cell.styles.textColor = isR ? [248,113,113] : [251,146,60]
            data.cell.styles.fontStyle = 'bold'
          }
        },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === 0) {
            const img = images[data.row.index]
            if (img) {
              try {
                const ext = img.startsWith('data:image/png') ? 'PNG' : 'JPEG'
                doc.addImage(img, ext, data.cell.x + 1, data.cell.y + 1, 12, 12)
              } catch {}
            }
          }
        },
        didDrawPage: () => addWatermark(),
        margin: { top: 25, bottom: 10 },
      })

      const totalPages = doc.internal.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) { doc.setPage(i); addHeader(i, totalPages) }
      doc.save(`Alinare_Compras_${lang}_${rupturaTab}_${cobertura}d.pdf`)
    } catch (e) { setErro(`PDF: ${e.message}`) } finally { setLoading(null); setProgress(null) }
  }

  // ── WORD ───────────────────────────────────────────────────────────────────
  async function exportWord() {
    setLoading('word'); setErro(null); setProgress('Buscando dados…')
    try {
      const { rows, geradoEm } = await fetchData()
      const imageBuffers = []
      const BATCH = 8
      for (let i = 0; i < rows.length; i += BATCH) {
        const bufs = await Promise.all(rows.slice(i, i + BATCH).map(r => fetchImageBuffer(r.foto)))
        imageBuffers.push(...bufs)
        setProgress(`Carregando fotos (${Math.min(i + BATCH, rows.length)}/${rows.length})…`)
      }
      setProgress('Montando Word…')

      const cols = [L.foto, L.status, L.codigo, L.descricao, L.grupo, L.pedra, L.tag2,
                    L.saldo, 'Disp.', L.vend30, L.dde, L.qtd(cobertura), L.reposicao]

      const headerRow = new TableRow({
        tableHeader: true,
        children: cols.map(h => new TableCell({
          shading: { type: 'clear', color: 'auto', fill: 'F5C518' },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: '0D1B2A', size: 16 })] })],
        })),
      })

      const dataRows = rows.map((r, idx) => {
        const buf = imageBuffers[idx]
        const fotoCell = new TableCell({
          children: [new Paragraph({
            children: buf ? [new ImageRun({ data: buf, transformation: { width: 45, height: 45 } })] : [new TextRun({ text: '—' })],
          })],
        })
        const vals = [statusLabel(r.status), r.codigo, r.descricao, r.grupo, r.pedra, r.tag2,
          fmtNum(r.saldo), fmtNum(r.disponivel), fmtNum(r.vend30),
          r.dde != null ? `${r.dde}d` : '—', fmtNum(r.qtdSug), fmtMoeda(r.valRepor, lang)]
        return new TableRow({
          children: [fotoCell, ...vals.map((val, i) => new TableCell({
            children: [new Paragraph({ children: [new TextRun({
              text: String(val ?? '—'), size: 14,
              color: i === 0 ? (val === L.ruptura ? 'F87171' : 'FB923C') : '1a1a1a',
              bold: i === 0,
            })] })],
          }))],
        })
      })

      const doc = new Document({
        sections: [{
          properties: { page: { size: { orientation: 'landscape' } } },
          children: [
            new Paragraph({ children: [new TextRun({ text: 'ALINARE', bold: true, size: 48 })], alignment: AlignmentType.CENTER }),
            new Paragraph({ children: [new TextRun({ text: titulo, bold: true, size: 28 })], alignment: AlignmentType.CENTER }),
            new Paragraph({ children: [new TextRun({ text: `${subTitulo}   |   ${L.gerado}: ${geradoEm}`, italics: true, size: 18 })], alignment: AlignmentType.CENTER }),
            new Paragraph({ children: [] }),
            new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }),
            new Paragraph({ children: [] }),
            new Paragraph({ children: [new TextRun({ text: `${L.total(rows.length)}  |  ${L.valorTotal(fmtMoeda(rows.reduce((s,r)=>s+r.valRepor,0), lang))}`, bold: true, size: 22 })] }),
          ],
        }],
      })

      const blob = await Packer.toBlob(doc)
      saveAs(blob, `Alinare_Compras_${lang}_${rupturaTab}_${cobertura}d.docx`)
    } catch (e) { setErro(`Word: ${e.message}`) } finally { setLoading(null); setProgress(null) }
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Seletor de idioma */}
        <div className="flex items-center gap-1 mr-1" style={{ border: '1px solid #2a2d40', borderRadius: 6, overflow: 'hidden' }}>
          <button onClick={() => setLang('pt')} disabled={!!loading}
            className="px-2.5 py-1.5 text-xs font-bold transition-all"
            style={{ background: lang === 'pt' ? '#f5c518' : 'transparent', color: lang === 'pt' ? '#0d0e16' : '#6b7280' }}>
            🇧🇷 PT
          </button>
          <button onClick={() => setLang('en')} disabled={!!loading}
            className="px-2.5 py-1.5 text-xs font-bold transition-all"
            style={{ background: lang === 'en' ? '#f5c518' : 'transparent', color: lang === 'en' ? '#0d0e16' : '#6b7280' }}>
            🇺🇸 EN
          </button>
        </div>

        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b7280' }}>Download:</span>

        <button onClick={exportExcel} disabled={!!loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold"
          style={{ background: '#166534', color: '#4ade80', border: '1px solid #16a34a', opacity: loading && loading !== 'excel' ? 0.4 : 1 }}>
          {loading === 'excel' ? '⏳' : '📊'} Excel
        </button>

        <button onClick={exportPDF} disabled={!!loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold"
          style={{ background: '#991b1b', color: '#fca5a5', border: '1px solid #dc2626', opacity: loading && loading !== 'pdf' ? 0.4 : 1 }}>
          {loading === 'pdf' ? '⏳' : '📄'} PDF
        </button>

        <button onClick={exportWord} disabled={!!loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold"
          style={{ background: '#1e40af', color: '#93c5fd', border: '1px solid #3b82f6', opacity: loading && loading !== 'word' ? 0.4 : 1 }}>
          {loading === 'word' ? '⏳' : '📝'} Word
        </button>
      </div>

      {progress && (
        <div style={{ marginTop: 6, padding: '4px 10px', borderRadius: 4, background: '#1a1c2a', border: '1px solid #f5c51840', color: '#f5c518', fontSize: 11 }}>
          ⏳ {progress}
        </div>
      )}
      {erro && (
        <div style={{ marginTop: 6, padding: '4px 10px', borderRadius: 4, background: '#2d0a0a', border: '1px solid #7f1d1d', color: '#f87171', fontSize: 11 }}>
          ⚠ {erro}
        </div>
      )}
    </div>
  )
}
