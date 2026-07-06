import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Translations } from './translations';

export interface ClientInfo {
  firstName: string;
  lastName: string;
  company: string;
  address: string;
  nip: string;
  phone: string;
  email: string;
}

export interface ZestawienieItem {
  id: number;
  type: string;
  grade: string;
  thickness: number;
  width: number;
  length: number;
  sumaHuta: number;
  sumaSSC: number;
  marza: number;
  finalPrice: number;
  tons: number;
  totalValue: number;
  pgl: number;
  isCoil?: boolean;
}

export interface PDFData {
  offerName: string;
  offerId: number | null;
  clientInfo: ClientInfo;
  zestawienie: ZestawienieItem[];
  createdAt?: string;
}

export function generateOfferPDF(data: PDFData, t: Translations): void {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let yPos = margin;

  // Colors
  const primaryColor: [number, number, number] = [59, 142, 245]; // Blue accent
  const secondaryColor: [number, number, number] = [232, 160, 32]; // Orange/gold
  const textColor: [number, number, number] = [30, 35, 50];
  const mutedColor: [number, number, number] = [100, 110, 130];

  // Helper function for drawing text
  const drawText = (text: string, x: number, y: number, options?: {
    fontSize?: number;
    color?: [number, number, number];
    fontStyle?: 'normal' | 'bold' | 'italic';
    align?: 'left' | 'center' | 'right';
  }) => {
    const opts = {
      fontSize: 10,
      color: textColor,
      fontStyle: 'normal' as 'normal' | 'bold' | 'italic',
      align: 'left' as 'left' | 'center' | 'right',
      ...options
    };
    doc.setFontSize(opts.fontSize);
    doc.setTextColor(...opts.color);
    doc.setFont('helvetica', opts.fontStyle);
    doc.text(text, x, y, { align: opts.align });
  };

  // Header section with gradient effect (simulated with rectangle)
  doc.setFillColor(20, 30, 50);
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  // Company logo/branding
  doc.setFillColor(...primaryColor);
  doc.roundedRect(margin, 8, 30, 20, 3, 3, 'F');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('SSC', margin + 15, 21, { align: 'center' });

  // Company name
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('Steel Surcharge Calculator', margin + 38, 16);
  doc.setFontSize(9);
  doc.setTextColor(180, 190, 210);
  doc.text(t.pdf.companyInfo, margin + 38, 24);

  yPos = 45;

  // Offer info box (right side)
  const offerBoxX = pageWidth - margin - 65;
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(0.5);
  doc.roundedRect(offerBoxX, yPos - 5, 65, 30, 2, 2, 'S');
  
  // Offer details
  const offerNumber = data.offerId || Math.floor(Math.random() * 9000) + 1000;
  const currentDate = data.createdAt 
    ? new Date(data.createdAt).toLocaleDateString('pl-PL')
    : new Date().toLocaleDateString('pl-PL');
  
  drawText(`${t.pdf.offerNo}:`, offerBoxX + 5, yPos + 2, { fontSize: 8, color: mutedColor });
  drawText(`${offerNumber}`, offerBoxX + 5, yPos + 9, { fontSize: 14, fontStyle: 'bold', color: primaryColor });
  drawText(`${t.pdf.date}:`, offerBoxX + 5, yPos + 17, { fontSize: 8, color: mutedColor });
  drawText(currentDate, offerBoxX + 5, yPos + 22, { fontSize: 10 });

  // Client info section (left side)
  if (data.clientInfo.company || data.clientInfo.firstName || data.clientInfo.lastName) {
    doc.setFillColor(245, 247, 252);
    doc.roundedRect(margin, yPos - 5, 95, 35, 2, 2, 'F');
    
    drawText(t.pdf.to + ':', margin + 5, yPos + 2, { fontSize: 8, color: mutedColor });
    
    const clientName = [data.clientInfo.firstName, data.clientInfo.lastName].filter(Boolean).join(' ');
    if (clientName) {
      drawText(clientName, margin + 5, yPos + 9, { fontSize: 11, fontStyle: 'bold' });
    }
    if (data.clientInfo.company) {
      drawText(data.clientInfo.company, margin + 5, yPos + 15, { fontSize: 10 });
    }
    if (data.clientInfo.address) {
      drawText(data.clientInfo.address, margin + 5, yPos + 21, { fontSize: 9, color: mutedColor });
    }
    if (data.clientInfo.email) {
      drawText(data.clientInfo.email, margin + 5, yPos + 27, { fontSize: 9, color: primaryColor });
    }
  }

  yPos = 88;

  // Reference/Title line
  doc.setDrawColor(...secondaryColor);
  doc.setLineWidth(1);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  
  yPos += 8;
  const offerTitle = data.offerName || `Steel Quotation Q${new Date().getFullYear()}`;
  drawText(`REF: ${offerTitle}`, margin, yPos, { fontSize: 11, fontStyle: 'bold' });
  
  yPos += 12;

  // Items table
  if (data.zestawienie.length > 0) {
    const tableData = data.zestawienie.map((item, idx) => [
      (idx + 1).toString(),
      item.grade,
      item.thickness.toFixed(2),
      item.width.toFixed(0),
      item.isCoil ? 'COIL' : item.length.toFixed(0),
      item.tons.toFixed(2),
      item.finalPrice.toFixed(2),
      item.isCoil ? item.type + ' (Coil)' : item.type
    ]);

    // Calculate totals
    const totalTons = data.zestawienie.reduce((sum, item) => sum + item.tons, 0);
    const totalValue = data.zestawienie.reduce((sum, item) => sum + item.totalValue, 0);

    // Use ASCII-friendly column headers to avoid font encoding issues
    const headers = [
      'Lp.',
      'Grade / Gatunek',
      'Th (mm)',
      'W (mm)',
      'L (mm)',
      'Qty [T]',
      'EUR/T',
      'Type'
    ];

    autoTable(doc, {
      startY: yPos,
      head: [headers],
      body: tableData,
      foot: [[
        '',
        'TOTAL',
        '',
        '',
        '',
        totalTons.toFixed(2) + ' T',
        totalValue.toFixed(2) + ' €',
        ''
      ]],
      theme: 'plain',
      styles: {
        fontSize: 9,
        cellPadding: 3,
        textColor: textColor,
        lineColor: [200, 210, 230],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [30, 35, 50],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      footStyles: {
        fillColor: [245, 247, 252],
        textColor: primaryColor,
        fontStyle: 'bold',
        fontSize: 10,
      },
      alternateRowStyles: {
        fillColor: [250, 251, 254],
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { cellWidth: 35 },
        2: { halign: 'right', cellWidth: 20 },
        3: { halign: 'right', cellWidth: 20 },
        4: { halign: 'right', cellWidth: 20 },
        5: { halign: 'right', cellWidth: 22 },
        6: { halign: 'right', cellWidth: 25 },
        7: { cellWidth: 'auto' },
      },
      margin: { left: margin, right: margin },
    });

    // Get the final Y position after table
    yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
  }

  // Terms and conditions section
  if (yPos < pageHeight - 80) {
    doc.setDrawColor(200, 210, 230);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    
    yPos += 8;
    drawText('Offer Terms / Warunki oferty:', margin, yPos, { fontSize: 10, fontStyle: 'bold', color: mutedColor });
    
    yPos += 7;
    // Use ASCII-friendly terms to avoid font encoding issues
    const terms = [
      'Quotation valid: 48h',
      'Payment terms: 30 days from sale date',
      'Delivery: after confirmation of material availability',
      'Minimum quantity: 5 tons per item',
    ];
    
    terms.forEach((term, i) => {
      drawText(`- ${term}`, margin + 3, yPos + (i * 5), { fontSize: 8, color: mutedColor });
    });
    
    yPos += terms.length * 5 + 10;
  }

  // Footer
  const footerY = pageHeight - 25;
  doc.setDrawColor(...secondaryColor);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
  
  drawText('Best regards / Z powazaniem,', margin, footerY, { fontSize: 9, fontStyle: 'italic', color: mutedColor });
  drawText('SSC Distribution Solutions Poland Sp. z o.o.', margin, footerY + 5, { fontSize: 8, color: mutedColor });
  
  // Page number
  drawText(`${1} / ${1}`, pageWidth - margin, footerY + 5, { fontSize: 8, color: mutedColor, align: 'right' });

  // Client contact info in footer (if NIP provided)
  if (data.clientInfo.nip) {
    drawText(`NIP: ${data.clientInfo.nip}`, pageWidth - margin - 50, footerY, { fontSize: 8, color: mutedColor });
  }

  // Save the PDF
  const fileName = data.offerName 
    ? `oferta_${data.offerName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
    : `oferta_${offerNumber}.pdf`;
  doc.save(fileName);
}
