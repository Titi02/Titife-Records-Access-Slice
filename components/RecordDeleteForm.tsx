'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DeleteFormProps {
  publicId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function RecordDeleteForm({ publicId, onSuccess, onCancel }: DeleteFormProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/records/${publicId}/delete`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to delete record');
        setIsDeleting(false);
        return;
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/records');
        router.refresh();
      }
    } catch {
      setError('An unexpected network error occurred.');
      setIsDeleting(false);
    }
  };

  return (
    <div>
      {error && (
        <div
          style={{
            padding: '12px',
            backgroundColor: 'var(--color-error-container)',
            color: 'var(--color-on-error-container)',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      <p style={{ marginBottom: '24px', color: 'var(--color-on-surface-variant-c)' }}>
        Are you sure you want to delete this record? This action will permanently remove the record and write an immutable deletion audit log.
      </p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel || (() => router.back())}
          disabled={isDeleting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? 'Deleting...' : 'Delete Permanently'}
        </button>
      </div>
    </div>
  );
}
