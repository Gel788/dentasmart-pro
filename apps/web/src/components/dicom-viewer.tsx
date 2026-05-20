'use client';

import { assetUrl } from '@/lib/api';

interface DicomViewerProps {
  fileUrl: string;
  title?: string;
  type: string;
}

export function DicomViewer({ fileUrl, title, type }: DicomViewerProps) {
  const src = assetUrl(fileUrl);
  const isImage = ['PHOTO', 'INTRAORAL', 'OPG'].includes(type);

  if (isImage) {
    return (
      <img src={src} alt={title ?? 'Снимок'} className="max-h-96 w-full rounded-lg object-contain bg-black" />
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-6 text-center">
      <p className="font-medium">{title ?? type}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {type === 'DICOM' || type === 'CT'
          ? 'DICOM/CT: локальный просмотр файла (без внешнего PACS). Скачайте для просмотра в DICOM-клиенте.'
          : 'Превью недоступно для этого формата.'}
      </p>
      <a href={src} download className="mt-4 inline-block text-[var(--accent)] underline">
        Скачать файл
      </a>
    </div>
  );
}
