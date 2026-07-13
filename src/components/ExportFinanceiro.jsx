import { Buffer } from 'buffer'
if (typeof window !== 'undefined') window.Buffer = Buffer

import { useState } from 'react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const fMoeda = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

// Cores do tema (mesma paleta do ExportCompras)
const C = {
  navy: 'FF0D1B2A', gold: 'FFF5C518', white: 'FFFFFFFF',
  gray1: 'FFF4F5F7', gray2: 'FFEEF0F4', text: 'FF1A1A2E',
  green: 'FF16A34A', orange: 'FFC2410C', blue: 'FF2563EB', border: 'FFD1D5DB',
}

// Achata vendedor → cliente → conta em uma linha por conta a receber
function flatten(vendedores) {
  const rows = []
  for (const v of vendedores || []) {
    for (const c of v.clientes || []) {
      for (const ct of c.contas || []) {
        rows.push({
          responsavel: v.nome || '—',
          cliente:     c.nome || '—',
          clienteCod:  c.codigo || '',
          documento:   `${ct.prefixo || ''} ${ct.numero || ''}`.trim() || '—',
          emissao:     ct.emissao || '—',
          vencimento:  ct.vencimento || '—',
          historico:   ct.historico || '—',
          pagamento:   ct.pagamento || '—',
          modalidade:  ct.modalidade || '—',
          parcela:     ct.parcela || '—',
          situacao:    ct.aberto ? 'EM ABERTO' : 'PAGO',
          devido:      ct.total || 0,
          recebido:    ct.pago || 0,
          pendente:    ct.pend || 0,
        })
      }
    }
  }
  return rows
}

const HDR = ['Responsável', 'Cliente', 'Cód.', 'Documento', 'Emissão', 'Vencimento',
             'Histórico', 'Pagamento', 'Situação', 'R$ Devido', 'R$ Recebido', 'R$ Pendente']

// Excel inclui Modalidade (após Pagamento) e Parcela (antes de R$ Devido); o PDF, mais largo, não as inclui
const EXCEL_HDR = ['Responsável', 'Cliente', 'Cód.', 'Documento', 'Emissão', 'Vencimento',
                   'Histórico', 'Pagamento', 'Modalidade', 'Situação', 'Parcela', 'R$ Devido', 'R$ Recebido', 'R$ Pendente']

export default function ExportFinanceiro({ vendedores, cards }) {
  const [loading, setLoading] = useState(null)
  const [erro,    setErro]    = useState(null)

  const geradoEm = new Date().toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const stamp    = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')

  // ── EXCEL ──────────────────────────────────────────────────────────────────
  async function exportExcel() {
    setLoading('excel'); setErro(null)
    try {
      const rows = flatten(vendedores)
      if (!rows.length) throw new Error('Nada para exportar')

      const wb = new ExcelJS.Workbook()
      wb.creator = 'Alinare'
      const ws = wb.addWorksheet('Contas a Receber')
      const COLS = EXCEL_HDR.length
      const merge = (r, c1, c2) => ws.mergeCells(r, c1, r, c2)

      // Título
      ws.addRow([]); ws.getRow(1).height = 28; merge(1, 1, COLS)
      const t = ws.getCell(1, 1)
      t.value = 'ALINARE — Contas a Receber'
      t.font = { bold: true, size: 16, color: { argb: C.gold } }
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
      t.alignment = { horizontal: 'center', vertical: 'middle' }

      // Subtítulo (totais + geração)
      ws.addRow([]); ws.getRow(2).height = 16; merge(2, 1, COLS)
      const s = ws.getCell(2, 1)
      const resumo = cards ? `Total ${fMoeda(cards.total)}  |  Recebido ${fMoeda(cards.concluido)}  |  Pendente ${fMoeda(cards.pendente)}` : ''
      s.value = `${resumo}   |   ${rows.length} contas   |   Gerado em ${geradoEm}`
      s.font = { italic: true, size: 9, color: { argb: 'FF9CA3AF' } }
      s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
      s.alignment = { horizontal: 'center', vertical: 'middle' }

      // Cabeçalho
      const hRow = ws.addRow(EXCEL_HDR); hRow.height = 22
      hRow.eachCell(cell => {
        cell.font = { bold: true, size: 10, color: { argb: C.navy } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.gold } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = { bottom: { style: 'medium', color: { argb: C.navy } } }
      })

      ws.columns = [
        { width: 24 }, { width: 30 }, { width: 8 }, { width: 16 }, { width: 12 }, { width: 12 },
        { width: 40 }, { width: 12 }, { width: 18 }, { width: 12 }, { width: 10 }, { width: 15 }, { width: 15 }, { width: 15 },
      ]

      rows.forEach((r, idx) => {
        const bg = idx % 2 === 0 ? C.gray1 : C.gray2
        const dr = ws.addRow([
          r.responsavel, r.cliente, r.clienteCod, r.documento, r.emissao, r.vencimento,
          r.historico, r.pagamento, r.modalidade, r.situacao, r.parcela, r.devido, r.recebido, r.pendente,
        ])
        dr.eachCell((cell, col) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
          cell.font = { size: 9, color: { argb: C.text } }
          cell.alignment = { vertical: 'middle', horizontal: col >= 12 ? 'right' : ((col >= 3 && col <= 6) || col === 11 ? 'center' : 'left') }
          cell.border = { bottom: { style: 'hair', color: { argb: C.border } } }
        })
        // Situação colorida (col 10)
        const sit = dr.getCell(10)
        sit.alignment = { horizontal: 'center', vertical: 'middle' }
        sit.font = { bold: true, size: 9, color: { argb: r.situacao === 'PAGO' ? C.green : C.orange } }
        // Valores monetários (cols 12–14)
        dr.getCell(12).numFmt = 'R$ #,##0.00'; dr.getCell(12).font = { size: 9, color: { argb: C.blue }, bold: true }
        dr.getCell(13).numFmt = 'R$ #,##0.00'; dr.getCell(13).font = { size: 9, color: { argb: C.green } }
        dr.getCell(14).numFmt = 'R$ #,##0.00'; dr.getCell(14).font = { size: 9, color: { argb: C.orange } }
      })

      // Rodapé com totais
      const tD = rows.reduce((a, r) => a + r.devido, 0)
      const tR = rows.reduce((a, r) => a + r.recebido, 0)
      const tP = rows.reduce((a, r) => a + r.pendente, 0)
      const foot = ws.addRow(['TOTAL', '', '', '', '', '', '', '', '', `${rows.length} contas`, '', tD, tR, tP])
      foot.height = 20
      foot.eachCell((cell, col) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
        cell.font = { bold: true, size: 10, color: { argb: C.gold } }
        cell.alignment = { vertical: 'middle', horizontal: col >= 12 ? 'right' : 'left' }
        if (col >= 12) cell.numFmt = 'R$ #,##0.00'
      })

      ws.views = [{ state: 'frozen', ySplit: 3 }]

      const buf = await wb.xlsx.writeBuffer()
      saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `Alinare_Contas_a_Receber_${stamp}.xlsx`)
    } catch (e) { setErro(`Excel: ${e.message}`) } finally { setLoading(null) }
  }

  // ── PDF ────────────────────────────────────────────────────────────────────
  async function exportPDF() {
    setLoading('pdf'); setErro(null)
    try {
      const rows = flatten(vendedores)
      if (!rows.length) throw new Error('Nada para exportar')

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const W = doc.internal.pageSize.getWidth()

      const tD = rows.reduce((a, r) => a + r.devido, 0)
      const tR = rows.reduce((a, r) => a + r.recebido, 0)
      const tP = rows.reduce((a, r) => a + r.pendente, 0)

      autoTable(doc, {
        startY: 24,
        head: [HDR],
        body: rows.map(r => [
          r.responsavel, r.cliente, r.clienteCod, r.documento, r.emissao, r.vencimento,
          r.historico, r.pagamento, r.situacao,
          fMoeda(r.devido), fMoeda(r.recebido), fMoeda(r.pendente),
        ]),
        foot: [['TOTAL', '', '', '', '', '', '', '', `${rows.length}`, fMoeda(tD), fMoeda(tR), fMoeda(tP)]],
        styles:     { fontSize: 6.5, cellPadding: 1.2, textColor: [26, 26, 46], overflow: 'ellipsize' },
        headStyles: { fillColor: [245, 197, 24], textColor: [13, 27, 42], fontStyle: 'bold', fontSize: 6.5 },
        footStyles: { fillColor: [13, 27, 42], textColor: [245, 197, 24], fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [238, 240, 244] },
        columnStyles: {
          0: { cellWidth: 34 }, 1: { cellWidth: 40 }, 2: { cellWidth: 12 }, 3: { cellWidth: 20 },
          4: { cellWidth: 16, halign: 'center' }, 5: { cellWidth: 16, halign: 'center' },
          6: { cellWidth: 46 }, 7: { cellWidth: 16, halign: 'center' }, 8: { cellWidth: 18, halign: 'center' },
          9: { cellWidth: 20, halign: 'right' }, 10: { cellWidth: 20, halign: 'right' }, 11: { cellWidth: 20, halign: 'right' },
        },
        didParseCell: data => {
          if (data.section === 'body' && data.column.index === 8) {
            const pago = data.cell.raw === 'PAGO'
            data.cell.styles.textColor = pago ? [22, 163, 74] : [194, 65, 12]
            data.cell.styles.fontStyle = 'bold'
          }
        },
        margin: { top: 24, bottom: 10 },
        didDrawPage: () => {
          doc.setFillColor(13, 27, 42); doc.rect(0, 0, W, 20, 'F')
          doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(245, 197, 24)
          doc.text('ALINARE — Contas a Receber', 10, 9)
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(200, 200, 200)
          const resumo = cards ? `Total ${fMoeda(cards.total)}  |  Recebido ${fMoeda(cards.concluido)}  |  Pendente ${fMoeda(cards.pendente)}` : ''
          doc.text(`${resumo}   |   ${rows.length} contas`, 10, 15)
          doc.text(`Gerado em ${geradoEm}`, W - 10, 9, { align: 'right' })
        },
      })

      doc.save(`Alinare_Contas_a_Receber_${stamp}.pdf`)
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
        <span style={{ padding: '2px 8px', borderRadius: 4, background: '#2d0a0a', border: '1px solid #7f1d1d', color: '#f87171', fontSize: 11 }}>
          ⚠ {erro}
        </span>
      )}
    </div>
  )
}
