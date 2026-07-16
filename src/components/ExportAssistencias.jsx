import { Buffer } from 'buffer'
if (typeof window !== 'undefined') window.Buffer = Buffer

import { useState } from 'react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const fNum = v => new Intl.NumberFormat('pt-BR').format(v ?? 0)

// Cores da Alinare
const NAVY = '1A3878', NAVY_RGB = [26, 56, 120]
const LIGHT = '9DC0F5', LIGHT_RGB = [157, 192, 245]
const C = { navy: `FF${NAVY}`, light: `FF${LIGHT}`, white: 'FFFFFFFF', gray1: 'FFF4F6FB', gray2: 'FFEAEFF9', text: 'FF1A1A2E', border: 'FFCBD5E1', green: 'FF16A34A', amber: 'FFC2410C', red: 'FFB91C1C' }

// dd/mm/aaaa (mantém como veio; corta hora se houver)
const fData = s => String(s || '').slice(0, 10) || '—'

// Carrega o logo da Alinare como dataURL (para embutir no PDF/Excel)
async function loadLogo() {
  try {
    const res = await fetch('/alinare.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(blob) })
  } catch { return null }
}

// Resumo + detalhe por SKU a partir das linhas filtradas
function build(rows) {
  const oss = new Map()   // codigoAssistencia -> statusOss
  let entregue = 0, emdia = 0, atrasado = 0
  const det = []
  for (const r of rows || []) {
    const cod = r.codigoAssistencia || r.osCliente
    if (cod) oss.set(cod, r.statusOss || '')
    if (r.statusServico === 'Entregue') entregue++
    else if (r.statusServico === 'Em dia') emdia++
    else if (r.statusServico === 'Atrasado') atrasado++
    det.push({
      cliente:     r.clienteNome || '—',
      codAssist:   r.codigoAssistencia || r.osCliente || '—',
      sku:         r.produtoCod || '—',
      descricao:   r.produto || '—',
      qtd:         r.quantidade || 0,
      situacaoOS:  r.statusOss || '—',
      situacao:    r.situacao || '—',
      statusServico: r.statusServico || '—',
      dtEntrada:   fData(r.dataEntrada),
      prevEntrega: fData(r.prevEntrega),
    })
  }
  let fechadas = 0, abertas = 0, outras = 0
  for (const s of oss.values()) {
    if (/fechad/i.test(s)) fechadas++
    else if (/abert/i.test(s)) abertas++
    else outras++
  }
  // Cliente(s) do relatório: nome quando é um só, senão a quantidade
  const clientes = new Set((rows || []).map(r => r.clienteNome).filter(Boolean))
  const clienteLabel = clientes.size === 1 ? [...clientes][0] : `${clientes.size} clientes`
  return { totalOss: oss.size, fechadas, abertas, outras, entregue, emdia, atrasado, det, clienteLabel }
}

const HDR = ['Cliente', 'Cód. Assist.', 'SKU', 'Descrição', 'Qtd', 'Situação OS', 'Situação', 'Status do Serviço', 'Dt Entrada', 'Prev. Entrega']

export default function ExportAssistencias({ rows }) {
  const [loading, setLoading] = useState(null)
  const [erro,    setErro]    = useState(null)

  const geradoEm = new Date().toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const stamp    = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')

  // ── EXCEL ──────────────────────────────────────────────────────────────────
  async function exportExcel() {
    setLoading('excel'); setErro(null)
    try {
      const r = build(rows)
      if (!r.det.length) throw new Error('Nada para exportar')
      const logo = await loadLogo()

      const wb = new ExcelJS.Workbook()
      wb.creator = 'Alinare'
      const ws = wb.addWorksheet('Assistências')
      const COLS = HDR.length
      const merge = (rr, c1, c2) => ws.mergeCells(rr, c1, rr, c2)

      // Cabeçalho com logo + título
      ws.getRow(1).height = 44
      merge(1, 1, COLS)
      const t = ws.getCell(1, 1)
      t.value = '   ALINARE — Assistência Técnica'
      t.font = { bold: true, size: 16, color: { argb: C.white } }
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
      t.alignment = { horizontal: 'left', vertical: 'middle' }
      if (logo) {
        try {
          const imgId = wb.addImage({ base64: logo, extension: 'png' })
          ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 90, height: 40 } })
        } catch {}
      }

      // Subtítulo: cliente + data de geração
      ws.getRow(2).height = 16; merge(2, 1, COLS)
      const s = ws.getCell(2, 1)
      s.value = `${r.clienteLabel}   ·   Gerado em ${geradoEm}`
      s.font = { italic: true, size: 9, color: { argb: C.white } }
      s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
      s.alignment = { horizontal: 'left', vertical: 'middle' }

      // ── Resumo ──
      const resumo = [
        ['Total de OSs', r.totalOss],
        ['OS Entregues', r.fechadas],
        ['OS Abertas', r.abertas],
        ['Itens Entregue', r.entregue],
        ['Itens Em dia', r.emdia],
        ['Itens Atrasado', r.atrasado],
      ]
      let rowN = 4
      const rt = ws.getCell(rowN, 1); rt.value = 'RESUMO'
      rt.font = { bold: true, size: 11, color: { argb: C.navy } }; rowN++
      resumo.forEach(([lab, val]) => {
        ws.getCell(rowN, 1).value = lab
        ws.getCell(rowN, 1).font = { size: 10, color: { argb: C.text } }
        const vc = ws.getCell(rowN, 2); vc.value = val
        vc.font = { bold: true, size: 11, color: { argb: C.navy } }
        vc.alignment = { horizontal: 'left' }
        rowN++
      })
      rowN++   // linha em branco

      // ── Cabeçalho da tabela ──
      const hRow = ws.getRow(rowN); HDR.forEach((h, i) => { hRow.getCell(i + 1).value = h }); hRow.height = 20
      hRow.eachCell(cell => {
        cell.font = { bold: true, size: 9.5, color: { argb: C.white } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      })
      const headRowNum = rowN; rowN++

      ws.columns = [
        { width: 30 }, { width: 12 }, { width: 12 }, { width: 46 }, { width: 6 },
        { width: 14 }, { width: 13 }, { width: 16 }, { width: 12 }, { width: 12 },
      ]

      r.det.forEach((d, idx) => {
        const bg = idx % 2 === 0 ? C.gray1 : C.gray2
        const dr = ws.getRow(rowN)
        const vals = [d.cliente, d.codAssist, d.sku, d.descricao, d.qtd, d.situacaoOS, d.situacao, d.statusServico, d.dtEntrada, d.prevEntrega]
        vals.forEach((v, i) => { dr.getCell(i + 1).value = v })
        dr.eachCell((cell, col) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
          cell.font = { size: 9, color: { argb: C.text } }
          cell.alignment = { vertical: 'middle', horizontal: col === 1 || col === 4 ? 'left' : 'center' }
          cell.border = { bottom: { style: 'hair', color: { argb: C.border } } }
        })
        // Status do serviço colorido
        const stc = dr.getCell(8)
        stc.font = { bold: true, size: 9, color: { argb: d.statusServico === 'Entregue' ? C.green : d.statusServico === 'Atrasado' ? C.red : C.amber } }
        rowN++
      })

      ws.views = [{ state: 'frozen', ySplit: headRowNum }]

      const buf = await wb.xlsx.writeBuffer()
      saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Alinare_Assistencias_${stamp}.xlsx`)
    } catch (e) { setErro(`Excel: ${e.message}`) } finally { setLoading(null) }
  }

  // ── PDF ────────────────────────────────────────────────────────────────────
  async function exportPDF() {
    setLoading('pdf'); setErro(null)
    try {
      const r = build(rows)
      if (!r.det.length) throw new Error('Nada para exportar')
      const logo = await loadLogo()

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const W = doc.internal.pageSize.getWidth()

      // Cabeçalho com logo + faixa navy
      const header = () => {
        doc.setFillColor(...NAVY_RGB); doc.rect(0, 0, W, 26, 'F')
        if (logo) { try { doc.addImage(logo, 'PNG', 10, 5, 34, 15) } catch {} }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(255, 255, 255)
        doc.text('Assistência Técnica', logo ? 50 : 10, 12)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...LIGHT_RGB)
        doc.text('ALINARE', logo ? 50 : 10, 18)
        // Cliente (topo, acima da data)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255)
        doc.text(r.clienteLabel, W - 10, 10, { align: 'right', maxWidth: W / 2 })
        doc.setFont('helvetica', 'normal'); doc.setTextColor(220, 220, 220); doc.setFontSize(7.5)
        doc.text(`Gerado em ${geradoEm}`, W - 10, 16, { align: 'right' })
      }
      header()

      // ── Resumo formal (cards) ──
      let y = 33
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY_RGB)
      doc.text('Resumo', 10, y); y += 3

      // Total considera apenas Entregues + Abertas (ignora outros status de OS)
      const totalOss = r.fechadas + r.abertas
      const tiposOss = [r.fechadas, r.abertas].filter(n => n > 0).length
      const cards = [
        ...(tiposOss >= 2 ? [['Total de OSs', fNum(totalOss), NAVY_RGB]] : []),
        ...(r.fechadas > 0 ? [['OS Entregues', fNum(r.fechadas), [22, 163, 74]]] : []),
        ...(r.abertas > 0 ? [['OS Abertas', fNum(r.abertas), [202, 138, 4]]] : []),
        ['Itens Entregue', fNum(r.entregue), [22, 163, 74]],
        ['Itens Em dia', fNum(r.emdia), [37, 99, 235]],
        ['Itens Atrasado', fNum(r.atrasado), [185, 28, 28]],
      ]
      const cw = (W - 20) / cards.length, ch = 18
      cards.forEach((c, i) => {
        const x = 10 + i * cw
        doc.setDrawColor(...LIGHT_RGB); doc.setFillColor(245, 248, 253)
        doc.roundedRect(x, y, cw - 3, ch, 2, 2, 'FD')
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90, 90, 90)
        doc.text(c[0], x + 3, y + 5, { maxWidth: cw - 8 })
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...c[2])
        doc.text(String(c[1]), x + 3, y + 14)
      })
      y += ch + 5

      // ── Tabela por SKU ──
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY_RGB)
      doc.text('Status das OSs por SKU', 10, y); y += 2

      autoTable(doc, {
        startY: y + 2,
        head: [HDR],
        body: r.det.map(d => [d.cliente, d.codAssist, d.sku, d.descricao, fNum(d.qtd), d.situacaoOS, d.situacao, d.statusServico, d.dtEntrada, d.prevEntrega]),
        styles:     { fontSize: 7, cellPadding: 1.3, textColor: [26, 26, 46], overflow: 'ellipsize' },
        headStyles: { fillColor: NAVY_RGB, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [234, 239, 249] },
        columnStyles: {
          0: { cellWidth: 42 }, 1: { cellWidth: 18, halign: 'center' }, 2: { cellWidth: 18, halign: 'center' },
          3: { cellWidth: 78 }, 4: { cellWidth: 10, halign: 'center' }, 5: { cellWidth: 22, halign: 'center' },
          6: { cellWidth: 20, halign: 'center' }, 7: { cellWidth: 24, halign: 'center' },
          8: { cellWidth: 18, halign: 'center' }, 9: { cellWidth: 18, halign: 'center' },
        },
        didParseCell: data => {
          if (data.section !== 'body') return
          // Status do Serviço: Entregue verde · Atrasado vermelho · Em dia (demais) azul
          if (data.column.index === 7) {
            const v = data.cell.raw
            data.cell.styles.textColor = v === 'Entregue' ? [22, 163, 74] : v === 'Atrasado' ? [185, 28, 28] : [37, 99, 235]
            data.cell.styles.fontStyle = 'bold'
          }
          // Situação OS: Fechada verde · Aberta amarela
          else if (data.column.index === 5) {
            const v = String(data.cell.raw || '')
            if (/fechad/i.test(v)) { data.cell.styles.textColor = [22, 163, 74]; data.cell.styles.fontStyle = 'bold' }
            else if (/abert/i.test(v)) { data.cell.styles.textColor = [202, 138, 4]; data.cell.styles.fontStyle = 'bold' }
          }
        },
        margin: { top: 28, bottom: 10 },
        didDrawPage: () => { if (doc.internal.getCurrentPageInfo().pageNumber > 1) header() },
      })

      doc.save(`Alinare_Assistencias_${stamp}.pdf`)
    } catch (e) { setErro(`PDF: ${e.message}`) } finally { setLoading(null) }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>Exportar:</span>
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
      {erro && (
        <span style={{ padding: '2px 8px', borderRadius: 4, background: '#2d0a0a', border: '1px solid #7f1d1d', color: '#f87171', fontSize: 11 }}>⚠ {erro}</span>
      )}
    </div>
  )
}
