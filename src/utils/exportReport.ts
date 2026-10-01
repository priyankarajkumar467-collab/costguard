import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AnalysisResponse, ResourceCostDetail } from '../types';
import { resolveCostCenter, formatResourceType } from '../components/CostImpactTab';

/**
 * Format currency for PDF output avoiding non-ASCII font glyph encoding errors.
 */
function formatPdfCurrency(amount: number | null | undefined, options: { showSign?: boolean } = {}): string {
  if (amount === null || amount === undefined || isNaN(amount)) return 'INR 0';
  const { showSign = false } = options;
  const isNeg = amount < 0;
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(abs);

  if (isNeg) return `-INR ${formatted}`;
  if (showSign && amount > 0) return `+INR ${formatted}`;
  return `INR ${formatted}`;
}

/**
 * Clean and escape string for CSV
 */
function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Export Cost Analysis as CSV file.
 * Adds UTF-8 BOM (\uFEFF) for immediate compatibility with Excel and Google Sheets.
 */
export function exportCostAnalysisToCSV(
  analysis: AnalysisResponse,
  options?: {
    customResources?: ResourceCostDetail[];
    filterLabel?: string;
  }
) {
  const resourcesToExport = options?.customResources || analysis.resource_details;
  const rows: string[] = [];

  // Metadata & Summary Header Block
  rows.push(['# CostGuard Infrastructure Cost Impact Analysis Report'].map(escapeCsv).join(','));
  rows.push(['# Exported At', new Date().toISOString()].map(escapeCsv).join(','));
  if (options?.filterLabel) {
    rows.push(['# Active Filter', options.filterLabel].map(escapeCsv).join(','));
  }
  rows.push(['# Currency', analysis.financial_summary?.currency || 'INR'].map(escapeCsv).join(','));
  rows.push(
    ['# Baseline Monthly Total', analysis.financial_summary.prior_monthly_total].map(escapeCsv).join(',')
  );
  rows.push(
    ['# Projected Monthly Total', analysis.financial_summary.projected_monthly_total].map(escapeCsv).join(',')
  );
  rows.push(
    ['# Net Monthly Impact', analysis.financial_summary.net_monthly_impact].map(escapeCsv).join(',')
  );
  rows.push(
    ['# Annualized Impact', analysis.financial_summary.annualized_impact].map(escapeCsv).join(',')
  );
  rows.push(
    [
      '# Policy Verdict',
      analysis.policy_verdict.status,
      analysis.policy_verdict.summary_message,
    ]
      .map(escapeCsv)
      .join(',')
  );
  rows.push(''); // Empty line before table data

  // CSV Column Headers
  const headers = [
    'Resource Address',
    'Resource Name',
    'Resource Type',
    'Cost Center / Dept',
    'Attribution Category',
    'Action',
    'SKU',
    'Region',
    'Status',
    'Current Hourly Cost (INR)',
    'Projected Hourly Cost (INR)',
    'Current Monthly Cost (INR)',
    'Projected Monthly Cost (INR)',
    'Net Monthly Impact (INR)',
    'All Tags',
    'Notes',
  ];
  rows.push(headers.map(escapeCsv).join(','));

  // Resource Data Rows
  for (const r of resourcesToExport) {
    const costCenter = resolveCostCenter(r.tags);
    const shortName = r.address.split('.').pop() || r.address;
    const formattedTags = r.tags
      ? Object.entries(r.tags)
          .map(([k, v]) => `${k}=${v}`)
          .join('; ')
      : '';

    const row = [
      r.address,
      shortName,
      formatResourceType(r.resource_type),
      costCenter.name,
      costCenter.category,
      r.action,
      r.sku,
      r.region,
      r.status,
      r.old_hourly_cost,
      r.new_hourly_cost,
      r.old_monthly_cost,
      r.new_monthly_cost,
      r.delta_monthly_cost,
      formattedTags,
      r.note || '',
    ];
    rows.push(row.map(escapeCsv).join(','));
  }

  // Generate downloadable Blob with UTF-8 BOM
  const csvString = '\uFEFF' + rows.join('\r\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `costguard-analysis-report-${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export Cost Analysis as a formatted PDF report with executive summary and tables.
 */
export function exportCostAnalysisToPDF(
  analysis: AnalysisResponse,
  options?: {
    customResources?: ResourceCostDetail[];
    filterLabel?: string;
  }
) {
  const resourcesToExport = options?.customResources || analysis.resource_details;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const dateStr = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // 1. Top Header Banner
  doc.setFillColor(15, 23, 42); // Slate-900
  doc.rect(0, 0, pageWidth, 60, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text('CostGuard', 30, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text('Infrastructure Cost & Impact Analysis Report', 130, 35);

  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`Generated: ${dateStr}`, pageWidth - 30, 35, { align: 'right' });

  let cursorY = 75;

  // 2. Executive KPI Cards Banner
  const fin = analysis.financial_summary;
  const verdict = analysis.policy_verdict;
  const cardWidth = (pageWidth - 60 - 36) / 4;
  const cardHeight = 44;

  const kpis = [
    {
      title: 'Current Baseline',
      value: formatPdfCurrency(fin.prior_monthly_total),
      sub: 'per month',
      color: [255, 255, 255],
    },
    {
      title: 'Projected Spend',
      value: formatPdfCurrency(fin.projected_monthly_total),
      sub: 'per month',
      color: [99, 102, 241], // Indigo
    },
    {
      title: 'Net Monthly Impact',
      value: formatPdfCurrency(fin.net_monthly_impact, { showSign: true }),
      sub: `Annual: ${formatPdfCurrency(fin.annualized_impact, { showSign: true })}`,
      color: fin.net_monthly_impact > 0 ? [245, 158, 11] : [16, 185, 129], // Amber or Green
    },
    {
      title: 'Policy Compliance',
      value: verdict.status === 'PASSED' ? 'PASSED' : 'POLICY BLOCKED',
      sub: `Limit: ${formatPdfCurrency(verdict.budget_threshold)}`,
      color: verdict.status === 'PASSED' ? [16, 185, 129] : [239, 68, 68], // Green or Red
    },
  ];

  kpis.forEach((kpi, index) => {
    const x = 30 + index * (cardWidth + 12);
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.roundedRect(x, cursorY, cardWidth, cardHeight, 4, 4, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(kpi.title.toUpperCase(), x + 8, cursorY + 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, x + 8, cursorY + 26);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(kpi.sub, x + 8, cursorY + 38);
  });

  cursorY += cardHeight + 16;

  // Filter notice if applied
  if (options?.filterLabel) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(99, 102, 241);
    doc.text(`* Showing filtered resource view: ${options.filterLabel}`, 30, cursorY);
    cursorY += 12;
  }

  // 3. Tabular Cost Breakdown Table
  const tableData = resourcesToExport.map((r) => {
    const costCenter = resolveCostCenter(r.tags);
    const shortName = r.address.split('.').pop() || r.address;
    const isSkipped = r.status === 'SKIPPED';

    return [
      shortName,
      formatResourceType(r.resource_type),
      costCenter.name,
      r.action,
      r.sku,
      r.region,
      isSkipped ? '—' : formatPdfCurrency(r.old_monthly_cost),
      isSkipped ? '—' : formatPdfCurrency(r.new_monthly_cost),
      isSkipped ? 'SKIPPED' : formatPdfCurrency(r.delta_monthly_cost, { showSign: true }),
    ];
  });

  autoTable(doc, {
    startY: cursorY,
    head: [
      [
        'Resource Name',
        'Resource Type',
        'Cost Center / Dept',
        'Action',
        'SKU',
        'Region',
        'Current (mo)',
        'Projected (mo)',
        'Net Impact (mo)',
      ],
    ],
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 4,
      font: 'helvetica',
      textColor: [51, 65, 85],
    },
    headStyles: {
      fillColor: [30, 41, 59], // Slate-800
      textColor: [241, 245, 249],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 140, fontStyle: 'bold' },
      1: { cellWidth: 100 },
      2: { cellWidth: 90 },
      3: { cellWidth: 55, halign: 'center' },
      4: { cellWidth: 70 },
      5: { cellWidth: 55 },
      6: { cellWidth: 70, halign: 'right' },
      7: { cellWidth: 75, halign: 'right' },
      8: { cellWidth: 85, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 30, right: 30 },
    didDrawCell: (data) => {
      // Color-code the Net Impact column
      if (data.section === 'body' && data.column.index === 8) {
        const rawText = data.cell.text[0] || '';
        if (rawText.startsWith('+')) {
          doc.setTextColor(180, 83, 9); // Amber-700
        } else if (rawText.startsWith('-')) {
          doc.setTextColor(4, 120, 87); // Emerald-700
        }
      }
    },
  });

  // 4. Add Page Footers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);

    // Left footer
    doc.text('CostGuard FinOps Analysis Report - Confidential', 30, pageHeight - 15);
    // Right footer
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 30, pageHeight - 15, { align: 'right' });
  }

  // Trigger browser download
  const dateFile = new Date().toISOString().slice(0, 10);
  doc.save(`costguard-analysis-report-${dateFile}.pdf`);
}
