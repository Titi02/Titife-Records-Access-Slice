import Link from 'next/link';
import { getCurrentUserId } from '@/lib/auth/session';
import { getRecords } from '@/lib/records/queries';
import { RecordListRefresher } from '@/components/RecordListRefresher';

interface PageProps {
  searchParams: Promise<{ cursor?: string }>;
}

export default async function RecordsListPage({ searchParams }: PageProps) {
  const userId = await getCurrentUserId();
  const params = await searchParams;
  const { records, nextCursor } = await getRecords(userId, params.cursor);

  return (
    <div>
      <RecordListRefresher />
      <div className="page-header">
        <div>
          <h1 className="page-title">My Records</h1>
          <p className="page-subtitle">Scoped ownership access slice</p>
        </div>
        <Link href="/records/new" className="btn btn-primary">
          + Create Record
        </Link>
      </div>

      {records.length === 0 ? (
        /* Real distinct empty state — see PRD 5.1, 7.8, AGENTS.md rule 9 */
        <div className="empty-state">
          <svg
            className="empty-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          <h2 className="empty-title">No records found</h2>
          <p className="empty-desc">
            You don&apos;t have any records yet. Create your first record to get started.
          </p>
          <Link href="/records/new" className="btn btn-primary">
            + Create Record
          </Link>
        </div>
      ) : (
        <div>
          {records.map((record) => (
            <div key={record.publicId} className="record-card">
              <div className="record-info">
                <Link href={`/records/${record.publicId}`}>
                  <h2 className="record-title">{record.title}</h2>
                </Link>
                {record.description && (
                  <p className="record-desc">{record.description}</p>
                )}
                <div className="record-meta">
                  <span>
                    Created: {new Date(record.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="record-actions">
                <Link
                  href={`/records/${record.publicId}`}
                  className="btn btn-secondary"
                >
                  View
                </Link>
                <Link
                  href={`/records/${record.publicId}/delete`}
                  className="btn btn-danger"
                >
                  Delete
                </Link>
              </div>
            </div>
          ))}

          {nextCursor && (
            <div style={{ marginTop: '24px', textAlign: 'center' }}>
              <Link
                href={`/records?cursor=${nextCursor}`}
                className="btn btn-secondary"
              >
                Load More Records
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
