import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUserId } from '@/lib/auth/session';
import { getRecordByPublicId } from '@/lib/records/queries';
import { RecordDeleteForm } from '@/components/RecordDeleteForm';

interface PageProps {
  params: Promise<{ publicId: string }>;
}

export default async function DeleteConfirmationFullPage({ params }: PageProps) {
  const userId = await getCurrentUserId();
  const { publicId } = await params;

  // Scoped query by ownerId + publicId together — see PRD 7.1
  const record = await getRecordByPublicId(userId, publicId);

  // Returns 404 identically for missing vs not-yours — see PRD 5.3, 7.5
  if (!record) {
    notFound();
  }

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <Link href={`/records/${publicId}`} className="btn btn-ghost" style={{ marginBottom: '12px', paddingLeft: 0 }}>
            &larr; Back to Detail
          </Link>
          <h1 className="page-title">Delete Record</h1>
          <p className="page-subtitle">Confirm deletion of record</p>
        </div>
      </div>

      <div className="record-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <RecordDeleteForm publicId={publicId} />
      </div>
    </div>
  );
}
