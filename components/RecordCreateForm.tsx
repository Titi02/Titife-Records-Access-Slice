'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRecordSchema } from '@/lib/validation/record';

interface FormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function RecordCreateForm({ onSuccess, onCancel }: FormProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; description?: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError(null);

    // Client-side Zod validation — see PRD 5.2, 7.5
    const validationResult = createRecordSchema.safeParse({ title, description });
    if (!validationResult.success) {
      const formatted = validationResult.error.format();
      setFieldErrors({
        title: formatted.title?._errors[0],
        description: formatted.description?._errors[0],
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validationResult.data),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setGeneralError('Rate limit exceeded. Please wait a moment before creating another record.');
        } else if (data.issues) {
          setGeneralError('Validation error on server. Please check your inputs.');
        } else {
          setGeneralError(data.error || 'Failed to create record');
        }
        setIsSubmitting(false);
        return;
      }

      if (onSuccess) {
        onSuccess();
      } else {
        // /records refreshes itself on mount — see RecordListRefresher
        router.push('/records');
      }
    } catch {
      setGeneralError('An unexpected network error occurred.');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {generalError && (
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
          {generalError}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="title" className="form-label">
          Title *
        </label>
        <input
          id="title"
          type="text"
          className="form-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter record title"
          disabled={isSubmitting}
        />
        {fieldErrors.title && <p className="form-error">{fieldErrors.title}</p>}
      </div>

      <div className="form-group">
        <label htmlFor="description" className="form-label">
          Description
        </label>
        <textarea
          id="description"
          rows={4}
          className="form-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional record description"
          disabled={isSubmitting}
        />
        {fieldErrors.description && (
          <p className="form-error">{fieldErrors.description}</p>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        {onCancel && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Record'}
        </button>
      </div>
    </form>
  );
}
