import { api } from './api';

export async function downloadReport(type: string) {
  const file = await api<{ filename: string; csv: string }>(`/market/export/${type}`);
  const blob = new Blob([file.csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(url);
}
