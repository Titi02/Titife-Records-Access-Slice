import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUserId } from '@/lib/auth/session';
import { getRecordByPublicId } from '@/lib/records/queries';

interface PageProps {
  params: Promise<{ publicId: string }>;
}

export default async function RecordDetailPage({ params }: PageProps) {
  const userId = await getCurrentUserId();
  const { publicId } = await params;

  // Scoped query by ownerId + publicId together — see PRD 7.1
  const record = await getRecordByPublicId(userId, publicId);

  // Returns 404 identically for missing vs not-yours — see PRD 5.3, 7.5
  if (!record) {
    notFound();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/records" className="btn btn-ghost" style={{ marginBottom: '12px', paddingLeft: 0 }}>
            &larr; Back to Records
          </Link>
          <h1 className="page-title">{record.title}</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link
            href={`/records/${record.publicId}/delete`}
            className="btn btn-danger"
          >
            Delete Record
          </Link>
        </div>
      </div>

      <div
        className="record-card"
        style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '16px' }}
      >
        <div>
          <h3 style={{ fontSize: '14px', color: 'var(--color-outline)', marginBottom: '4px' }}>
            Description
          </h3>
          <p style={{ fontSize: '16px', color: 'var(--color-on-surface)', whiteSpace: 'pre-wrap' }}>
            {record.description || 'No description provided.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '32px', borderTop: '1px solid var(--color-outline-varaint)', paddingTop: '16px', width: '100%' }}>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--color-outline)', display: 'block' }}>Created At</span>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>
              {new Date(record.createdAt).toLocaleString()}
            </span>
          </div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--color-outline)', display: 'block' }}>Last Updated</span>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>
              {new Date(record.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
