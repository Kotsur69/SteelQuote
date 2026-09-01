// Eksport historii zmian cen bazowych PGL (HRS/CR/HDG) do pliku Excel (.xlsx).
// Wzorowane na exportZestawienieToExcel w lib/excelExport.ts — ten sam wzorzec:
// generacja arkusza po stronie klienta i pobranie przez XLSX.writeFile, bez roundtripu
// przez serwer po sam plik.

import * as XLSX from 'xlsx';
import { autoFitColumns } from './excelExport';
import type { PglPriceHistoryEntry } from '@/app/api/settings/pgl-history/route';

const HEADERS = ['Typ stali', 'Stara cena (€/t)', 'Nowa cena (€/t)', 'Zmiana (€/t)', 'Zmienił', 'Data zmiany'];

function buildRow(entry: PglPriceHistoryEntry): (string | number)[] {
  return [
    entry.steelType,
    entry.oldPrice,
    entry.newPrice,
    Number((entry.newPrice - entry.oldPrice).toFixed(2)),
    entry.changedByName || entry.changedByEmail || '',
    new Date(entry.changedAt).toLocaleString('pl-PL'),
  ];
}

// Buduje arkusz z historii zmian PGL i pobiera plik .xlsx w przeglądarce.
export function exportPglHistoryToExcel(history: PglPriceHistoryEntry[]): void {
  const rows = history.map(buildRow);
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  ws['!cols'] = autoFitColumns([HEADERS, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Historia PGL');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `historia_pgl_${stamp}.xlsx`);
}
