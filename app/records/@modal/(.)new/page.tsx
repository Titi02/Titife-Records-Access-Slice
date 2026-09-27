'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { RecordCreateForm } from '@/components/RecordCreateForm';

export default function InterceptedCreateModal() {
  const router = useRouter();

  const handleClose = () => {
    router.back();
  };

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Create Record</h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleClose}
            style={{ fontSize: '20px', padding: '4px 8px' }}
          >
            &times;
          </button>
        </div>

        <RecordCreateForm
          onSuccess={() => {
            // /records refreshes itself on mount — avoid racing refresh against this back-navigation
            router.back();
          }}
          onCancel={handleClose}
        />
      </div>
    </div>
  );
}
