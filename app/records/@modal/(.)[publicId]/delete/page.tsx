'use client';

import React, { use } from 'react';
import { useRouter } from 'next/navigation';
import { RecordDeleteForm } from '@/components/RecordDeleteForm';

interface ModalProps {
  params: Promise<{ publicId: string }>;
}

export default function InterceptedDeleteModal({ params }: ModalProps) {
  const router = useRouter();
  const { publicId } = use(params);

  const handleClose = () => {
    router.back();
  };

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Delete Record</h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleClose}
            style={{ fontSize: '20px', padding: '4px 8px' }}
          >
            &times;
          </button>
        </div>

        <RecordDeleteForm
          publicId={publicId}
          // Redirect to /records per PRD 5.4; list freshness is handled by RecordListRefresher
          onSuccess={() => {
            router.push('/records');
          }}
          onCancel={handleClose}
        />
      </div>
    </div>
  );
}
